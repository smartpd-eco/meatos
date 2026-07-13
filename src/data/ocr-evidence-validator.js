import {
  CRITICAL_NUMERIC_FIELDS,
  FIELD_EVIDENCE_STATUS,
  REQUIRED_LINE_FIELDS
} from "./meatos-standard-invoice.js";
import { isValidTraceNumber } from "./ocr-trace-number-extractor.js";

const PROVEN_STATUSES = new Set([FIELD_EVIDENCE_STATUS.OBSERVED, FIELD_EVIDENCE_STATUS.CONFIRMED]);
const ACCEPTABLE_DERIVED_FIELDS = new Set(["supplyAmount", "taxAmount", "totalAmount"]);

export function validateEvidenceBasedInvoice(invoice = {}, options = {}) {
  const tolerance = Number(options.amountTolerance ?? 1);
  const issues = [];
  const rows = (Array.isArray(invoice.lineItems) ? invoice.lineItems : []).map((line, index) => validateLine(line, index, tolerance));
  if (!rows.length) issues.push(issue("NO_LINE_ITEMS", "document", 0));
  for (const row of rows) issues.push(...row.issues);

  const documentValidation = validateDocumentTotals(invoice.documentFields ?? {}, rows, tolerance);
  issues.push(...documentValidation.issues);
  const unmappedTokens = [
    ...(Array.isArray(invoice.unmappedTokens) ? invoice.unmappedTokens : []),
    ...rows.flatMap((row) => row.unmappedTokens)
  ];
  const blockingIssues = issues.filter((entry) => entry.blocking);
  const inferredCriticalFields = rows.flatMap((row) => row.fields)
    .filter((entry) => entry.critical && entry.status === FIELD_EVIDENCE_STATUS.INFERRED);

  return {
    schemaVersion: invoice.schemaVersion ?? "",
    lineCount: rows.length,
    rows,
    documentValidation,
    unmappedTokens,
    issues,
    blockingIssues,
    inferredCriticalFields,
    evidenceComplete: rows.length > 0 && rows.every((row) => row.evidenceComplete),
    arithmeticValidated: rows.length > 0 && rows.every((row) => row.arithmeticValidated) && documentValidation.arithmeticValidated,
    reviewRequired: blockingIssues.length > 0 || inferredCriticalFields.length > 0 || unmappedTokens.length > 0,
    autoPostingAllowed: blockingIssues.length === 0
      && inferredCriticalFields.length === 0
      && rows.length > 0
      && rows.every((row) => row.autoPostingAllowed)
      && documentValidation.autoPostingAllowed
  };
}

function validateLine(line, index, tolerance) {
  const rowNo = Number(line?.rowNo ?? index + 1);
  const sourceFields = line?.fields ?? {};
  const issues = [];
  const fields = REQUIRED_LINE_FIELDS.map((fieldName) => inspectField(fieldName, sourceFields[fieldName], rowNo, issues));
  const values = Object.fromEntries(fields.map((entry) => [entry.fieldName, entry.value]));
  const quantity = number(values.quantity);
  const unitPrice = number(values.unitPrice);
  const supplyAmount = number(values.supplyAmount);
  const taxAmount = number(values.taxAmount);
  const totalAmount = number(values.totalAmount);

  const calculatedSupply = roundMoney(quantity * unitPrice);
  const calculatedTotal = roundMoney(supplyAmount + taxAmount);
  const supplyMatched = positive(quantity) && positive(unitPrice) && Math.abs(calculatedSupply - supplyAmount) <= tolerance;
  const totalMatched = supplyAmount >= 0 && taxAmount >= 0 && Math.abs(calculatedTotal - totalAmount) <= tolerance;
  if (!supplyMatched) issues.push(issue("QUANTITY_UNIT_PRICE_SUPPLY_MISMATCH", "line", rowNo, true, { calculated: calculatedSupply, observed: supplyAmount }));
  if (!totalMatched) issues.push(issue("SUPPLY_TAX_TOTAL_MISMATCH", "line", rowNo, true, { calculated: calculatedTotal, observed: totalAmount }));

  const traceField = fields.find((entry) => entry.fieldName === "traceOrImportNo");
  if (traceField?.value && !isValidTraceNumber(traceField.value)) {
    issues.push(issue("TRACE_OR_IMPORT_NO_FORMAT", "line", rowNo));
  }

  verifyDerivedEvidence(fields, sourceFields, rowNo, issues);
  const evidenceComplete = fields.every((entry) => entry.evidenceAcceptable);
  const arithmeticValidated = supplyMatched && totalMatched;
  return {
    rowNo,
    fields,
    values,
    calculated: { supplyAmount: calculatedSupply, totalAmount: calculatedTotal },
    arithmeticValidated,
    evidenceComplete,
    unmappedTokens: Array.isArray(line?.unmappedTokens) ? line.unmappedTokens : [],
    issues,
    autoPostingAllowed: evidenceComplete && arithmeticValidated && !issues.some((entry) => entry.blocking)
  };
}

function verifyDerivedEvidence(fields, sourceFields, rowNo, issues) {
  const byName = Object.fromEntries(fields.map((field) => [field.fieldName, field]));
  for (const field of fields.filter((entry) => entry.status === FIELD_EVIDENCE_STATUS.DERIVED)) {
    let proven = false;
    if (field.fieldName === "supplyAmount") {
      proven = byName.quantity?.evidenceAcceptable && byName.unitPrice?.evidenceAcceptable;
    } else if (field.fieldName === "totalAmount") {
      proven = byName.supplyAmount?.evidenceAcceptable && byName.taxAmount?.evidenceAcceptable;
    } else if (field.fieldName === "taxAmount") {
      const taxTreatment = sourceFields.taxTreatment;
      const status = String(taxTreatment?.status ?? "");
      const value = String(taxTreatment?.value ?? "").toUpperCase();
      const explicitEvidence = PROVEN_STATUSES.has(status);
      const configuredPolicyEvidence = status === FIELD_EVIDENCE_STATUS.POLICY_DEFAULT
        && Boolean(taxTreatment?.policyCode);
      proven = (explicitEvidence || configuredPolicyEvidence)
        && ["EXEMPT", "면세", "ZERO_RATED"].includes(value);
    }
    if (!proven) {
      field.evidenceAcceptable = false;
      issues.push(issue("DERIVED_EVIDENCE_NOT_PROVEN", field.fieldName, rowNo, true));
    }
  }
}

function inspectField(fieldName, field, rowNo, issues) {
  const normalized = field && typeof field === "object" && "status" in field
    ? field
    : { value: field ?? null, status: field === undefined || field === null || field === "" ? FIELD_EVIDENCE_STATUS.MISSING : FIELD_EVIDENCE_STATUS.OBSERVED, confidence: 0 };
  const status = String(normalized.status ?? FIELD_EVIDENCE_STATUS.MISSING);
  const value = normalized.value;
  const critical = CRITICAL_NUMERIC_FIELDS.includes(fieldName) || fieldName === "traceOrImportNo";
  const missing = value === null || value === undefined || String(value).trim() === "" || status === FIELD_EVIDENCE_STATUS.MISSING;
  if (missing) issues.push(issue("REQUIRED_FIELD_MISSING", fieldName, rowNo, true));
  if (status === FIELD_EVIDENCE_STATUS.CONFLICT) issues.push(issue("FIELD_CONFLICT", fieldName, rowNo, true));
  if (status === FIELD_EVIDENCE_STATUS.UNREADABLE) issues.push(issue("FIELD_UNREADABLE", fieldName, rowNo, true));
  if (critical && status === FIELD_EVIDENCE_STATUS.INFERRED) issues.push(issue("CRITICAL_FIELD_INFERRED", fieldName, rowNo, true));
  if (critical && status === FIELD_EVIDENCE_STATUS.DERIVED && !ACCEPTABLE_DERIVED_FIELDS.has(fieldName)) {
    issues.push(issue("CRITICAL_FIELD_DERIVATION_NOT_ALLOWED", fieldName, rowNo, true));
  }
  const derivedAcceptable = status === FIELD_EVIDENCE_STATUS.DERIVED
    && ACCEPTABLE_DERIVED_FIELDS.has(fieldName)
    && Boolean(normalized.formula)
    && Array.isArray(normalized.evidenceFieldNames)
    && normalized.evidenceFieldNames.length >= 1;
  const evidenceAcceptable = !missing && (PROVEN_STATUSES.has(status) || derivedAcceptable);
  if (!missing && !evidenceAcceptable && status !== FIELD_EVIDENCE_STATUS.INFERRED) {
    issues.push(issue("FIELD_EVIDENCE_INSUFFICIENT", fieldName, rowNo, true));
  }
  return { fieldName, value, status, confidence: Number(normalized.confidence ?? 0), critical, evidenceAcceptable, source: normalized.source ?? "", bounds: normalized.bounds ?? {}, rawText: normalized.rawText ?? "" };
}

function validateDocumentTotals(documentFields, rows, tolerance) {
  const issues = [];
  const lineSupplySum = roundMoney(rows.reduce((sum, row) => sum + number(row.values.supplyAmount), 0));
  const lineTaxSum = roundMoney(rows.reduce((sum, row) => sum + number(row.values.taxAmount), 0));
  const lineTotalSum = roundMoney(rows.reduce((sum, row) => sum + number(row.values.totalAmount), 0));
  const supply = evidenceValue(documentFields.supplyAmount);
  const tax = evidenceValue(documentFields.taxAmount);
  const total = evidenceValue(documentFields.totalAmount);
  const totalsPresent = supply !== null && tax !== null && total !== null;
  if (!totalsPresent) issues.push(issue("DOCUMENT_TOTALS_MISSING", "document", 0));
  if (supply !== null && Math.abs(supply - lineSupplySum) > tolerance) issues.push(issue("DOCUMENT_SUPPLY_SUM_MISMATCH", "document", 0, true, { calculated: lineSupplySum, observed: supply }));
  if (tax !== null && Math.abs(tax - lineTaxSum) > tolerance) issues.push(issue("DOCUMENT_TAX_SUM_MISMATCH", "document", 0, true, { calculated: lineTaxSum, observed: tax }));
  if (total !== null && Math.abs(total - lineTotalSum) > tolerance) issues.push(issue("DOCUMENT_TOTAL_SUM_MISMATCH", "document", 0, true, { calculated: lineTotalSum, observed: total }));
  const arithmeticValidated = totalsPresent && !issues.some((entry) => entry.blocking);
  return { lineSupplySum, lineTaxSum, lineTotalSum, arithmeticValidated, autoPostingAllowed: arithmeticValidated, issues };
}

function evidenceValue(field) {
  if (field && typeof field === "object" && "value" in field) {
    if (![FIELD_EVIDENCE_STATUS.OBSERVED, FIELD_EVIDENCE_STATUS.CONFIRMED, FIELD_EVIDENCE_STATUS.DERIVED].includes(field.status)) return null;
    return number(field.value);
  }
  if (field === undefined || field === null || field === "") return null;
  return number(field);
}

function issue(code, fieldName, rowNo, blocking = true, detail = {}) {
  return { code, fieldName, rowNo, blocking, detail };
}

function number(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value) { return Number(value) > 0; }
function roundMoney(value) { return Math.round(Number(value) * 100) / 100; }
