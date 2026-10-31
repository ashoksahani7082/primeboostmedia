module.exports=async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({ok:false});
 const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
 const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token)return res.status(500).json({ok:false,error:"Redis env missing"});
 const {ref,...data}=req.body||{};
 if(!ref||!/^[a-zA-Z0-9_-]{8,100}$/.test(ref))return res.status(400).json({ok:false,error:"Invalid ref"});
 try{
  const response=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(["SET","pbm:adclick:"+ref,JSON.stringify(data),"EX",604800])});
  const result=await response.json();
  if(result.error)throw new Error(result.error);
  return res.status(200).json({ok:true});
 }catch(e){console.error("Redis attribution save failed",e.message);return res.status(500).json({ok:false});}
};