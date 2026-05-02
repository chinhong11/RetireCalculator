// Cache version — bump this string on any breaking change to force a full
// cache wipe on the next SW activation.
const CACHE = "retire-v3";

// ─── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(["/", "/index.html"]).catch(() => {}))
  );
  // Activate immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

// ─── Activate: delete every cache that isn't the current version ───────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  // Take control of all existing clients without a reload.
  self.clients.claim();
});

// ─── Fetch: tiered caching strategy ────────────────────────────────────────
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Let cross-origin requests (fonts, FX API, Yahoo proxy) pass through.
  if (url.origin !== self.location.origin) return;

  // ① HTML — always network-first so app updates are picked up immediately.
  //   Falls back to cache only when fully offline.
  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // ② Vite hashed assets — the hash in the filename is a content hash, so
  //   these files are immutable.  Cache-first is safe and fast.
  if (/\.[0-9a-f]{8,}\.(js|css|woff2?)(\?.*)?$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // ③ Everything else (manifest.json, icon.svg, sw.js itself, etc.) —
  //   network-first with cache fallback.
  e.respondWith(networkFirst(e.request));
});

// ─── Helpers ────────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
