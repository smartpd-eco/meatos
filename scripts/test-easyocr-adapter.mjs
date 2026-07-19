import { readFileSync } from "node:fs";
import { createOcrProviderAdapter } from "../src/data/ocr-provider-adapter.js";

const image = readFileSync("test-assets/good-meat-invoice.jpg");
const imageDataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
const regions = [0, 1, 2, 3].map((index) => ({
  regionId: `adapter-row-${index + 1}`,
  sourceRowNo: index + 1,
  confidence: 60,
  text: "",
  bounds: {
    minX: 0,
    minY: 1331 + (173 * index),
    maxX: 3305,
    maxY: 1504 + (173 * index)
  }
}));
const adapter = createOcrProviderAdapter("easyocr-compare", {
  serviceUrl: "http://127.0.0.1:8765",
  timeoutMs: 60000
});
const input = {
  imageDataUrl,
  imageHash: "good-meat-invoice-selective-v1",
  qualityScore: 80,
  supplierName: "좋은축산",
  regions
};

const firstStartedAt = performance.now();
const first = await adapter.recognizeDocument(input);
const firstDurationMs = Math.round(performance.now() - firstStartedAt);
const cachedStartedAt = performance.now();
const cached = await adapter.recognizeDocument(input);
const cachedDurationMs = Math.round(performance.now() - cachedStartedAt);

console.log(JSON.stringify({
  provider: first.providerName,
  firstDurationMs,
  cachedDurationMs,
  providerProcessingMs: first.rawJson.processingMs,
  selectiveRegionCount: first.rawJson.regionResults.length,
  lineItemCount: first.lineItems.length,
  meatosScore: first.meatosScore,
  cacheStable: JSON.stringify(first.lineItems) === JSON.stringify(cached.lineItems)
}, null, 2));
