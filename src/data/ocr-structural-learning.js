export function buildStructuralLearningSample(input = {}) {
  const provider = input.providerResult ?? {};
  const correction = input.correction ?? {};
  return {
    schemaVersion: "MEATOS_STRUCTURAL_LEARNING_V1",
    tenantId: String(input.tenantId ?? "").trim(),
    supplierId: String(input.supplierId ?? "").trim(),
    documentHash: String(input.documentHash ?? "").trim(),
    providerId: String(provider.providerId ?? "").trim(),
    providerVersion: String(provider.providerVersion ?? "").trim(),
    rawText: String(provider.rawText ?? ""),
    wordCoordinates: (provider.words ?? []).map((word) => ({ text: word.text, confidence: word.confidence, bounds: word.bounds })),
    layoutSignals: provider.layoutSignals ?? {},
    tableElements: (provider.tables ?? []).map((table) => ({ text: table.text, html: table.html, bounds: table.bounds })),
    fieldName: String(correction.fieldName ?? "").trim(),
    beforeValue: String(correction.beforeValue ?? "").trim(),
    afterValue: String(correction.afterValue ?? "").trim(),
    selectedDictionaryId: String(correction.selectedDictionaryId ?? "").trim(),
    arithmeticValidated: Boolean(input.arithmeticValidated),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}
