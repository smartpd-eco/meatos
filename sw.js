const CACHE_NAME = "jeongyuk-biseo-v34";
const RUNTIME_CACHE_NAME = "jeongyuk-biseo-runtime-v34";
const ASSETS = [
  "./",
  "./index.html",
  "./scan.html",
  "./records.html",
  "./stock.html",
  "./alerts.html",
  "./policy.html",
  "./sanitation.html",
  "./sanitation-list.html",
  "./sales.html",
  "./purchases.html",
  "./settings.html",
  "./safety-stock.html",
  "./auto-order.html",
  "./fresh-stock-settings.html",
  "./fresh-stock-page.js",
  "./fresh-stock-settings.js",
  "./fresh-stock.css",
  "./login.html",
  "./sell.html",
  "./delivery-sales.html",
  "./connect.html",
  "./business-verify.html",
  "./header.js",
  "./styles.css",
  "./runtime-config.js",
  "./src/data/product-name-substitution.js",
  "./src/data/multi-page-invoice.js",
  "./src/data/sanitation-scoring.js",
  "./src/data/daily-briefing.js",
  "./src/data/fresh-stock-engine.js",
  "./manifest.webmanifest",
  "./icons/jeongyuk-biseo-logo.png",
  "./icons/jeongyuk-biseo-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(ASSETS.map((asset) => cache.add(asset))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first: always try the live deploy, fall back to cache only when
  // offline. Prevents stale app.js/HTML from being served after a new deploy
  // (the old cache-first strategy froze the app on outdated code).
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
          runtimeCache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw error;
      }
    })()
  );
});
