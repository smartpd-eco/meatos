import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexPage, scanPage, imagePipeline] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../scan.html", import.meta.url), "utf8"),
  readFile(new URL("../src/data/ocr-image-pipeline.js", import.meta.url), "utf8")
]);

assert.match(indexPage, /meatos_pending_source/);
assert.match(indexPage, /cam \? "camera" : "file"/);
assert.match(indexPage, /const MAX = 1800/);
assert.match(indexPage, /toDataURL\("image\/jpeg", 0\.84\)/);
assert.match(scanPage, /sourceType === "camera"/);
assert.match(scanPage, /maxDimension: 1800/);
assert.match(scanPage, /jpegQuality: 0\.84/);
assert.match(scanPage, /performanceTiming/);
assert.match(scanPage, /Gemini 처리/);
assert.match(scanPage, /TIMEOUT_MS = 75000/);
assert.match(scanPage, /AUTO_OVERWRITE_DISABLED/);
assert.doesNotMatch(scanPage, /const zoomedResult = await applySmartZoomToResult/);
assert.doesNotMatch(scanPage, /RESULT_STABILIZER/);
assert.match(imagePipeline, /COLOR_GRID_SEPARATION_PRESERVED/);
assert.match(imagePipeline, /encodedSizeBytes/);
assert.doesNotMatch(imagePipeline, /buildOcrPreprocessingVariants/);

console.log("Camera OCR fast path, color preservation, and automatic overwrite guards passed.");
