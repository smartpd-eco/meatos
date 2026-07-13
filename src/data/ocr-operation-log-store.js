const STORAGE_KEY = "meatos.ocr-operation-log.v1";

export class OcrOperationLogStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(limit = 20) {
    return [...this.entries].slice(0, limit);
  }

  summary() {
    const entries = this.entries;
    const now = Date.now();
    const last24h = entries.filter((entry) => Date.parse(entry.occurredAt ?? "") >= now - 24 * 60 * 60 * 1000);
    const successCount = last24h.filter((entry) => entry.resultStatus === "SUCCESS").length;
    const failureCount = last24h.filter((entry) => entry.resultStatus === "FAILURE").length;
    const reviewCount = last24h.filter((entry) => entry.resultStatus === "REVIEW").length;
    const averageDurationMs = last24h.length
      ? Math.round(last24h.reduce((sum, entry) => sum + Number(entry.durationMs ?? 0), 0) / last24h.length)
      : 0;
    const averageConfidence = last24h.length
      ? Math.round(last24h.reduce((sum, entry) => sum + Number(entry.confidence ?? 0), 0) / last24h.length)
      : 0;
    const lastOperation = entries[0] ?? null;
    const topSupplier = findTopValue(last24h.map((entry) => entry.supplierName).filter(Boolean));
    const recentAlias = last24h.find((entry) => entry.recentAlias)?.recentAlias || lastOperation?.recentAlias || "";
    const activeProviderName = lastOperation?.activeProviderName || lastOperation?.providerName || "";
    const activeProviderVersion = lastOperation?.activeProviderVersion || lastOperation?.providerVersion || "";

    return {
      totalCount: entries.length,
      todayCount: last24h.length,
      successRate: last24h.length ? Math.round((successCount / last24h.length) * 100) : 0,
      reviewRate: last24h.length ? Math.round((reviewCount / last24h.length) * 100) : 0,
      failureRate: last24h.length ? Math.round((failureCount / last24h.length) * 100) : 0,
      averageDurationMs,
      averageConfidence,
      lastOperation,
      topSupplier,
      recentAlias,
      secretConnected: lastOperation?.secretConnected ?? false,
      providerLabel: lastOperation ? `${activeProviderName || "미확인"} / ${activeProviderVersion || "-"}` : "",
      secretLabel: lastOperation ? (lastOperation.secretConnected ? "Connected" : "Missing") : "Missing"
    };
  }

  record(input) {
    const entry = normalizeEntry(input);
    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  load(seed) {
    const fallback = Array.isArray(seed) ? seed.map(normalizeEntry) : [];
    if (typeof localStorage === "undefined") return fallback;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : fallback;
    } catch {
      return fallback;
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}

function normalizeEntry(entry) {
  return {
    id: String(entry.id ?? `ocr-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    documentId: String(entry.documentId ?? "").trim(),
    supplierName: String(entry.supplierName ?? "").trim(),
    providerName: String(entry.providerName ?? "").trim(),
    providerVersion: String(entry.providerVersion ?? "").trim(),
    activeProviderName: String(entry.activeProviderName ?? entry.providerName ?? "").trim(),
    activeProviderVersion: String(entry.activeProviderVersion ?? entry.providerVersion ?? "").trim(),
    fallbackApplied: Boolean(entry.fallbackApplied ?? false),
    resultStatus: String(entry.resultStatus ?? "SUCCESS").trim(),
    durationMs: Number(entry.durationMs ?? 0),
    confidence: Number(entry.confidence ?? 0),
    costEstimate: Number(entry.costEstimate ?? 0),
    retryCount: Number(entry.retryCount ?? 0),
    secretConnected: Boolean(entry.secretConnected ?? false),
    recentAlias: String(entry.recentAlias ?? "").trim(),
    failureReason: String(entry.failureReason ?? "").trim(),
    occurredAt: String(entry.occurredAt ?? new Date().toISOString())
  };
}

function findTopValue(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let topValue = "";
  let topCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > topCount) {
      topValue = value;
      topCount = count;
    }
  }
  return topValue;
}
