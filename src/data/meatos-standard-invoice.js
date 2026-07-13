export const MEATOS_STANDARD_INVOICE_VERSION = "MEATOS_STANDARD_INVOICE_V1";

export const FIELD_EVIDENCE_STATUS = Object.freeze({
  OBSERVED: "OBSERVED",
  DERIVED: "DERIVED",
  POLICY_DEFAULT: "POLICY_DEFAULT",
  INFERRED: "INFERRED",
  CONFIRMED: "CONFIRMED",
  MISSING: "MISSING",
  CONFLICT: "CONFLICT",
  UNREADABLE: "UNREADABLE"
});

export const REQUIRED_LINE_FIELDS = Object.freeze([
  "species",
  "part",
  "productName",
  "grade",
  "condition",
  "unit",
  "quantity",
  "unitPrice",
  "supplyAmount",
  "taxAmount",
  "totalAmount",
  "traceOrImportNo"
]);

export const CRITICAL_NUMERIC_FIELDS = Object.freeze([
  "quantity",
  "unitPrice",
  "supplyAmount",
  "taxAmount",
  "totalAmount"
]);

export function createEvidenceField(value, input = {}) {
  const hasValue = value !== undefined && value !== null && String(value).trim() !== "";
  return {
    value: hasValue ? value : null,
    status: String(input.status ?? (hasValue ? FIELD_EVIDENCE_STATUS.OBSERVED : FIELD_EVIDENCE_STATUS.MISSING)),
    confidence: clamp(input.confidence ?? (hasValue ? 0 : 100)),
    source: String(input.source ?? "").trim(),
    sourceDocumentId: String(input.sourceDocumentId ?? "").trim(),
    pageNo: Number(input.pageNo ?? 1),
    rowNo: Number(input.rowNo ?? 0),
    bounds: normalizeBounds(input.bounds),
    rawText: String(input.rawText ?? "").trim(),
    formula: String(input.formula ?? "").trim(),
    evidenceFieldNames: Array.isArray(input.evidenceFieldNames) ? [...input.evidenceFieldNames] : [],
    reasonCodes: Array.isArray(input.reasonCodes) ? [...input.reasonCodes] : []
    ,policyCode: String(input.policyCode ?? "").trim()
  };
}

export function createStandardInvoice(input = {}) {
  return {
    schemaVersion: MEATOS_STANDARD_INVOICE_VERSION,
    documentId: String(input.documentId ?? "").trim(),
    supplierId: String(input.supplierId ?? "").trim(),
    documentFields: input.documentFields ?? {},
    lineItems: (Array.isArray(input.lineItems) ? input.lineItems : []).map((line, index) => ({
      rowNo: Number(line.rowNo ?? index + 1),
      fields: line.fields ?? {},
      unmappedTokens: normalizeUnmappedTokens(line.unmappedTokens, index + 1)
    })),
    unmappedTokens: normalizeUnmappedTokens(input.unmappedTokens),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function createUnmappedToken(text, input = {}) {
  return {
    text: String(text ?? "").trim(),
    normalizedText: String(input.normalizedText ?? text ?? "").normalize("NFKC").trim(),
    status: "UNMAPPED",
    candidateTypes: Array.isArray(input.candidateTypes) ? [...input.candidateTypes] : [],
    confidence: clamp(input.confidence ?? 0),
    pageNo: Number(input.pageNo ?? 1),
    rowNo: Number(input.rowNo ?? 0),
    bounds: normalizeBounds(input.bounds),
    source: String(input.source ?? "OCR").trim()
  };
}

function normalizeUnmappedTokens(tokens, fallbackRowNo = 0) {
  return (Array.isArray(tokens) ? tokens : [])
    .map((token) => createUnmappedToken(token?.text ?? token, { ...token, rowNo: token?.rowNo ?? fallbackRowNo }))
    .filter((token) => token.text);
}

function normalizeBounds(bounds = {}) {
  return {
    minX: Number(bounds?.minX ?? 0),
    minY: Number(bounds?.minY ?? 0),
    maxX: Number(bounds?.maxX ?? 0),
    maxY: Number(bounds?.maxY ?? 0)
  };
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
}
