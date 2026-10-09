import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] || null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
await import("../src/data/invoice-result-stabilizer.js");
const stabilizer = globalThis.MEATOS_INVOICE_RESULT_STABILIZER;

const unstableResponse = {
  ok: true,
  result: {
    documentFields: { supplierName: "(\uC8FC)\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5" },
    lineItems: [
      item(1, "\uB4B7\uB2E4\uB9AC\uC0B4", 36, 5300, 190800),
      item(2, "\uC548\uC2EC", 5.8, 31000, 179800),
      item(3, "\uAC00\uBE0C\uB9AC\uC0B4", 10.3, 7700, 79310),
      item(4, "\uC55E\uB2E4\uB9AC\uC0B4", 105.1, 9300, 977430),
      item(5, "\uC0BC\uACB9\uC0B4", 38.4, 19800, 760320),
      item(6, "\uC0BC\uACB9\uC0B4", 55.3, 19800, 1094940)
    ]
  }
};

const first = stabilizer.stabilizeResponse(unstableResponse, { imageHash: "same-image" });
assert.equal(first.result.lineItems.length, 6);
assert.deepEqual(first.result.lineItems.map((row) => row.rawProductName), [
  "\uBBF8\uBC15 \uB4B7\uB2E4\uB9AC\uC0B4",
  "\uAC00\uBE0C\uB9AC\uC0B4",
  "\uC548\uC2EC",
  "\uBBF8\uBC15 \uC55E\uB2E4\uB9AC\uC0B4",
  "\uC0BC\uACB9\uC0B4",
  "\uC0BC\uACB9\uC0B4"
]);
assert.equal(stabilizer.isFullyEvidenceBound(first.result), true);

for (let run = 0; run < 10; run += 1) {
  assert.deepEqual(stabilizer.getCached("same-image"), first);
}

const unknown = structured("\uB2E4\uB978\uACF5\uAE09\uCC98", [item(1, "\uC548\uC2EC", 5.8, 31000, 179800)]);
const untouched = stabilizer.stabilizeResponse(unknown, { imageHash: "unknown-image" });
assert.equal(untouched.result.lineItems[0].rawProductName, "\uC548\uC2EC");
assert.equal(stabilizer.isFullyEvidenceBound(untouched.result), false);
assert.equal(stabilizer.getCached("unknown-image"), null);

const smartZoomVerified = structured("(주)좋은축산유통", [{
  ...item(1, "냉장 항정(장터)", 36, 5300, 190800),
  correctionSource: "SMART_ZOOM_CORRECTED"
}]);
const smartZoomPreserved = stabilizer.stabilizeResponse(smartZoomVerified);
assert.equal(smartZoomPreserved.result.lineItems[0].rawProductName, "냉장 항정(장터)");

const scanPage = await readFile(new URL("../scan.html", import.meta.url), "utf8");
assert.doesNotMatch(scanPage, /RESULT_STABILIZER/);
assert.doesNotMatch(scanPage, /getCached\(imageHash\)/);
assert.doesNotMatch(scanPage, /learnConfirmedPages\(PAGES\)/);
assert.match(scanPage, /prepareFirstPassResult/);
assert.match(scanPage, /AUTO_OVERWRITE_DISABLED/);
assert.match(scanPage, /preprocessedImageHash/);
assert.doesNotMatch(scanPage, /td\.ocr-review-cell[^}]*box-shadow/s);
assert.doesNotMatch(scanPage, /td\.ocr-review-cell[^}]*font-weight/s);

console.log("Invoice same-image 10-run cache, supplier numeric evidence, and review styling checks passed.");

function item(rowNo, rawProductName, quantity, unitPrice, supplyAmount) {
  return { rowNo, rawProductName, quantity, unitPrice, supplyAmount, confidence: 70, uncertainFields: ["rawProductName"] };
}

function structured(supplierName, lineItems) {
  return { ok: true, result: { documentFields: { supplierName }, lineItems } };
}
