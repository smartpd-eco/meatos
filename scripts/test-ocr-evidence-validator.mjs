import assert from "node:assert/strict";
import { createEvidenceField, createStandardInvoice, createUnmappedToken, FIELD_EVIDENCE_STATUS } from "../src/data/meatos-standard-invoice.js";
import { validateEvidenceBasedInvoice } from "../src/data/ocr-evidence-validator.js";

const observed = (value, fieldName, rowNo = 1) => createEvidenceField(value, {
  status: FIELD_EVIDENCE_STATUS.OBSERVED,
  confidence: 99,
  source: "PADDLE_OCR",
  rowNo,
  rawText: String(value),
  bounds: { minX: 10, minY: 10, maxX: 100, maxY: 40 },
  reasonCodes: [`HEADER_${fieldName.toUpperCase()}`]
});
const derived = (value, formula, evidenceFieldNames, rowNo = 1) => createEvidenceField(value, {
  status: FIELD_EVIDENCE_STATUS.DERIVED,
  confidence: 100,
  source: "MEATOS_ARITHMETIC",
  rowNo,
  formula,
  evidenceFieldNames
});

function validLine(overrides = {}) {
  return {
    rowNo: 1,
    fields: {
      species: observed("돼지", "species"),
      part: observed("등심", "part"),
      productName: observed("냉장 등심(장터)", "productName"),
      grade: observed("1+", "grade"),
      condition: observed("냉장", "condition"),
      unit: observed("kg", "unit"),
      quantity: observed(43.6, "quantity"),
      unitPrice: observed(7500, "unitPrice"),
      supplyAmount: derived(327000, "quantity * unitPrice", ["quantity", "unitPrice"]),
      taxAmount: derived(0, "taxExempt ? 0 : observedTax", ["taxTreatment"]),
      totalAmount: derived(327000, "supplyAmount + taxAmount", ["supplyAmount", "taxAmount"]),
      traceOrImportNo: observed("L12607026054002", "traceOrImportNo"),
      taxTreatment: observed("EXEMPT", "taxTreatment"),
      ...overrides
    },
    unmappedTokens: []
  };
}

const documentFields = {
  supplyAmount: observed(327000, "documentSupply", 0),
  taxAmount: observed(0, "documentTax", 0),
  totalAmount: observed(327000, "documentTotal", 0)
};
const validInvoice = createStandardInvoice({ documentId: "doc-1", documentFields, lineItems: [validLine()] });
const valid = validateEvidenceBasedInvoice(validInvoice);
assert.equal(valid.autoPostingAllowed, true);
assert.equal(valid.arithmeticValidated, true);

const inferredQuantity = validateEvidenceBasedInvoice(createStandardInvoice({
  documentFields,
  lineItems: [validLine({ quantity: createEvidenceField(43.6, { status: FIELD_EVIDENCE_STATUS.INFERRED, confidence: 92, source: "HISTORY" }) })]
}));
assert.equal(inferredQuantity.autoPostingAllowed, false);
assert.ok(inferredQuantity.blockingIssues.some((entry) => entry.code === "CRITICAL_FIELD_INFERRED"));

const wrongAmount = validateEvidenceBasedInvoice(createStandardInvoice({
  documentFields,
  lineItems: [validLine({ supplyAmount: observed(327800, "supplyAmount") })]
}));
assert.equal(wrongAmount.autoPostingAllowed, false);
assert.ok(wrongAmount.blockingIssues.some((entry) => entry.code === "QUANTITY_UNIT_PRICE_SUPPLY_MISMATCH"));

const unknownWord = validateEvidenceBasedInvoice(createStandardInvoice({
  documentFields,
  lineItems: [{ ...validLine(), unmappedTokens: [createUnmappedToken("골드육", { candidateTypes: ["BRAND", "PRODUCT_GROUP"], confidence: 58 })] }]
}));
assert.equal(unknownWord.reviewRequired, true);
assert.equal(unknownWord.unmappedTokens[0].text, "골드육");

const missingGrade = validateEvidenceBasedInvoice(createStandardInvoice({
  documentFields,
  lineItems: [validLine({ grade: createEvidenceField(null, { status: FIELD_EVIDENCE_STATUS.MISSING }) })]
}));
assert.equal(missingGrade.autoPostingAllowed, false);
assert.ok(missingGrade.blockingIssues.some((entry) => entry.fieldName === "grade"));

const unprovenTax = validateEvidenceBasedInvoice(createStandardInvoice({
  documentFields,
  lineItems: [validLine({ taxTreatment: undefined })]
}));
assert.equal(unprovenTax.autoPostingAllowed, false);
assert.ok(unprovenTax.blockingIssues.some((entry) => entry.code === "DERIVED_EVIDENCE_NOT_PROVEN"));

console.log(JSON.stringify({
  provenDocumentPosts: valid.autoPostingAllowed,
  inferredNumericBlocked: !inferredQuantity.autoPostingAllowed,
  arithmeticConflictBlocked: !wrongAmount.autoPostingAllowed,
  unknownTokenPreserved: unknownWord.unmappedTokens[0].text,
  missingRequiredFieldBlocked: !missingGrade.autoPostingAllowed
}, null, 2));
