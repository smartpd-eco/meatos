const CACHE_NAME = "meatos-ai-scm-v4";
const RUNTIME_CACHE_NAME = "meatos-ai-scm-runtime-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./runtime-config.js",
  "./app.js",
  "./src/core/ai-engine.js",
  "./src/core/event-engine.js",
  "./src/core/inventory-engine.js",
  "./src/core/product-engine.js",
  "./src/data/alias-memory-store.js",
  "./src/data/learning-table-store.js",
  "./src/data/import-queue-store.js",
  "./src/data/source-registry.js",
  "./src/data/source-registry-store.js",
  "./src/data/ocr-dictionary-candidate-engine.js",
  "./src/data/ocr-dictionary-history-store.js",
  "./src/data/ocr-document-queue-store.js",
  "./src/data/ocr-product-candidate-store.js",
  "./src/data/ocr-provider-registry.js",
  "./src/data/ocr-image-pipeline.js",
  "./src/data/ocr-intake-policy.js",
  "./src/data/ocr-provider-adapter.js",
  "./src/data/ocr-provider-health-log-store.js",
  "./src/data/ocr-operation-log-store.js",
  "./src/data/ocr-failure-learning-store.js",
  "./src/data/ocr-supplier-template-store.js",
  "./src/data/supabase-health-check.js",
  "./src/data/supabase-health-log-store.js",
  "./src/data/supabase-db-adapter.js",
  "./src/data/supabase-public-config.js",
  "./src/data/supabase-rest-client.js",
  "./src/data/tenant-context.js",
  "./src/data/tenant-repository-helper.js",
  "./src/data/tenant-test-fixtures.js",
  "./src/data/good-chuksan-seed.js",
  "./src/data/good-chuksan-source-store.js",
  "./src/data/product-attribute-standard.js",
  "./src/data/mock-data.js",
  "./src/plugins/pos-adapter.js",
  "./services/product/product-catalog-service.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
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

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
        await runtimeCache.put(event.request, response.clone());
      }
      return response;
    })
  );
});
