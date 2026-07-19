import assert from "node:assert/strict";
import { resolveMeatTaxTreatment } from "../src/data/meat-tax-policy.js";
import { applyDocumentCompletenessPolicy } from "../src/data/ocr-document-completeness-policy.js";
import { mapOcrTableToEvidenceInvoice } from "../src/data/ocr-evidence-mapper.js";
import { FIELD_EVIDENCE_STATUS } from "../src/data/meatos-standard-invoice.js";

const defaultExempt = resolveMeatTaxTreatment({ rawText: "냉장 등심 국내산 43.6kg" });
assert.equal(defaultExempt.treatment.value, "EXEMPT");
assert.equal(defaultExempt.treatment.status, FIELD_EVIDENCE_STATUS.POLICY_DEFAULT);
assert.equal(defaultExempt.taxAmount.value, 0);
assert.equal(defaultExempt.reviewRequired, false);

const explicitTaxable = resolveMeatTaxTreatment({ rawText: "양념육 과세 부가세 별도", observedTaxAmount: 1200 });
assert.equal(explicitTaxable.treatment.value, "TAXABLE");
assert.equal(explicitTaxable.taxAmount.value, 1200);
assert.equal(explicitTaxable.reviewRequired, false);

const manufacturingUnknown = resolveMeatTaxTreatment({ rawText: "특제 소스 첨가 갈비" });
assert.equal(manufacturingUnknown.treatment.status, FIELD_EVIDENCE_STATUS.MISSING);
assert.equal(manufacturingUnknown.reviewRequired, true);

const complete = applyDocumentCompletenessPolicy({ supplyAmount: 10000, taxAmount: 0, totalAmount: 10000 }, {});
assert.equal(complete.totalsWithheld, false);
assert.equal(complete.documentFields.totalAmount, 10000);

const damaged = applyDocumentCompletenessPolicy({ supplyAmount: 10000, taxAmount: 0, totalAmount: 10000 }, { isDamaged: true, unreadableTotals: true });
assert.equal(damaged.totalsWithheld, true);
assert.equal(damaged.documentFields.totalAmount.value, null);
assert.equal(damaged.documentFields.totalAmount.status, FIELD_EVIDENCE_STATUS.UNREADABLE);
assert.equal(damaged.uiWarning.severity, "warning");

const mapped = mapOcrTableToEvidenceInvoice({
  documentId: "doc-tax-1",
  providerId: "paddleocr",
  documentFields: { supplyAmount: 327000, taxAmount: 0, totalAmount: 327000 },
  rows: [{
    rowNo: 1,
    rawText: "돼지 등심 냉장 43.6 kg 7,500 327,000 L12607026054002",
    cells: {
      species: cell("돼지"), part: cell("등심"), productName: cell("냉장 등심"), grade: cell("1+"), condition: cell("냉장"),
      unit: cell("kg"), quantity: cell("43.6"), unitPrice: cell("7,500"), supplyAmount: cell("327,000"), totalAmount: cell("327,000"), traceOrImportNo: cell("L12607026054002")
    },
    tokens: [{ text: "황금브랜드", confidence: 80, bounds: { minX: 500, minY: 10, maxX: 600, maxY: 40 } }]
  }]
});
assert.equal(mapped.invoice.lineItems[0].fields.taxAmount.value, 0);
assert.equal(mapped.invoice.lineItems[0].fields.taxTreatment.status, FIELD_EVIDENCE_STATUS.POLICY_DEFAULT);
assert.equal(mapped.invoice.lineItems[0].unmappedTokens[0].text, "황금브랜드");
assert.ok(mapped.reviewReasons.includes("UNMAPPED_TOKENS"));

const partialMapped = mapOcrTableToEvidenceInvoice({
  documentId: "doc-partial",
  documentFields: { supplyAmount: 327000, taxAmount: 0, totalAmount: 327000 },
  completeness: { isPartial: true, isCropped: true },
  rows: []
});
assert.equal(partialMapped.invoice.documentFields.totalAmount.value, null);
assert.ok(partialMapped.reviewReasons.includes("DOCUMENT_TOTALS_WITHHELD"));

console.log(JSON.stringify({
  defaultTaxTreatment: defaultExempt.treatment.value,
  defaultEvidence: defaultExempt.treatment.status,
  explicitTaxableWins: explicitTaxable.treatment.value,
  manufacturingRequiresReview: manufacturingUnknown.reviewRequired,
  damagedTotalsWithheld: damaged.totalsWithheld,
  damagedWarning: damaged.uiWarning.title,
  unmappedTokenPreserved: mapped.invoice.lineItems[0].unmappedTokens[0].text
}, null, 2));

function cell(text) {
  return { text, confidence: 99, providerId: "paddleocr", headerMatched: true, bounds: { minX: 10, minY: 10, maxX: 100, maxY: 40 } };
}
