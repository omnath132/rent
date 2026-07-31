/* Vercel serverless function: GET/POST the shared tracker state.
   Storage: Upstash Redis (free) added via the Vercel Marketplace —
   the env vars below are created automatically when you add it. */

const KEY = "rent-tracker-state";

module.exports = async function handler(req, res) {
  const base =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!base || !token) {
    return res.status(503).json({ error: "storage not configured" });
  }
  const headers = { Authorization: `Bearer ${token}` };

  /* When Google auth is configured, every request needs a valid session. */
  if (process.env.GOOGLE_CLIENT_ID) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    let email = null;
    if (m) {
      const r = await fetch(`${base}/get/${encodeURIComponent("rent-tracker-sess:" + m[1])}`,
        { headers });
      email = (await r.json()).result ?? null;
    }
    if (!email) return res.status(401).json({ error: "sign in required" });
  }

  if (req.method === "GET") {
    const r = await fetch(`${base}/get/${KEY}`, { headers });
    const j = await r.json();
    const state = j.result ? JSON.parse(j.result) : { bills: {}, payments: [] };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(state);
  }

  if (req.method === "POST") {
    const body = req.body;
    if (
      !body || typeof body !== "object" ||
      typeof body.bills !== "object" || body.bills === null ||
      !Array.isArray(body.payments)
    ) {
      return res.status(400).json({ error: "expected { bills: {}, payments: [] }" });
    }
    const value = JSON.stringify({ bills: body.bills, payments: body.payments });
    if (value.length > 200_000) {
      return res.status(413).json({ error: "state too large" });
    }
    const r = await fetch(`${base}/set/${KEY}`, {
      method: "POST",
      headers,
      body: value,
    });
    if (!r.ok) return res.status(502).json({ error: "storage write failed" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
