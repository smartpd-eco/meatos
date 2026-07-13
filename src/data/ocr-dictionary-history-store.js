const STORAGE_KEY = "meatos.ocr-dictionary-history.v1";

export class OcrDictionaryHistoryStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(filters = {}) {
    return this.entries.filter((entry) => {
      const matchesDocument = !filters.documentId || entry.documentId === filters.documentId;
      const matchesSupplier = !filters.supplierId || entry.supplierId === filters.supplierId;
      const matchesProduct = !filters.productId || entry.productId === filters.productId;
      const matchesQuery = !filters.query || normalize(entry.rawName).includes(normalize(filters.query)) || normalize(entry.selectedProductName).includes(normalize(filters.query));
      return matchesDocument && matchesSupplier && matchesProduct && matchesQuery;
    });
  }

  recordSelection(input) {
    const now = input.selectedAt ?? new Date().toISOString();
    const key = buildKey(input);
    const existing = this.entries.find((entry) => entry.key === key);

    if (existing) {
      existing.selectionCount += 1;
      existing.confidence = Math.max(existing.confidence, Number(input.confidence ?? existing.confidence));
      existing.sourceCount = Math.max(existing.sourceCount, Number(input.sourceCount ?? existing.sourceCount));
      existing.aliasMatch = String(input.aliasMatch ?? existing.aliasMatch);
      existing.reason = String(input.reason ?? existing.reason);
      existing.decisionType = String(input.decisionType ?? existing.decisionType ?? "MANUAL_SELECTION");
      existing.lastSelectedAt = now;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const entry = {
      selectionId: input.selectionId ?? `sel-${String(this.entries.length + 1).padStart(4, "0")}`,
      key,
      documentId: String(input.documentId ?? ""),
      lineNo: Number(input.lineNo ?? 0),
      rawName: String(input.rawName ?? "").trim(),
      supplierId: String(input.supplierId ?? ""),
      supplierName: String(input.supplierName ?? "").trim(),
      productId: String(input.productId ?? ""),
      productName: String(input.productName ?? "").trim(),
      aliasId: String(input.aliasId ?? ""),
      aliasMatch: String(input.aliasMatch ?? "Product Name"),
      decisionType: String(input.decisionType ?? "MANUAL_SELECTION"),
      confidence: Number(input.confidence ?? 0),
      sourceCount: Number(input.sourceCount ?? 0),
      selectedBy: String(input.selectedBy ?? "user"),
      sourceLabel: String(input.sourceLabel ?? "ocr"),
      reason: String(input.reason ?? "").trim(),
      selectionCount: Number(input.selectionCount ?? 1),
      firstSelectedAt: now,
      lastSelectedAt: now,
      createdAt: input.createdAt ?? now,
      updatedAt: now
    };

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  recordUnknown(input) {
    return this.recordSelection({
      ...input,
      productId: "__UNKNOWN__",
      productName: "Unknown",
      aliasId: "",
      aliasMatch: "UNKNOWN",
      decisionType: "UNKNOWN",
      confidence: Number(input.confidence ?? 0),
      selectedBy: input.selectedBy ?? "system",
      sourceLabel: input.sourceLabel ?? "ocr"
    });
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

  summary() {
    const total = this.entries.length;
    const avgConfidence = total ? Math.round(this.entries.reduce((sum, entry) => sum + Number(entry.confidence ?? 0), 0) / total) : 0;
    const repeatedSelections = this.entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.selectionCount ?? 1) - 1), 0);
    const unknownCount = this.entries.filter((entry) => entry.decisionType === "UNKNOWN" || entry.productId === "__UNKNOWN__").length;
    const autoApprovedCount = this.entries.filter((entry) => entry.decisionType === "AUTO_APPROVED").length;
    return {
      total,
      avgConfidence,
      repeatedSelections,
      unknownCount,
      autoApprovedCount,
      learningScore: Math.min(100, Math.round(avgConfidence * 0.6 + Math.min(40, repeatedSelections * 4)))
    };
  }
}

function buildKey(input) {
  return [
    String(input.documentId ?? ""),
    String(input.lineNo ?? 0),
    String(input.supplierId ?? ""),
    String(input.rawName ?? "").trim(),
    String(input.productId ?? "")
  ].join("|");
}

function normalizeEntry(entry) {
  return {
    ...entry,
    selectionId: String(entry.selectionId ?? entry.id ?? `sel-${String(Math.random()).slice(2, 8)}`),
    key: String(entry.key ?? ""),
    documentId: String(entry.documentId ?? ""),
    lineNo: Number(entry.lineNo ?? 0),
    rawName: String(entry.rawName ?? "").trim(),
    supplierId: String(entry.supplierId ?? ""),
    supplierName: String(entry.supplierName ?? "").trim(),
    productId: String(entry.productId ?? ""),
    productName: String(entry.productName ?? "").trim(),
    aliasId: String(entry.aliasId ?? ""),
    aliasMatch: String(entry.aliasMatch ?? "Product Name"),
    decisionType: String(entry.decisionType ?? "MANUAL_SELECTION"),
    confidence: Number(entry.confidence ?? 0),
    sourceCount: Number(entry.sourceCount ?? 0),
    selectedBy: String(entry.selectedBy ?? "user"),
    sourceLabel: String(entry.sourceLabel ?? "ocr"),
    reason: String(entry.reason ?? "").trim(),
    selectionCount: Number(entry.selectionCount ?? 1),
    firstSelectedAt: entry.firstSelectedAt ?? entry.createdAt ?? new Date().toISOString(),
    lastSelectedAt: entry.lastSelectedAt ?? entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}
