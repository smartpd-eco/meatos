const STORAGE_KEY = "meatos.ocr-provider-health-log.v1";

export class OcrProviderHealthLogStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(limit = 20) {
    return [...this.entries].slice(0, limit);
  }

  summary() {
    const entries = this.entries;
    const successEntries = entries.filter((entry) => entry.ok !== false && entry.secretConnected !== false);
    const failureEntries = entries.filter((entry) => entry.ok === false || entry.secretConnected === false);
    const averageLatencyMs = entries.length
      ? Math.round(entries.reduce((sum, entry) => sum + Number(entry.latencyMs ?? 0), 0) / entries.length)
      : 0;
    const latest = entries[0] ?? null;
    const previous = entries[1] ?? null;

    return {
      total: entries.length,
      successCount: successEntries.length,
      failureCount: failureEntries.length,
      averageLatencyMs,
      latest,
      lastCheckedAt: latest?.checkedAt ?? null,
      providerName: latest?.providerName ?? "",
      providerVersion: latest?.providerVersion ?? "",
      secretConnected: latest?.secretConnected ?? false,
      secretFingerprint: latest?.secretFingerprint ?? "",
      rotationDetected: Boolean(
        latest
        && previous
        && latest.secretFingerprint
        && previous.secretFingerprint
        && latest.secretFingerprint !== previous.secretFingerprint
      ),
      statusLabel: latest ? (latest.ok === false ? "FAIL" : "OK") : "UNKNOWN",
      secretLabel: latest?.providerVersion?.startsWith("paddleocr") ? "N/A" : (latest?.secretConnected ? "Connected" : "Missing")
    };
  }

  record(entry) {
    const record = normalizeHealthEntry(entry);
    this.entries.unshift(record);
    this.persist();
    return record;
  }

  load(seed) {
    const fallback = Array.isArray(seed) ? seed.map(normalizeHealthEntry) : [];
    if (typeof localStorage === "undefined") return fallback;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeHealthEntry) : fallback;
    } catch {
      return fallback;
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}

function normalizeHealthEntry(entry) {
  return {
    id: String(entry.id ?? `ocr-health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    checkedAt: String(entry.checkedAt ?? new Date().toISOString()),
    ok: Boolean(entry.ok ?? false),
    secretConnected: Boolean(entry.secretConnected ?? false),
    providerName: String(entry.providerName ?? "").trim(),
    providerVersion: String(entry.providerVersion ?? "").trim(),
    providerMode: String(entry.providerMode ?? "").trim(),
    secretFingerprint: String(entry.secretFingerprint ?? "").trim(),
    latencyMs: Number(entry.latencyMs ?? 0),
    message: String(entry.message ?? "").trim(),
    errorCode: String(entry.errorCode ?? "").trim(),
    source: String(entry.source ?? "manual").trim()
  };
}
