const CACHE_NAME = "meatos-ai-scm-v2";
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
  "./database/GOOD_CHUKSAN_SEED_DB.sql",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
