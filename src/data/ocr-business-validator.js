import { extractTraceNumberCandidates, isValidTraceNumber } from "./ocr-trace-number-extractor.js";

export function validateOcrInvoiceData({ lineItems = [], documentFields = {} } = {}) {
  const normalizedLineItems = Array.isArray(lineItems) ? lineItems : [];
  const issues = [];
  const lineValidation = [];

  const lineErrors = normalizedLineItems.filter((item, index) => {
    const quantity = Number(item.quantity ?? item.rawQuantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.rawUnitPrice ?? 0);
    const amount = Number(item.amount ?? item.rawAmount ?? 0);
    const missingFields = [];
    if (!(quantity > 0)) missingFields.push("quantity");
    if (!(unitPrice > 0)) missingFields.push("unitPrice");
    if (!(amount > 0)) missingFields.push("amount");
    const arithmeticMatched = !missingFields.length && Math.abs((quantity * unitPrice) - amount) <= 1;
    lineValidation.push({
      rowNo: Number(item.rowNo ?? index + 1),
      quantity,
      unitPrice,
      amount,
      missingFields,
      arithmeticMatched,
      numericConfirmed: !missingFields.length && arithmeticMatched
    });
    return !arithmeticMatched;
  });
  if (!normalizedLineItems.length) issues.push("NO_LINE_ITEMS");
  if (lineValidation.some((line) => line.missingFields.length)) issues.push("NUMERIC_FIELD_MISSING");
  if (lineErrors.length) issues.push("LINE_ITEM_AMOUNT_MISMATCH");

  const lineSum = normalizedLineItems.reduce((sum, item) => sum + Number(item.amount ?? item.rawAmount ?? 0), 0);
  const supplyAmount = Number(documentFields.supplyAmount ?? 0);
  const taxAmount = Number(documentFields.taxAmount ?? 0);
  const totalAmount = Number(documentFields.totalAmount ?? 0);

  if (!(supplyAmount > 0)) issues.push("SUPPLY_AMOUNT_MISSING");
  if (!(totalAmount > 0)) issues.push("TOTAL_AMOUNT_MISSING");

  if (supplyAmount > 0 && lineSum > 0 && Math.round(lineSum) !== Math.round(supplyAmount)) {
    issues.push("SUPPLY_AMOUNT_MISMATCH");
  }
  if (totalAmount > 0 && supplyAmount > 0 && taxAmount >= 0 && Math.round(supplyAmount + taxAmount) !== Math.round(totalAmount)) {
    issues.push("TOTAL_AMOUNT_MISMATCH");
  }
  if (documentFields.supplierBusinessNo && !/^\d{3}-\d{2}-\d{5}$/.test(String(documentFields.supplierBusinessNo).trim())) {
    issues.push("BUSINESS_NO_FORMAT");
  }
  if (documentFields.invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(documentFields.invoiceDate).trim())) {
    issues.push("INVOICE_DATE_FORMAT");
  }
  const explicitTraceNumbers = normalizeTraceNumbers(documentFields.livestockTraceNos ?? documentFields.livestockTraceNo);
  const documentText = String(documentFields.rawText ?? documentFields.reconstructedText ?? "");
  const traceNumbers = [...new Set([
    ...explicitTraceNumbers,
    ...extractTraceNumberCandidates(documentText).map((candidate) => candidate.normalized)
  ])];
  if (traceNumbers.some((value) => !isValidLivestockTraceNo(value))) issues.push("LIVESTOCK_TRACE_NO_FORMAT");

  const requiredFields = [
    documentFields.supplierName,
    documentFields.invoiceDate,
    documentFields.totalAmount
  ].filter(Boolean).length;

  const numericIssueCodes = new Set([
    "NO_LINE_ITEMS", "NUMERIC_FIELD_MISSING", "LINE_ITEM_AMOUNT_MISMATCH",
    "SUPPLY_AMOUNT_MISSING", "TOTAL_AMOUNT_MISSING", "SUPPLY_AMOUNT_MISMATCH", "TOTAL_AMOUNT_MISMATCH"
  ]);
  const numericIntegrity = normalizedLineItems.length > 0
    && lineValidation.every((line) => line.numericConfirmed)
    && !issues.some((issue) => numericIssueCodes.has(issue));
  const arithmeticValidation = numericIntegrity;
  const meatosScore = computeMeatosScore({
    ocrConfidence: normalizedLineItems.length ? average(normalizedLineItems.map((item) => Number(item.confidence ?? 0))) : 0,
    tableScore: Math.min(100, 60 + normalizedLineItems.length * 5),
    arithmeticScore: arithmeticValidation ? 100 : 30,
    requiredFieldScore: Math.min(100, requiredFields * 33),
    aliasMatchScore: documentFields.supplierName ? 84 : 44
  });

  return {
    totalMatched: supplyAmount > 0 || totalAmount > 0,
    lineCount: normalizedLineItems.length,
    calculationOk: arithmeticValidation,
    issues,
    requiredFieldCount: requiredFields,
    meatosScore,
    arithmeticValidation,
    numericIntegrity,
    lineValidation,
    traceNumbers,
    traceNumberValid: traceNumbers.length > 0 && traceNumbers.every(isValidLivestockTraceNo),
    totalAmountMatched: supplyAmount > 0 && totalAmount > 0 && Math.abs((supplyAmount + taxAmount) - totalAmount) <= 1,
    postingAllowed: numericIntegrity
      && supplyAmount > 0
      && totalAmount > 0
      && Math.abs((supplyAmount + taxAmount) - totalAmount) <= 1
  };
}

export function computeMeatosScore(signals = {}) {
  const ocrConfidence = clamp(signals.ocrConfidence ?? signals.textScore ?? 0, 0, 100);
  const tableScore = clamp(signals.tableScore ?? 0, 0, 100);
  const arithmeticScore = clamp(signals.arithmeticScore ?? signals.calculationScore ?? 0, 0, 100);
  const requiredFieldScore = clamp(signals.requiredFieldScore ?? 0, 0, 100);
  const aliasMatchScore = clamp(signals.aliasMatchScore ?? signals.dictionaryScore ?? 0, 0, 100);
  return Math.round(
    (ocrConfidence * 0.25)
      + (tableScore * 0.20)
      + (arithmeticScore * 0.25)
      + (requiredFieldScore * 0.15)
      + (aliasMatchScore * 0.15)
  );
}

export function deriveValidationStatus(validation = {}) {
  if (validation.totalAmountMatched && validation.calculationOk && (validation.lineCount ?? 0) > 0) {
    return "PASS";
  }
  if (validation.issues?.length) {
    return "REVIEW";
  }
  return "UNKNOWN";
}

function average(values = []) {
  const filtered = values.filter((value) => Number.isFinite(Number(value)));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + Number(value), 0) / filtered.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
}

function normalizeTraceNumbers(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item ?? "").replace(/[\s-]/g, "").toUpperCase()).filter(Boolean))];
}

function isValidLivestockTraceNo(value) {
  return isValidTraceNumber(value);
}
