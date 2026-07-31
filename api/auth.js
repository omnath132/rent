/* Google sign-in + whitelist.
   - POST { credential }            → verify Google ID token, check whitelist, mint session
   - GET  (Authorization: Bearer)   → who am I + the whitelist
   - POST { action:"whitelist", email, person }   → add/update someone (signed-in users only)
   - POST { action:"unwhitelist", email }         → remove someone (seed email can't be removed)
*/

const crypto = require("crypto");

const ACL_KEY = "rent-tracker-acl";
const SESS_PREFIX = "rent-tracker-sess:";
const SESS_TTL = 60 * 60 * 24 * 60;                 // 60 days
const SEED_ACL = { "skaplins@andrew.cmu.edu": "Simon" };   // always whitelisted

function redisCfg() {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return base && token ? { base, headers: { Authorization: `Bearer ${token}` } } : null;
}
async function rGet(cfg, key) {
  const r = await fetch(`${cfg.base}/get/${encodeURIComponent(key)}`, { headers: cfg.headers });
  const j = await r.json();
  return j.result ?? null;
}
async function rSet(cfg, key, value, ttl) {
  const url = `${cfg.base}/set/${encodeURIComponent(key)}${ttl ? `?EX=${ttl}` : ""}`;
  await fetch(url, { method: "POST", headers: cfg.headers, body: value });
}

async function getAcl(cfg) {
  let acl = {};
  try { acl = JSON.parse((await rGet(cfg, ACL_KEY)) || "{}"); } catch {}
  return { ...SEED_ACL, ...acl };
}
async function sessionEmail(cfg, req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  return await rGet(cfg, SESS_PREFIX + m[1]);
}

module.exports = async function handler(req, res) {
  const cfg = redisCfg();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!cfg || !clientId) {
    return res.status(503).json({ error: "auth not configured" });
  }

  if (req.method === "GET") {
    /* public: the sign-in page asks which Google client id to use */
    if (req.query && req.query.config) {
      return res.status(200).json({ clientId });
    }
    const email = await sessionEmail(cfg, req);
    if (!email) return res.status(401).json({ error: "not signed in" });
    const acl = await getAcl(cfg);
    return res.status(200).json({ email, person: acl[email] || null, acl });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const body = req.body || {};

  /* ---- sign in with a Google ID token ---- */
  if (body.credential) {
    const v = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.credential)}`);
    if (!v.ok) return res.status(401).json({ error: "bad google token" });
    const info = await v.json();
    if (info.aud !== clientId || info.email_verified !== "true") {
      return res.status(401).json({ error: "bad google token" });
    }
    const email = String(info.email).toLowerCase();
    const acl = await getAcl(cfg);
    if (!acl[email]) {
      return res.status(403).json({ error: "not whitelisted", email });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await rSet(cfg, SESS_PREFIX + token, email, SESS_TTL);
    return res.status(200).json({ token, email, person: acl[email], acl });
  }

  /* ---- whitelist management (must be signed in) ---- */
  const email = await sessionEmail(cfg, req);
  if (!email) return res.status(401).json({ error: "not signed in" });

  if (body.action === "whitelist") {
    const target = String(body.email || "").toLowerCase().trim();
    const person = String(body.person || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target) || !person) {
      return res.status(400).json({ error: "need a valid email and a person" });
    }
    let stored = {};
    try { stored = JSON.parse((await rGet(cfg, ACL_KEY)) || "{}"); } catch {}
    stored[target] = person;
    await rSet(cfg, ACL_KEY, JSON.stringify(stored));
    return res.status(200).json({ acl: { ...SEED_ACL, ...stored } });
  }

  if (body.action === "unwhitelist") {
    const target = String(body.email || "").toLowerCase().trim();
    if (SEED_ACL[target]) return res.status(400).json({ error: "can't remove the seed email" });
    let stored = {};
    try { stored = JSON.parse((await rGet(cfg, ACL_KEY)) || "{}"); } catch {}
    delete stored[target];
    await rSet(cfg, ACL_KEY, JSON.stringify(stored));
    return res.status(200).json({ acl: { ...SEED_ACL, ...stored } });
  }

  return res.status(400).json({ error: "unknown action" });
};
