// Cloudflare Worker — Yahoo Finance price proxy
//
// Routes:
//   GET /price/:ticker   — returns the raw Yahoo Finance chart JSON for one symbol
//
// Edge cache: 5 minutes per symbol (shared across all users hitting the same PoP).
// CORS: open (*) so the Vite app can call it from any origin.
//
// Deploy:
//   npx wrangler deploy
//
// Set VITE_PRICE_PROXY_URL=https://<worker-name>.<subdomain>.workers.dev in your
// hosting environment so the React app routes through here instead of calling
// Yahoo directly from the browser.

const CACHE_TTL = 300; // seconds
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, _env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/price\/(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Usage: /price/:ticker" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const ticker = decodeURIComponent(match[1]);
    const upstreamUrl = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

    // Use the CF cache keyed on the upstream URL so all users share a warm entry.
    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl, { method: "GET" });

    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, {
        status: cached.status,
        headers: { ...Object.fromEntries(cached.headers), ...CORS_HEADERS, "X-Cache": "HIT" },
      });
      return hit;
    }

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: {
          // Some Yahoo endpoints require a browser-like UA; keep it generic.
          "User-Agent": "Mozilla/5.0 (compatible; retire-price-proxy/1.0)",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Upstream fetch failed", detail: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const body = await upstream.text();

    const response = new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        ...CORS_HEADERS,
        "X-Cache": "MISS",
      },
    });

    // Only cache successful responses.
    if (upstream.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
