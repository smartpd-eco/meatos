import { createEvidenceField, FIELD_EVIDENCE_STATUS } from "./meatos-standard-invoice.js";

const EXPLICIT_TAXABLE = /(?:^|[\s[(])(과세|부가세\s*별도|VAT)(?:[\s:：)\]]|$)/i;
const EXPLICIT_EXEMPT = /(?:^|[\s[(])(면세|부가세\s*없음)(?:[\s:：)\]]|$)/i;
const MANUFACTURING_SIGNALS = /(양념|소스|첨가|조미|제조|혼합육|떡갈비|햄|소시지)/i;

export const DEFAULT_MEAT_TAX_POLICY = Object.freeze({
  policyCode: "MEAT_RETAIL_DEFAULT_EXEMPT_V1",
  defaultTreatment: "EXEMPT",
  taxableRate: 0.1,
  explicitDocumentValueWins: true,
  manufacturingSignalRequiresReview: true
});

export function resolveMeatTaxTreatment(input = {}, policy = DEFAULT_MEAT_TAX_POLICY) {
  const rawText = String(input.rawText ?? "").normalize("NFKC");
  const observedTaxAmount = parseNullableNumber(input.observedTaxAmount);
  const explicitExempt = EXPLICIT_EXEMPT.test(rawText);
  const explicitTaxable = !explicitExempt && (EXPLICIT_TAXABLE.test(rawText) || (observedTaxAmount !== null && observedTaxAmount > 0));
  const manufacturingSignal = MANUFACTURING_SIGNALS.test(rawText);

  if (explicitTaxable) {
    return {
      treatment: createEvidenceField("TAXABLE", {
        status: FIELD_EVIDENCE_STATUS.OBSERVED,
        confidence: 100,
        source: "DOCUMENT_TAX_MARKING",
        rawText,
        reasonCodes: [observedTaxAmount > 0 ? "POSITIVE_TAX_AMOUNT" : "EXPLICIT_TAXABLE_MARKING"]
      }),
      taxAmount: observedTaxAmount === null ? null : createEvidenceField(observedTaxAmount, {
        status: FIELD_EVIDENCE_STATUS.OBSERVED,
        confidence: 100,
        source: "DOCUMENT_TAX_AMOUNT",
        rawText: String(input.observedTaxAmount ?? "")
      }),
      reviewRequired: observedTaxAmount === null,
      reasonCodes: observedTaxAmount === null ? ["TAXABLE_WITHOUT_OBSERVED_TAX_AMOUNT"] : []
    };
  }

  if (explicitExempt) {
    return exemptResult("DOCUMENT_TAX_MARKING", FIELD_EVIDENCE_STATUS.OBSERVED, "EXPLICIT_EXEMPT_MARKING", rawText, policy);
  }

  if (manufacturingSignal && policy.manufacturingSignalRequiresReview) {
    return {
      treatment: createEvidenceField(null, {
        status: FIELD_EVIDENCE_STATUS.MISSING,
        confidence: 0,
        source: "MEAT_TAX_POLICY",
        rawText,
        reasonCodes: ["MANUFACTURING_SIGNAL_REQUIRES_REVIEW"],
        policyCode: policy.policyCode
      }),
      taxAmount: null,
      reviewRequired: true,
      reasonCodes: ["MANUFACTURING_SIGNAL_REQUIRES_REVIEW"]
    };
  }

  return exemptResult("TENANT_TAX_POLICY", FIELD_EVIDENCE_STATUS.POLICY_DEFAULT, "DEFAULT_EXEMPT_UNLESS_EXPLICIT_TAXABLE", rawText, policy);
}

function exemptResult(source, status, reasonCode, rawText, policy) {
  const treatment = createEvidenceField("EXEMPT", {
    status,
    confidence: status === FIELD_EVIDENCE_STATUS.OBSERVED ? 100 : 85,
    source,
    rawText,
    reasonCodes: [reasonCode],
    policyCode: policy.policyCode
  });
  return {
    treatment,
    taxAmount: createEvidenceField(0, {
      status: FIELD_EVIDENCE_STATUS.DERIVED,
      confidence: treatment.confidence,
      source: "MEAT_TAX_POLICY",
      formula: "taxTreatment == EXEMPT ? 0 : observedTaxAmount",
      evidenceFieldNames: ["taxTreatment"],
      reasonCodes: [reasonCode],
      policyCode: policy.policyCode
    }),
    reviewRequired: false,
    reasonCodes: [reasonCode]
  };
}

function parseNullableNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(String(value).replaceAll(",", "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}
