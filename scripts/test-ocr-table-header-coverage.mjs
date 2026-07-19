import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inferSupplierColumnLayout, STANDARD_INVOICE_COLUMN_KEYS } from "../src/data/ocr-table-reconstructor.js";

const standardHeaders = ["종류", "부위", "상품명", "등급", "상태", "단위", "수량", "단가", "공급가", "세액", "금액", "이력번호"];
const aliasHeaders = ["축종", "부위명칭", "품명", "육질등급", "보관상태", "U/M", "중량", "공급단가", "공급가액", "부가세", "합계금액", "수입이력번호"];
const legacyHeaders = ["상품명", "원산지", "단위", "수량", "단가", "공급가", "세액", "금액"];
const combinedHeaders = ["종류", "부위", "상품명및등급", "상태", "단위", "수량", "단가", "공급가", "세액", "금액", "이력번호"];

const standard = inferSupplierColumnLayout(makeLayoutInput(standardHeaders));
const aliases = inferSupplierColumnLayout(makeLayoutInput(aliasHeaders));
const legacy = inferSupplierColumnLayout(makeLayoutInput(legacyHeaders));
const combined = inferSupplierColumnLayout(makeLayoutInput(combinedHeaders));

assert.equal(STANDARD_INVOICE_COLUMN_KEYS.length, 12);
assert.equal(standard.requiredHeaderCoverage, 100);
assert.equal(standard.reviewRequired, false);
assert.equal(aliases.requiredHeaderCoverage, 100);
assert.equal(aliases.reviewRequired, false);
assert.equal(legacy.requiredHeaderCoverage, 58.33);
assert.deepEqual(legacy.missingRequiredColumns, ["species", "part", "grade", "condition", "traceOrImportNo"]);
assert.equal(combined.requiredHeaderCoverage, 91.67);
assert.ok(combined.missingRequiredColumns.includes("grade"));
assert.equal(combined.reviewRequired, true);

const result = {
  requiredHeaders: STANDARD_INVOICE_COLUMN_KEYS.length,
  standard: summarize(standard),
  commonAliases: summarize(aliases),
  legacyExternalLayout: summarize(legacy),
  combinedProductGradeHeader: summarize(combined),
  policy: "Any missing required header is REVIEW_REQUIRED; values are not guessed."
};
const outputDir = path.resolve("outputs/ocr-benchmark");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "table-header-coverage.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));

function makeLayoutInput(headers) {
  return {
    imageWidth: Math.max(1200, headers.length * 110),
    imageHeight: 800,
    items: headers.map((text, index) => ({
      text,
      confidence: 99,
      bounds: { minX: index * 110, minY: 100, maxX: index * 110 + 90, maxY: 142 }
    }))
  };
}

function summarize(layout) {
  return {
    detectedHeaderCount: layout.detectedHeaderCount,
    requiredHeaderCoverage: layout.requiredHeaderCoverage,
    missingRequiredColumns: layout.missingRequiredColumns,
    reviewRequired: layout.reviewRequired
  };
}
