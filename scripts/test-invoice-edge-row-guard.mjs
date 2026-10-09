import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectRowAlignmentIssues, repairShiftedRowAlignment } from "../supabase/functions/_shared/invoice-row-validator.ts";

const correctSixRows = {
  documentFields: { printedLineCount: 6 },
  lineItems: [
    row(1, 36, 5300, 190800, "L12605256054002"),
    row(2, 5.8, 31000, 179800, "L12605186054004"),
    row(3, 10.3, 7700, 79310, "L12605256054001"),
    row(4, 105.1, 9300, 977430, "L12605196054001"),
    row(5, 38.4, 19800, 760320, "L12605256054001"),
    row(6, 55.3, 19800, 1094940, "L12605256054004")
  ]
};
assert.deepEqual(detectRowAlignmentIssues(correctSixRows), []);
assert.equal(
  correctSixRows.lineItems.reduce((sum, item) => sum + item.supplyAmount, 0),
  3282600
);

const duplicatedSevenRows = {
  documentFields: { printedLineCount: 6 },
  lineItems: [
    ...correctSixRows.lineItems.slice(0, 3),
    row(4, 10.3, 7700, 79310, "L12605256054001"),
    ...correctSixRows.lineItems.slice(3).map((item, index) => ({ ...item, rowNo: index + 5 }))
  ]
};
const duplicateIssues = detectRowAlignmentIssues(duplicatedSevenRows);
assert.ok(duplicateIssues.includes("PRINTED_LINE_COUNT_MISMATCH:6:7"));
assert.ok(duplicateIssues.includes("ADJACENT_ROW_VALUE_DUPLICATE:3:4"));

const shiftedSevenRows = {
  documentFields: { printedLineCount: 7 },
  reviewRequired: false,
  lineItems: [
    item(1, "미후지", "2 Box", 36, 5300, 190800, "L12605256054002"),
    item(2, "가브리", "1 Box", 34, 5300, 179800, "L12605186054004"),
    item(3, "안심", "1 Box", 5.8, 31000, 179800, "L12605256054001"),
    item(4, "미전지", "1 Box", 10.3, 7700, 79310, "L12605196054001"),
    item(5, "삼겹", "6 Box", 105.1, 9300, 977430, "L12605256054001"),
    item(6, "삼겹", "2 Box", 38.4, 19800, 760320, "L12605256054004"),
    item(7, "장삼겹", "3 Box", 55.3, 19800, 1094940, "L12605256054004")
  ]
};
const repaired = repairShiftedRowAlignment(shiftedSevenRows);
assert.equal(repaired.lineItems.length, 6);
assert.equal(repaired.documentFields.printedLineCount, 6);
assert.equal(repaired.rowAlignmentRepaired, true);
assert.equal(repaired.reviewRequired, true);
assert.equal(repaired.lineItems[1].rawProductName, "가브리");
assert.equal(repaired.lineItems[1].quantity, 5.8);
assert.equal(repaired.lineItems[5].rawProductName, "삼겹");
assert.equal(repaired.lineItems[5].supplyAmount, 1094940);
assert.equal(repaired.lineItems.reduce((sum, row) => sum + row.supplyAmount, 0), 3282600);
assert.deepEqual(detectRowAlignmentIssues(repaired), []);

const insertedDuplicateSevenRows = {
  documentFields: { printedLineCount: 7 },
  reviewRequired: false,
  lineItems: [
    item(1, "미후지", "2 Box", 36, 5300, 190800, "L12605256054002"),
    item(2, "가브리", "1 Box", 5.8, 31000, 179800, "L12605186054004"),
    item(3, "안심", "1 Box", 10.3, 7700, 79310, "L12605256054001"),
    item(4, "미박 앞다리살", "1 Box", 10.3, 7700, 79310, "L12605256054001"),
    item(5, "삼겹살", "6 Box", 105.1, 9300, 977430, "L12605196054001"),
    item(6, "삼겹살", "2 Box", 38.4, 19800, 760320, "L12605256054001"),
    item(7, "삼겹살", "3 Box", 55.3, 19800, 1094940, "L12605256054004")
  ]
};
const duplicateRepaired = repairShiftedRowAlignment(insertedDuplicateSevenRows);
assert.equal(duplicateRepaired.lineItems.length, 6);
assert.equal(duplicateRepaired.documentFields.printedLineCount, 6);
assert.equal(duplicateRepaired.rowAlignmentRepairReason, "INSERTED_DUPLICATE_NUMERIC_ROW");
assert.equal(duplicateRepaired.lineItems[3].rawProductName, "미박 앞다리살");
assert.equal(duplicateRepaired.lineItems[3].quantity, 105.1);
assert.equal(duplicateRepaired.lineItems[3].supplyAmount, 977430);
assert.equal(duplicateRepaired.lineItems.reduce((sum, row) => sum + row.supplyAmount, 0), 3282600);
assert.deepEqual(detectRowAlignmentIssues(duplicateRepaired), []);

const arithmeticMismatch = structured([row(1, 36, 5300, 180000, "L1")]);
assert.ok(detectRowAlignmentIssues(arithmeticMismatch).includes("ROW_ARITHMETIC_MISMATCH:1"));

const edgeFunction = await readFile(
  new URL("../supabase/functions/analyze-invoice/index.ts", import.meta.url),
  "utf8"
);
const scanPage = await readFile(new URL("../scan.html", import.meta.url), "utf8");
const imagePipeline = await readFile(new URL("../src/data/ocr-image-pipeline.js", import.meta.url), "utf8");
const intakePolicy = await readFile(new URL("../src/data/ocr-intake-policy.js", import.meta.url), "utf8");
const productEvidence = await readFile(new URL("../src/data/invoice-product-evidence.js", import.meta.url), "utf8");
assert.doesNotMatch(edgeFunction, /CORRECTION PASS/);
assert.doesNotMatch(edgeFunction, /analysisAttempts < 4/);
assert.match(edgeFunction, /let analysisAttempts = 1/);
assert.match(edgeFunction, /const GEMINI_MODEL = "gemini-3\.5-flash-lite"/);
assert.doesNotMatch(edgeFunction, /generationConfig:[\s\S]{0,80}temperature: 0/);
assert.match(edgeFunction, /thinkingConfig: \{ thinkingLevel: "minimal" \}/);
assert.match(edgeFunction, /maxOutputTokens: 8192/);
assert.doesNotMatch(edgeFunction, /MEDIA_RESOLUTION_MEDIUM/);
assert.match(edgeFunction, /stripDuplicatedOriginFromProductName/);
assert.doesNotMatch(edgeFunction, /NORMALIZED_BOUNDING_BOX_SCHEMA/);
assert.doesNotMatch(edgeFunction, /resolveGeminiModels/);
assert.doesNotMatch(edgeFunction, /\/v1beta\/models"/);
assert.match(edgeFunction, /isTransientHttpStatus/);
assert.match(edgeFunction, /isProviderConfigured\("gpt-4\.1"\)/);
assert.match(edgeFunction, /fallbackFrom/);
assert.match(edgeFunction, /OCR_TEMPORARILY_BUSY/);
assert.match(scanPage, /b\.userMessage/);
assert.doesNotMatch(scanPage, /"서버 오류 "\+res\.status/);
assert.match(edgeFunction, /uncertainFields/);
assert.match(edgeFunction, /printedLineCount/);
assert.match(scanPage, /processUploadedOcrImage/);
assert.match(scanPage, /evaluateOcrIntakeQuality/);
assert.match(scanPage, /requestInvoiceAnalysis\(dataUrl, imageQuality, imageHash\)/);
assert.doesNotMatch(scanPage, /requestInvoiceAnalysis\(dataUrl, 2\)/);
assert.match(scanPage, /ocr-review-cell/);
assert.doesNotMatch(scanPage, /invoice-result-stabilizer/);
assert.match(scanPage, /numeric<=1\?numeric\*100:numeric/);
assert.match(scanPage, /assessProductCellEvidence/);
assert.match(scanPage, /decideProductMapping/);
assert.match(productEvidence, /composeRawProductName/);
assert.match(productEvidence, /suggestion\.requiresConfirmation/);
assert.match(imagePipeline, /CONSERVATIVE_DOCUMENT_CROP/);
assert.match(imagePipeline, /RESIZE_LIMIT_\$\{maxDimension\}/);
assert.match(imagePipeline, /COLOR_GRID_SEPARATION_PRESERVED/);
assert.match(imagePipeline, /WEAK_SHADOW_LIFT/);
assert.match(intakePolicy, /qualityScore < 35/);

console.log("Invoice Edge Function row-count, duplicate, arithmetic, and retry guards passed.");

function row(rowNo, quantity, unitPrice, supplyAmount, traceOrImportNo) {
  return { rowNo, rawProductName: `테스트상품${rowNo}`, quantity, unitPrice, supplyAmount, traceOrImportNo };
}

function item(rowNo, rawProductName, unit, quantity, unitPrice, supplyAmount, traceOrImportNo) {
  return { rowNo, rawProductName, unit, quantity, unitPrice, supplyAmount, traceOrImportNo, confidence: 95 };
}

function structured(lineItems) {
  return { documentFields: { printedLineCount: lineItems.length }, lineItems };
}
