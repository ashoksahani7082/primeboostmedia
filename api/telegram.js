// Telegram Business webhook -> Meta Conversions API Subscribe
// Configure Vercel Environment Variables:
// TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, META_PIXEL_ID, META_CAPI_ACCESS_TOKEN
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "Telegram Business -> Meta CAPI", event: "Subscribe" });
  }
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = req.headers["x-telegram-bot-api-secret-token"];
  if (secret && supplied !== secret) return res.status(401).send("Unauthorized");

  const update = req.body || {};
  // Telegram Business Bot API sends business_message updates.
  const msg = update.business_message;
  if (!msg || !msg.business_connection_id || !msg.from || msg.from.is_bot) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.error("Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN");
    return res.status(500).json({ ok: false, error: "Meta CAPI env vars missing" });
  }

  const eventId = "tg_business_" + update.update_id;
  const telegramUserId = String(msg.from.id);
  const externalId = crypto.createHash("sha256").update(telegramUserId).digest("hex");

  const payload = {
    data: [{
      event_name: "Subscribe",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "chat",
      user_data: { external_id: [externalId] },
      custom_data: {
        messaging_channel: "telegram",
        business_connection_id: msg.business_connection_id
      }
    }]
  };

  try {
    const response = await fetch(
      "https://graph.facebook.com/v22.0/" + encodeURIComponent(pixelId) + "/events?access_token=" + encodeURIComponent(accessToken),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const result = await response.json();
    if (!response.ok || result.error) {
      console.error("Meta CAPI error", result);
      return res.status(502).json({ ok: false, meta: result });
    }
    console.log("Meta CAPI Subscribe sent", { eventId, updateId: update.update_id });
    return res.status(200).json({ ok: true, event: "Subscribe", eventId, meta: result });
  } catch (e) {
    console.error("CAPI request failed", e);
    return res.status(500).json({ ok: false });
  }
};
