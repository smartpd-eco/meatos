const PROVIDER_COST_USD = {
  "google-vision-document-text": 0.0015,
  "upstage-document-parse": 0.01,
  "clova-general": 0
};

export function decideOcrEscalation(signals = {}, policy = {}) {
  const tableScore = Number(signals.tableScore ?? 0);
  const arithmeticOk = Boolean(signals.arithmeticOk);
  const unseenLayout = Boolean(signals.unseenLayout);
  const requiredFieldRate = Number(signals.requiredFieldRate ?? 0);
  const primaryProcessingMs = Number(signals.primaryProcessingMs ?? 0);
  const estimatedMonthlyPages = Number(policy.estimatedMonthlyPages ?? 0);
  const maxExternalCostUsd = Number(policy.maxExternalCostUsd ?? 100);

  if (arithmeticOk && tableScore >= 95 && requiredFieldRate >= 95) {
    return decision("LOCAL_ACCEPT", "paddleocr", false, 0, "Primary OCR passed structure and arithmetic gates");
  }
  if (!unseenLayout && tableScore >= 80 && primaryProcessingMs < 3000) {
    return decision("SELECTIVE_COMPARE", "easyocr+tesseract", false, 0, "Known layout needs field-level comparison only");
  }
  const upstageMonthlyCost = estimatedMonthlyPages * PROVIDER_COST_USD["upstage-document-parse"];
  if ((unseenLayout || tableScore < 80) && upstageMonthlyCost <= maxExternalCostUsd) {
    return decision("EXTERNAL_LAYOUT_COMPARE", "upstage-document-parse", true, PROVIDER_COST_USD["upstage-document-parse"], "Unseen or weak table structure requires a layout challenger");
  }
  return decision("REVIEW_REQUIRED", "none", false, 0, "External cost gate exceeded or document remains unsafe");
}

function decision(action, providerId, externalCall, estimatedCostUsd, reason) {
  return { action, providerId, externalCall, estimatedCostUsd, reason };
}
