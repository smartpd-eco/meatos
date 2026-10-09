import assert from "node:assert/strict";
import {
  assessProductCellEvidence,
  composeRawProductName,
  decideProductMapping
} from "../src/data/invoice-product-evidence.js";
import { detectProductCellIssues } from "../supabase/functions/_shared/invoice-row-validator.ts";

await import("../src/data/product-name-substitution.js");
const productNames = globalThis.MEATOS_PRODUCT_NAMES;

assert.equal(composeRawProductName("미후지(장터)", "냉장"), "냉장 미후지(장터)");
assert.equal(composeRawProductName("냉장 미후지(장터)", "냉장"), "냉장 미후지(장터)");

const exactEvidence = assessProductCellEvidence({
  rawProductName: "미후지(장터)", condition: "냉장", origin: "국내산"
});
assert.equal(exactEvidence.rawProductName, "냉장 미후지(장터)");
assert.deepEqual(exactEvidence.issues, []);

const exactSuggestion = productNames.suggest(exactEvidence.rawProductName, { species: "돼지" });
const exactDecision = decideProductMapping(exactSuggestion, exactEvidence);
assert.equal(exactDecision.status, "AUTO_APPROVED");

const ambiguousEvidence = assessProductCellEvidence({
  rawProductName: "아후지(장터)", condition: "냉장", origin: "국내산"
});
const ambiguousSuggestion = productNames.suggest(ambiguousEvidence.rawProductName, { species: "돼지" });
assert.equal(ambiguousSuggestion.requiresConfirmation, true);
assert.equal(decideProductMapping(ambiguousSuggestion, ambiguousEvidence).status, "SUGGESTED");

const shifted = { rawProductName: "원산지(장터) 국내산", origin: "국내산" };
const shiftedEvidence = assessProductCellEvidence(shifted);
assert.equal(shiftedEvidence.reviewRequired, true);
assert.ok(shiftedEvidence.issues.includes("PRODUCT_COLUMN_HEADER_CONTAMINATION"));
assert.ok(shiftedEvidence.issues.includes("PRODUCT_COLUMN_ORIGIN_SHIFT"));
assert.ok(detectProductCellIssues(shifted).includes("PRODUCT_COLUMN_HEADER_CONTAMINATION"));

const numericShift = assessProductCellEvidence({ rawProductName: "190,800", origin: "국내산" });
assert.ok(numericShift.issues.includes("PRODUCT_COLUMN_NUMERIC_SHIFT"));

console.log("Invoice product evidence, storage-prefix preservation, and safe mapping tests passed.");
