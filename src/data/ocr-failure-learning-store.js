const STORAGE_KEY = "meatos.ocr-failure-learning.v1";

export class OcrFailureLearningStore {
  constructor(seed = {}) {
    this.state = this.load(seed);
  }

  listFailureCases() {
    return [...this.state.failureCases];
  }

  listCorrections() {
    return [...this.state.corrections];
  }

  listPatterns() {
    return [...this.state.patterns];
  }

  summary() {
    return {
      failureCaseCount: this.state.failureCases.length,
      correctionCount: this.state.corrections.length,
      patternCount: this.state.patterns.length,
      openFailureCount: this.state.failureCases.filter((entry) => entry.status !== "RESOLVED").length,
      avgFailureConfidence: average(this.state.failureCases.map((entry) => Number(entry.providerConfidence ?? 0)))
    };
  }

  recordFailureCase(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const entry = {
      failureCaseId: input.failureCaseId ?? `fail-${String(this.state.failureCases.length + 1).padStart(4, "0")}`,
      tenantId: String(input.tenantId ?? "").trim(),
      ocrDocumentId: String(input.ocrDocumentId ?? "").trim(),
      ocrLineItemId: input.ocrLineItemId ? String(input.ocrLineItemId).trim() : null,
      supplierId: input.supplierId ? String(input.supplierId).trim() : null,
      supplierName: input.supplierName ? String(input.supplierName).trim() : null,
      templateId: input.templateId ? String(input.templateId).trim() : null,
      failureType: String(input.failureType ?? "UNKNOWN").trim(),
      rawText: String(input.rawText ?? "").trim(),
      expectedText: input.expectedText ? String(input.expectedText).trim() : null,
      providerName: String(input.providerName ?? "").trim(),
      providerConfidence: Number(input.providerConfidence ?? 0),
      qualityGrade: String(input.qualityGrade ?? "E").trim(),
      failureReasonCodes: dedupeStrings(input.failureReasonCodes ?? []),
      imageRegionPath: input.imageRegionPath ? String(input.imageRegionPath).trim() : null,
      status: String(input.status ?? "OPEN").trim(),
      createdAt: now,
      resolvedAt: input.resolvedAt ?? null
    };

    this.state.failureCases.unshift(entry);
    this.persist();
    return entry;
  }

  recordCorrection(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const entry = {
      correctionId: input.correctionId ?? `corr-${String(this.state.corrections.length + 1).padStart(4, "0")}`,
      tenantId: String(input.tenantId ?? "").trim(),
      failureCaseId: String(input.failureCaseId ?? "").trim(),
      beforeText: String(input.beforeText ?? "").trim(),
      afterText: String(input.afterText ?? "").trim(),
      selectedDictionaryId: input.selectedDictionaryId ? String(input.selectedDictionaryId).trim() : null,
      correctionType: String(input.correctionType ?? "MANUAL_CORRECTION").trim(),
      correctedBy: input.correctedBy ? String(input.correctedBy).trim() : null,
      createdAt: now
    };

    this.state.corrections.unshift(entry);
    this.persist();
    return entry;
  }

  recordPatternLearning(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const key = buildPatternKey(input);
    const existing = this.state.patterns.find((entry) => entry.key === key);
    if (existing) {
      existing.sampleCount += Number(input.sampleCount ?? 1);
      existing.successCount += Number(input.successCount ?? 0);
      existing.confidence = Math.min(100, Math.round((existing.confidence + Number(input.confidence ?? 0)) / 2));
      existing.lastUsedAt = input.lastUsedAt ?? now;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const entry = {
      patternId: input.patternId ?? `pattern-${String(this.state.patterns.length + 1).padStart(4, "0")}`,
      key,
      tenantId: String(input.tenantId ?? "").trim(),
      supplierId: input.supplierId ? String(input.supplierId).trim() : null,
      templateId: input.templateId ? String(input.templateId).trim() : null,
      patternType: String(input.patternType ?? "UNKNOWN").trim(),
      sourcePattern: String(input.sourcePattern ?? "").trim(),
      targetPattern: String(input.targetPattern ?? "").trim(),
      sampleCount: Number(input.sampleCount ?? 1),
      successCount: Number(input.successCount ?? 0),
      confidence: Number(input.confidence ?? 0),
      lastUsedAt: input.lastUsedAt ?? now,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now
    };

    this.state.patterns.unshift(entry);
    this.persist();
    return entry;
  }

  load(seed) {
    const fallback = {
      failureCases: Array.isArray(seed.failureCases) ? seed.failureCases.map(normalizeFailureCase) : [],
      corrections: Array.isArray(seed.corrections) ? seed.corrections.map(normalizeCorrection) : [],
      patterns: Array.isArray(seed.patterns) ? seed.patterns.map(normalizePattern) : []
    };

    if (typeof localStorage === "undefined") return fallback;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        failureCases: Array.isArray(parsed.failureCases) ? parsed.failureCases.map(normalizeFailureCase) : fallback.failureCases,
        corrections: Array.isArray(parsed.corrections) ? parsed.corrections.map(normalizeCorrection) : fallback.corrections,
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns.map(normalizePattern) : fallback.patterns
      };
    } catch {
      return fallback;
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}

function buildPatternKey(input) {
  return [
    String(input.tenantId ?? ""),
    String(input.supplierId ?? ""),
    String(input.templateId ?? ""),
    String(input.patternType ?? ""),
    String(input.sourcePattern ?? ""),
    String(input.targetPattern ?? "")
  ].join("|");
}

function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value ?? 0), 0) / values.length;
}

function normalizeFailureCase(entry) {
  return {
    failureCaseId: String(entry.failureCaseId ?? entry.id ?? `fail-${String(Math.random()).slice(2, 8)}`),
    tenantId: String(entry.tenantId ?? "").trim(),
    ocrDocumentId: String(entry.ocrDocumentId ?? "").trim(),
    ocrLineItemId: entry.ocrLineItemId ? String(entry.ocrLineItemId).trim() : null,
    supplierId: entry.supplierId ? String(entry.supplierId).trim() : null,
    supplierName: entry.supplierName ? String(entry.supplierName).trim() : null,
    templateId: entry.templateId ? String(entry.templateId).trim() : null,
    failureType: String(entry.failureType ?? "UNKNOWN").trim(),
    rawText: String(entry.rawText ?? "").trim(),
    expectedText: entry.expectedText ? String(entry.expectedText).trim() : null,
    providerName: String(entry.providerName ?? "").trim(),
    providerConfidence: Number(entry.providerConfidence ?? 0),
    qualityGrade: String(entry.qualityGrade ?? "E").trim(),
    failureReasonCodes: dedupeStrings(entry.failureReasonCodes ?? []),
    imageRegionPath: entry.imageRegionPath ? String(entry.imageRegionPath).trim() : null,
    status: String(entry.status ?? "OPEN").trim(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    resolvedAt: entry.resolvedAt ?? null
  };
}

function normalizeCorrection(entry) {
  return {
    correctionId: String(entry.correctionId ?? entry.id ?? `corr-${String(Math.random()).slice(2, 8)}`),
    tenantId: String(entry.tenantId ?? "").trim(),
    failureCaseId: String(entry.failureCaseId ?? "").trim(),
    beforeText: String(entry.beforeText ?? "").trim(),
    afterText: String(entry.afterText ?? "").trim(),
    selectedDictionaryId: entry.selectedDictionaryId ? String(entry.selectedDictionaryId).trim() : null,
    correctionType: String(entry.correctionType ?? "MANUAL_CORRECTION").trim(),
    correctedBy: entry.correctedBy ? String(entry.correctedBy).trim() : null,
    createdAt: entry.createdAt ?? new Date().toISOString()
  };
}

function normalizePattern(entry) {
  return {
    patternId: String(entry.patternId ?? entry.id ?? `pattern-${String(Math.random()).slice(2, 8)}`),
    key: String(entry.key ?? buildPatternKey(entry)),
    tenantId: String(entry.tenantId ?? "").trim(),
    supplierId: entry.supplierId ? String(entry.supplierId).trim() : null,
    templateId: entry.templateId ? String(entry.templateId).trim() : null,
    patternType: String(entry.patternType ?? "UNKNOWN").trim(),
    sourcePattern: String(entry.sourcePattern ?? "").trim(),
    targetPattern: String(entry.targetPattern ?? "").trim(),
    sampleCount: Number(entry.sampleCount ?? 0),
    successCount: Number(entry.successCount ?? 0),
    confidence: Number(entry.confidence ?? 0),
    lastUsedAt: entry.lastUsedAt ?? entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    isActive: entry.isActive !== false,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}
