/* Vercel Edge Middleware: nothing on the site is served without a valid
   session — not the app, not data.js. Runs before the CDN cache.
   Allowed without sign-in: /signin.html, /styles.css, /api/* (the API
   functions do their own auth). Does nothing until GOOGLE_CLIENT_ID is set. */

export const config = {
  matcher: ["/((?!api/|signin\\.html|styles\\.css|favicon).*)"],
};

export default async function middleware(req) {
  if (!process.env.GOOGLE_CLIENT_ID) return;          // auth disabled → open site

  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) return;                        // no store → can't gate

  const m = /(?:^|;\s*)rt_sess=([a-f0-9]{64})/.exec(req.headers.get("cookie") || "");
  if (m) {
    try {
      const r = await fetch(`${base}/get/${encodeURIComponent("rent-tracker-sess:" + m[1])}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j.result) return;                           // valid session → serve the page
    } catch {}
  }
  return Response.redirect(new URL("/signin.html", req.url), 302);
}
