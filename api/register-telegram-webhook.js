module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Use GET");
  const key = req.query.key;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !token || !key || key !== secret) return res.status(401).json({ ok:false, error:"Unauthorized or missing env vars" });
  const webhookUrl = "https://" + req.headers.host + "/api/telegram";
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        url:webhookUrl,
        secret_token:secret,
        allowed_updates:["business_message"]
      })
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 502).json(data);
  } catch(e) { return res.status(500).json({ok:false,error:"Webhook registration failed"}); }
};