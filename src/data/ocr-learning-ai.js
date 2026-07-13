export function buildOcrLearningSample(input = {}) {
  return {
    tenantId: String(input.tenantId ?? "").trim(),
    supplierId: String(input.supplierId ?? "").trim(),
    templateId: String(input.templateId ?? "").trim(),
    fieldName: String(input.fieldName ?? "").trim(),
    rawText: String(input.rawText ?? "").trim(),
    selectedText: String(input.selectedText ?? "").trim(),
    providerCandidates: Array.isArray(input.providerCandidates) ? input.providerCandidates : [],
    imageCropHash: String(input.imageCropHash ?? "").trim(),
    userCorrection: String(input.userCorrection ?? "").trim(),
    acceptedAliasId: String(input.acceptedAliasId ?? "").trim(),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function deriveLearningImpact(previousConfidence, repeatedCount = 1) {
  const confidence = clamp(Number(previousConfidence ?? 0), 0, 100);
  const repeatBoost = Math.min(15, Math.log2(Number(repeatedCount ?? 1) + 1) * 4);
  return clamp(Math.round(confidence + repeatBoost), 0, 100);
}

export function normalizeLearningCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
    provider: String(candidate?.provider ?? "").trim(),
    value: String(candidate?.value ?? "").trim(),
    confidence: clamp(Number(candidate?.confidence ?? 0), 0, 100)
  }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
}
