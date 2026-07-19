const PROVIDER_COST_USD = {
  "google-vision-document-text": 0.0015,
  "upstage-document-parse": 0.01,
  "gemini-2.5-flash": 0,
  "gpt-4.1": 0,
  "clova-general": 0
};

export const OCR_ROUTING_ACTION = Object.freeze({
  APPROVAL_CANDIDATE: "APPROVAL_CANDIDATE",
  SELECTIVE_COMPARE: "SELECTIVE_COMPARE",
  GEMINI_COMPARE: "GEMINI_COMPARE",
  GPT_COMPARE: "GPT_COMPARE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
});

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

export function decideVisionLlmEscalation(signals = {}, policy = {}) {
  const evidenceComplete = Boolean(signals.evidenceComplete);
  const arithmeticOk = Boolean(signals.arithmeticOk);
  const criticalNumericExact = Boolean(signals.criticalNumericExact);
  const traceValid = signals.traceRequired === false || Boolean(signals.traceValid);
  const productMatchRate = Number(signals.productMatchRate ?? 0);
  const providerAttempts = Array.isArray(signals.providerAttempts) ? signals.providerAttempts : [];
  const geminiConfigured = Boolean(policy.geminiConfigured);

  if (evidenceComplete && arithmeticOk && criticalNumericExact && traceValid && productMatchRate >= 80) {
    return decision(
      OCR_ROUTING_ACTION.APPROVAL_CANDIDATE,
      "none",
      false,
      0,
      "All critical evidence and arithmetic checks passed; user approval is still required"
    );
  }

  if (geminiConfigured && !providerAttempts.includes("gemini-2.5-flash")) {
    return decision(
      OCR_ROUTING_ACTION.GEMINI_COMPARE,
      "gemini-2.5-flash",
      true,
      estimateTokenCostUsd(policy.geminiUsage, { inputPerMillion: 0.3, outputPerMillion: 2.5 }),
      "Critical evidence remains incomplete after deterministic OCR validation"
    );
  }

  return decision(
    OCR_ROUTING_ACTION.REVIEW_REQUIRED,
    "none",
    false,
    0,
    "Missing, conflicting, or unreadable evidence must be confirmed by a user"
  );
}

export function estimateTokenCostUsd(usage = {}, rates = {}) {
  const inputTokens = Math.max(0, Number(usage?.inputTokens ?? 0));
  const outputTokens = Math.max(0, Number(usage?.outputTokens ?? 0));
  const inputRate = Math.max(0, Number(rates?.inputPerMillion ?? 0));
  const outputRate = Math.max(0, Number(rates?.outputPerMillion ?? 0));
  return roundUsd((inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate);
}

export function projectMonthlyVisionCost(input = {}) {
  const pages = Math.max(0, Number(input.pages ?? 0));
  const geminiRate = clampRate(input.geminiCallRate ?? 0);
  const gptRate = clampRate(input.gptCallRate ?? 0);
  const geminiPerCallUsd = estimateTokenCostUsd(input.geminiUsage, { inputPerMillion: 0.3, outputPerMillion: 2.5 });
  const gptPerCallUsd = estimateTokenCostUsd(input.gptUsage, { inputPerMillion: 2, outputPerMillion: 8 });
  const geminiCalls = Math.ceil(pages * geminiRate);
  const gptCalls = Math.ceil(pages * gptRate);
  return {
    pages,
    geminiCalls,
    gptCalls,
    geminiPerCallUsd,
    gptPerCallUsd,
    totalUsd: roundUsd(geminiCalls * geminiPerCallUsd + gptCalls * gptPerCallUsd)
  };
}

function decision(action, providerId, externalCall, estimatedCostUsd, reason) {
  return { action, providerId, externalCall, estimatedCostUsd, reason };
}

function clampRate(value) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

function roundUsd(value) {
  return Math.round(Number(value ?? 0) * 1_000_000) / 1_000_000;
}
