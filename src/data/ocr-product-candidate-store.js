const STORAGE_KEY = "meatos.ocr-product-candidates.v1";

export class OcrProductCandidateStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(filters = {}) {
    return this.entries.filter((entry) => {
      const matchesDocument = !filters.documentId || entry.documentId === filters.documentId;
      const matchesLine = !filters.lineNo || Number(entry.lineNo ?? 0) === Number(filters.lineNo);
      const matchesStatus = !filters.status || entry.status === filters.status;
      const matchesQuery = !filters.query || normalize(entry.rawName).includes(normalize(filters.query)) || normalize(entry.normalizedName).includes(normalize(filters.query));
      return matchesDocument && matchesLine && matchesStatus && matchesQuery;
    });
  }

  upsert(input) {
    const now = input.createdAt ?? new Date().toISOString();
    const key = buildKey(input);
    const existing = this.entries.find((entry) => entry.key === key);

    if (existing) {
      existing.rawName = String(input.rawName ?? existing.rawName ?? "").trim();
      existing.normalizedName = String(input.normalizedName ?? existing.normalizedName ?? "").trim();
      existing.dictionaryId = String(input.dictionaryId ?? existing.dictionaryId ?? "");
      existing.confidence = Math.max(existing.confidence, Number(input.confidence ?? existing.confidence ?? 0));
      existing.status = String(input.status ?? existing.status ?? "REVIEW_REQUIRED");
      existing.approvedBy = String(input.approvedBy ?? existing.approvedBy ?? "");
      existing.approvedAt = input.approvedAt ?? existing.approvedAt ?? null;
      existing.matchStrategy = String(input.matchStrategy ?? existing.matchStrategy ?? "SIMILARITY");
      existing.reason = String(input.reason ?? existing.reason ?? "");
      existing.sourceCount = Math.max(existing.sourceCount, Number(input.sourceCount ?? existing.sourceCount ?? 0));
      existing.updatedAt = input.updatedAt ?? now;
      this.persist();
      return existing;
    }

    const entry = normalizeEntry({
      candidateId: input.candidateId ?? `cand-${String(this.entries.length + 1).padStart(4, "0")}`,
      key,
      documentId: input.documentId,
      lineNo: input.lineNo,
      rawName: input.rawName,
      normalizedName: input.normalizedName,
      dictionaryId: input.dictionaryId,
      confidence: input.confidence,
      status: input.status,
      approvedBy: input.approvedBy,
      approvedAt: input.approvedAt,
      matchStrategy: input.matchStrategy,
      reason: input.reason,
      sourceCount: input.sourceCount,
      selectedBy: input.selectedBy,
      selectedAt: input.selectedAt,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    });

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  recordCandidate(input) {
    return this.upsert({
      ...input,
      status: input.status ?? "REVIEW_REQUIRED"
    });
  }

  recordUnknown(input) {
    return this.upsert({
      ...input,
      dictionaryId: "",
      confidence: Number(input.confidence ?? 0),
      status: "UNKNOWN",
      approvedBy: "",
      approvedAt: null,
      matchStrategy: input.matchStrategy ?? "UNKNOWN"
    });
  }

  summary() {
    const total = this.entries.length;
    const autoApprovedCount = this.entries.filter((entry) => entry.status === "AUTO_APPROVED").length;
    const reviewCount = this.entries.filter((entry) => entry.status === "REVIEW_REQUIRED" || entry.status === "USER_SELECT").length;
    const unknownCount = this.entries.filter((entry) => entry.status === "UNKNOWN").length;
    const avgConfidence = total ? Math.round(this.entries.reduce((sum, entry) => sum + Number(entry.confidence ?? 0), 0) / total) : 0;
    const dictionaryIncrease = new Set(this.entries.filter((entry) => entry.dictionaryId).map((entry) => entry.dictionaryId)).size;

    return {
      total,
      autoApprovedCount,
      reviewCount,
      unknownCount,
      avgConfidence,
      dictionaryIncrease,
      accuracy: total ? Math.round((autoApprovedCount / total) * 100) : 0
    };
  }

  load(seed) {
    if (typeof localStorage === "undefined") return [...seed].map(normalizeEntry);

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...seed].map(normalizeEntry);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...seed].map(normalizeEntry);
      return parsed.map(normalizeEntry);
    } catch {
      return [...seed].map(normalizeEntry);
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}

function buildKey(input) {
  return [
    String(input.documentId ?? ""),
    String(input.lineNo ?? 0),
    String(input.dictionaryId ?? ""),
    String(input.rawName ?? "").trim()
  ].join("|");
}

function normalizeEntry(entry) {
  return {
    ...entry,
    candidateId: String(entry.candidateId ?? entry.id ?? `cand-${String(Math.random()).slice(2, 8)}`),
    key: String(entry.key ?? ""),
    documentId: String(entry.documentId ?? ""),
    lineNo: Number(entry.lineNo ?? 0),
    rawName: String(entry.rawName ?? "").trim(),
    normalizedName: String(entry.normalizedName ?? "").trim(),
    dictionaryId: String(entry.dictionaryId ?? ""),
    confidence: Number(entry.confidence ?? 0),
    status: String(entry.status ?? "REVIEW_REQUIRED"),
    approvedBy: String(entry.approvedBy ?? ""),
    approvedAt: entry.approvedAt ?? null,
    matchStrategy: String(entry.matchStrategy ?? "SIMILARITY"),
    reason: String(entry.reason ?? "").trim(),
    sourceCount: Number(entry.sourceCount ?? 0),
    selectedBy: String(entry.selectedBy ?? "user"),
    selectedAt: entry.selectedAt ?? null,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}
