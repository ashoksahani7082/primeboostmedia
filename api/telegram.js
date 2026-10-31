const crypto=require("crypto");
async function redis(command,url,token){
 const response=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(command)});
 const result=await response.json();if(result.error)throw new Error(result.error);return result.result;
}
module.exports=async(req,res)=>{
 if(req.method==="GET")return res.status(200).json({ok:true,service:"Telegram Business -> attributed Meta CAPI Subscribe"});
 if(req.method!=="POST")return res.status(405).send("Method not allowed");
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(secret&&req.headers["x-telegram-bot-api-secret-token"]!==secret)return res.status(401).send("Unauthorized");
 const update=req.body||{},msg=update.business_message;
 if(!msg||!msg.business_connection_id||!msg.from||msg.from.is_bot)return res.status(200).json({ok:true,ignored:true});
 const body=typeof msg.text==="string"?msg.text:(typeof msg.caption==="string"?msg.caption:"");
 const markerStart=String.fromCharCode(0x2063),markerEnd=String.fromCharCode(0x2064);
 const startIndex=body.indexOf(markerStart),endIndex=body.indexOf(markerEnd,startIndex+markerStart.length);
 let ref="";
 if(startIndex>=0&&endIndex>startIndex){
   const encoded=body.slice(startIndex+markerStart.length,endIndex);
   const zero=String.fromCharCode(0x200B),one=String.fromCharCode(0x200C);
   const bits=Array.from(encoded).map(ch=>ch===zero?"0":ch===one?"1":"").join("");
   if(bits&&bits.length%8===0){
     const bytes=[];
     for(let i=0;i<bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
     try{ref=Buffer.from(bytes).toString("utf8");}catch(e){ref="";}
   }
 }
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(ref))return res.status(200).json({ok:true,ignored:true,reason:"No valid hidden attribution reference"});
 const redisUrl=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,redisToken=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
 const pixelId=process.env.META_PIXEL_ID,accessToken=process.env.META_CAPI_ACCESS_TOKEN;
 if(!redisUrl||!redisToken||!pixelId||!accessToken)return res.status(500).json({ok:false,error:"Missing Redis/Meta env"});
 try{
  const key="pbm:adclick:"+ref,raw=await redis(["GET",key],redisUrl,redisToken);
  if(!raw)return res.status(200).json({ok:true,ignored:true,reason:"Attribution expired or not found"});
  const attribution=JSON.parse(raw);
  // Only count traffic carrying Meta click evidence (fbclid/fbc). Direct/organic is discarded.
  const hasMetaClick=typeof attribution.fbclid==="string"&&attribution.fbclid.length>0
    ||typeof attribution.fbc==="string"&&/^fb\\.1\\.\\d+\\.[^\\s]+$/.test(attribution.fbc);
  // Consume attribution once, regardless of source, to prevent duplicate processing.
  await redis(["DEL",key],redisUrl,redisToken);
  if(!hasMetaClick){
    console.log("Telegram Subscribe ignored: no Meta ad click evidence",{ref,updateId:update.update_id,source:"DIRECT_OR_ORGANIC"});
    return res.status(200).json({ok:true,ignored:true,reason:"No Meta ad click evidence",source:"DIRECT_OR_ORGANIC"});
  }
  const userData={external_id:[crypto.createHash("sha256").update(String(msg.from.id)).digest("hex")]};
  if(attribution.fbp)userData.fbp=attribution.fbp;
  if(attribution.fbc)userData.fbc=attribution.fbc;
  const eventId="pbm_subscribe_"+ref;
  const event={event_name:"Subscribe",event_time:Math.floor(Date.now()/1000),event_id:eventId,action_source:"chat",event_source_url:attribution.landing_url,user_data:userData,custom_data:{messaging_channel:"telegram",utm_source:attribution.utm_source||"",utm_campaign:attribution.utm_campaign||""}};
  const response=await fetch("https://graph.facebook.com/v22.0/"+encodeURIComponent(pixelId)+"/events?access_token="+encodeURIComponent(accessToken),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:[event]})});
  const result=await response.json();
  if(!response.ok||result.error){console.error("Meta CAPI error",result);return res.status(502).json({ok:false,meta:result});}
  console.log("Attributed Meta CAPI Subscribe sent",{eventId,ref,updateId:update.update_id});
  return res.status(200).json({ok:true,event:"Subscribe",attributed:true,eventId,meta:result});
 }catch(e){console.error("Attribution/CAPI failed",e.message);return res.status(500).json({ok:false});}
};