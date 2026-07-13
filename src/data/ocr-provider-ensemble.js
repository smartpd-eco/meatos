import { deriveValidationStatus, validateOcrInvoiceData } from "./ocr-business-validator.js";

export function selectBestOcrResult(results = [], context = {}) {
  const normalized = (Array.isArray(results) ? results : [])
    .filter(Boolean)
    .map((result) => ({
      providerId: String(result.providerId ?? result.providerName ?? "").trim(),
      providerName: String(result.providerName ?? result.providerId ?? "").trim(),
      providerVersion: String(result.providerVersion ?? "").trim(),
      meatosScore: Number(result.meatosScore ?? 0),
      providerConfidence: Number(result.providerConfidence ?? 0),
      lineCount: Array.isArray(result.lineItems) ? result.lineItems.length : 0,
      validationStatus: deriveValidationStatus(result.validation ?? {}),
      result
    }));

  const ranked = normalized.sort((left, right) => {
    const leftValidationRank = validationRank(left.result.validation ?? {});
    const rightValidationRank = validationRank(right.result.validation ?? {});
    if (rightValidationRank !== leftValidationRank) return rightValidationRank - leftValidationRank;
    if (right.meatosScore !== left.meatosScore) return right.meatosScore - left.meatosScore;
    if (right.lineCount !== left.lineCount) return right.lineCount - left.lineCount;
    return right.providerConfidence - left.providerConfidence;
  });

  const selected = ranked[0] ?? null;
  return {
    selected: selected?.result ?? null,
    candidates: ranked,
    selectedProviderId: selected?.providerId ?? "",
    selectedProviderName: selected?.providerName ?? "",
    selectedReason: selected
      ? `${selected.providerName} / ${selected.meatosScore}% / ${selected.validationStatus}`
      : "NO_RESULT",
    context: {
      requestedProviderId: String(context.requestedProviderId ?? "").trim(),
      strategy: String(context.strategy ?? "selective").trim()
    }
  };
}

export function mergeSelectiveOcrResults(primaryResult, comparisonResult) {
  if (!primaryResult) return comparisonResult ?? null;
  if (!comparisonResult) return primaryResult;

  const primaryItems = Array.isArray(primaryResult.lineItems) ? primaryResult.lineItems : [];
  const comparisonItems = Array.isArray(comparisonResult.lineItems) ? comparisonResult.lineItems : [];
  if (!comparisonItems.length) return primaryResult;

  const mergedItems = primaryItems.map((primaryItem, index) => {
    const comparisonItem = findComparisonItem(primaryItem, comparisonItems, index);
    if (!comparisonItem) return primaryItem;
    return mergeLineItem(primaryItem, comparisonItem);
  });
  if (comparisonItems.length > primaryItems.length) {
    mergedItems.push(...comparisonItems.slice(primaryItems.length));
  }

  const documentFields = mergeDocumentFields(primaryResult.documentFields, comparisonResult.documentFields);
  const validation = validateOcrInvoiceData({ lineItems: mergedItems, documentFields });
  const providerConfidence = Math.round(Math.max(
    Number(primaryResult.providerConfidence ?? 0),
    Number(comparisonResult.providerConfidence ?? 0)
  ));

  return {
    ...primaryResult,
    providerName: "MEATOS Paddle + EasyOCR Ensemble",
    providerVersion: `${primaryResult.providerVersion ?? "paddle"}+${comparisonResult.providerVersion ?? "easyocr"}`,
    providerConfidence,
    documentFields,
    lineItems: mergedItems,
    validation,
    meatosScore: validation.meatosScore,
    status: validation.calculationOk && validation.totalAmountMatched ? "REVIEW_REQUIRED" : "REVIEW_REQUIRED",
    reconstructedText: [primaryResult.reconstructedText, comparisonResult.reconstructedText].filter(Boolean).join("\n--- EasyOCR compare ---\n"),
    reconstructionBasis: [...new Set([
      ...(primaryResult.reconstructionBasis ?? []),
      ...(comparisonResult.reconstructionBasis ?? []),
      "FIELD_LEVEL_VOTING",
      "ARITHMETIC_VALIDATION"
    ])],
    rawJson: {
      provider: "meatos-ensemble",
      primary: primaryResult.rawJson,
      comparison: comparisonResult.rawJson,
      selectiveRegionCount: Number(comparisonResult.rawJson?.regionResults?.length ?? 0)
    },
    parsedJson: {
      documentFields,
      lineItems: mergedItems,
      validation,
      meatosScore: validation.meatosScore
    }
  };
}

function findComparisonItem(primaryItem, comparisonItems, fallbackIndex) {
  const primaryAmount = Number(primaryItem.amount ?? primaryItem.rawAmount ?? 0);
  if (primaryAmount > 0) {
    const amountMatch = comparisonItems.find((item) => Number(item.amount ?? item.rawAmount ?? 0) === primaryAmount);
    if (amountMatch) return amountMatch;
  }
  return comparisonItems[fallbackIndex] ?? null;
}

function mergeLineItem(primaryItem, comparisonItem) {
  const primaryArithmeticOk = lineArithmeticOk(primaryItem);
  const comparisonArithmeticOk = lineArithmeticOk(comparisonItem);
  const useComparisonNumbers = comparisonArithmeticOk && !primaryArithmeticOk;
  const comparisonName = String(comparisonItem.rawProductName ?? "").trim();
  const primaryName = String(primaryItem.rawProductName ?? "").trim();
  const useComparisonName = comparisonName.length >= 2
    && Number(comparisonItem.confidence ?? 0) > Number(primaryItem.confidence ?? 0);

  return {
    ...primaryItem,
    rawProductName: useComparisonName ? comparisonName : primaryName,
    normalizedProductName: useComparisonName
      ? String(comparisonItem.normalizedProductName ?? comparisonName)
      : String(primaryItem.normalizedProductName ?? primaryName),
    quantity: useComparisonNumbers ? Number(comparisonItem.quantity ?? comparisonItem.rawQuantity ?? 0) : Number(primaryItem.quantity ?? primaryItem.rawQuantity ?? 0),
    rawQuantity: useComparisonNumbers ? Number(comparisonItem.rawQuantity ?? comparisonItem.quantity ?? 0) : Number(primaryItem.rawQuantity ?? primaryItem.quantity ?? 0),
    unitPrice: useComparisonNumbers ? Number(comparisonItem.unitPrice ?? comparisonItem.rawUnitPrice ?? 0) : Number(primaryItem.unitPrice ?? primaryItem.rawUnitPrice ?? 0),
    rawUnitPrice: useComparisonNumbers ? Number(comparisonItem.rawUnitPrice ?? comparisonItem.unitPrice ?? 0) : Number(primaryItem.rawUnitPrice ?? primaryItem.unitPrice ?? 0),
    amount: useComparisonNumbers ? Number(comparisonItem.amount ?? comparisonItem.rawAmount ?? 0) : Number(primaryItem.amount ?? primaryItem.rawAmount ?? 0),
    rawAmount: useComparisonNumbers ? Number(comparisonItem.rawAmount ?? comparisonItem.amount ?? 0) : Number(primaryItem.rawAmount ?? primaryItem.amount ?? 0),
    confidence: Math.max(Number(primaryItem.confidence ?? 0), Number(comparisonItem.confidence ?? 0)),
    reviewStatus: "PENDING"
  };
}

function lineArithmeticOk(item) {
  const quantity = Number(item.quantity ?? item.rawQuantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? item.rawUnitPrice ?? 0);
  const amount = Number(item.amount ?? item.rawAmount ?? 0);
  return quantity > 0 && unitPrice > 0 && amount > 0 && Math.round(quantity * unitPrice) === Math.round(amount);
}

function mergeDocumentFields(primaryFields = {}, comparisonFields = {}) {
  return Object.fromEntries(
    [...new Set([...Object.keys(primaryFields ?? {}), ...Object.keys(comparisonFields ?? {})])]
      .map((key) => [key, primaryFields?.[key] || comparisonFields?.[key] || ""])
  );
}

function validationRank(validation = {}) {
  let score = 0;
  if (validation.calculationOk) score += 4;
  if (validation.totalAmountMatched) score += 3;
  if (Number(validation.lineCount ?? 0) > 0) score += 2;
  if (!Array.isArray(validation.issues) || validation.issues.length === 0) score += 1;
  return score;
}
