import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SMART_ZOOM_CONFIG,
  boundingBoxOverlapRatio,
  cacheSmartZoom,
  getCachedSmartZoom,
  initializeSmartZoomFields,
  mappingDecision,
  mergeSmartZoomResult,
  selectSmartZoomTargets,
  shouldTriggerSmartZoom,
  smartZoomCacheKey
} from "../src/data/ocr-smart-zoom.js";

const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.08 };

const corrected = mergeSmartZoomResult({
  rowNo: 1,
  rawProductName: "냉장 항정(장티)",
  confidence: 78,
  readConfidence: 0.78,
  readStatus: "PARTIAL",
  boundingBox: box,
  uncertainFields: ["rawProductName"]
}, {
  rawProductName: "냉장 항정(장터)",
  readConfidence: 0.97,
  uncertainCharacters: [],
  readStatus: "READABLE"
});
assert.equal(corrected.rawProductNameFirstPass, "냉장 항정(장티)");
assert.equal(corrected.rawProductNameZoomPass, "냉장 항정(장터)");
assert.equal(corrected.rawProductNameFinal, "냉장 항정(장티)");
assert.equal(corrected.rawProductName, "냉장 항정(장티)");
assert.equal(corrected.smartZoomSuggestion, "냉장 항정(장터)");
assert.equal(corrected.correctionSource, "SMART_ZOOM_SUGGESTED");
assert.equal(corrected.reviewRequired, true);

const normal = initializeSmartZoomFields({ rawProductName: "냉장 오겹살", readConfidence: 0.97, readStatus: "READABLE", boundingBox: box, uncertainFields: [] });
assert.equal(shouldTriggerSmartZoom(normal, { candidateFound: true, topScore: 96, secondScore: 30 }), false);

const unresolved = mergeSmartZoomResult({ rawProductName: "냉장 항정(장티)", readConfidence: 0.7, readStatus: "PARTIAL", boundingBox: box }, {
  rawProductName: "냉장 항정(장?)",
  readConfidence: 0.62,
  uncertainCharacters: ["터"],
  readStatus: "PARTIAL"
});
assert.equal(unresolved.correctionSource, "SMART_ZOOM_UNRESOLVED");
assert.equal(unresolved.reviewRequired, true);
assert.equal(unresolved.uncertainFields.includes("rawProductName"), true);

const tenRows = Array.from({ length: 10 }, (_, index) => ({
  rowNo: index + 1,
  rawProductName: index === 4 ? "냉장 항정(장티)" : `정상상품${index + 1}`,
  readConfidence: index === 4 ? 0.72 : 0.98,
  readStatus: index === 4 ? "PARTIAL" : "READABLE",
  boundingBox: { ...box, y: Math.min(0.9, 0.02 + index * 0.08) },
  uncertainFields: index === 4 ? ["rawProductName"] : []
}));
const mappings = tenRows.map(() => ({ candidateFound: true, topScore: 98, secondScore: 40 }));
assert.equal(selectSmartZoomTargets(tenRows, mappings).length, 1);
assert.equal(selectSmartZoomTargets(tenRows, mappings)[0].index, 4);

const manyUncertain = tenRows.map((row) => ({ ...row, readConfidence: 0.5, readStatus: "PARTIAL" }));
assert.equal(selectSmartZoomTargets(manyUncertain, mappings).length, SMART_ZOOM_CONFIG.maxCellsPerDocument);

const duplicatedBoxes = [
  { ...manyUncertain[0], rowNo: 1, boundingBox: box },
  { ...manyUncertain[1], rowNo: 2, boundingBox: { ...box } }
];
assert.equal(boundingBoxOverlapRatio(duplicatedBoxes[0].boundingBox, duplicatedBoxes[1].boundingBox), 1);
assert.equal(selectSmartZoomTargets(duplicatedBoxes, mappings).length, 0);

const cacheKey = smartZoomCacheKey("image-hash", box, "gemini-flash");
const cachedValue = { result: { rawProductName: "냉장 항정(장터)" } };
for (let index = 0; index < 5; index += 1) {
  if (!getCachedSmartZoom(cacheKey)) cacheSmartZoom(cacheKey, cachedValue);
  assert.equal(getCachedSmartZoom(cacheKey), cachedValue);
}

assert.deepEqual(mappingDecision(92, 85), { status: "SUGGESTED", confidence: 0.92, gap: 0.07000000000000006 });
assert.equal(mappingDecision(95, 70).status, "AUTO_APPROVED");
assert.equal(mappingDecision(72, 10).status, "UNRESOLVED");

const [scanPage, edgeFunction] = await Promise.all([
  readFile(new URL("../scan.html", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/analyze-invoice/index.ts", import.meta.url), "utf8")
]);
assert.match(scanPage, /mode:\s*"smart_zoom"/);
assert.match(scanPage, /prepareFirstPassResult/);
assert.match(scanPage, /AUTO_OVERWRITE_DISABLED/);
assert.doesNotMatch(scanPage, /const zoomedResult = await applySmartZoomToResult/);
assert.match(scanPage, /미확정인.*재고에 자동 반영할 수 없습니다/);
assert.match(scanPage, /rawProductName:\s*sourceName/);
assert.match(edgeFunction, /callGeminiSmartZoom/);
assert.match(edgeFunction, /Do not standardize, normalize, complete, infer, repair, or guess/);
assert.doesNotMatch(edgeFunction, /boundingBox as normalized x, y, width, height/);

console.log("OCR Smart Zoom tests passed.");
