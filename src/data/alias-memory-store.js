const STORAGE_KEY = "meatos.alias-memory.v1";

const SOURCE_DOMAIN_WEIGHTS = {
  government: 1.35,
  organization: 1.24,
  distributor: 1.14,
  butcher_shop: 1.06,
  consumer: 0.92,
  unknown: 1
};

const SOURCE_TYPE_WEIGHTS = {
  supplier_invoice: 1.2,
  pos: 1.08,
  manual: 1.1,
  ocr: 1.05,
  unknown: 1
};

export class AliasMemoryStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list() {
    return [...this.entries];
  }

  getByProduct(productId) {
    return this.entries.filter((entry) => entry.productId === productId);
  }

  recordUsage(input) {
    const normalizedName = normalize(input.normalizedName ?? input.rawName);
    const key = buildKey({
      productId: input.productId,
      supplierId: input.supplierId,
      normalizedName,
      sourceDomain: input.sourceDomain,
      sourceType: input.sourceType
    });

    const now = input.lastSeenAt ?? new Date().toISOString();
    const existing = this.entries.find((entry) => entry.key === key);

    if (existing) {
      existing.rawName = input.rawName ?? existing.rawName;
      existing.displayName = input.displayName ?? existing.displayName;
      existing.confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence);
      existing.usageCount += input.usageCount ?? 1;
      existing.lastSeenAt = now;
      existing.sourceDomain = input.sourceDomain ?? existing.sourceDomain;
      existing.sourceType = input.sourceType ?? existing.sourceType;
      existing.verified = input.verified ?? existing.verified;
      existing.isActive = input.isActive ?? existing.isActive;
      this.persist();
      return existing;
    }

    const entry = {
      id: input.id ?? `mem-${String(this.entries.length + 1).padStart(3, "0")}`,
      key,
      rawName: input.rawName,
      normalizedName,
      displayName: normalizeDisplayName(input.displayName, input.rawName),
      productId: input.productId,
      supplierId: input.supplierId,
      sourceDomain: input.sourceDomain ?? "unknown",
      sourceType: input.sourceType ?? "manual",
      confidence: input.confidence ?? 100,
      verified: input.verified ?? false,
      usageCount: input.usageCount ?? 1,
      firstSeenAt: input.firstSeenAt ?? now,
      lastSeenAt: now,
      isActive: input.isActive ?? true
    };

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  rankByProduct(productId) {
    return this.getByProduct(productId)
      .filter((entry) => entry.isActive !== false)
      .map((entry) => ({
        ...entry,
        score: scoreEntry(entry)
      }))
      .sort((a, b) => b.score - a.score);
  }

  findNaturalLabel(productId, fallbackName) {
    const ranked = this.rankByProduct(productId);
    if (!ranked.length) return fallbackName;
    return ranked[0].displayName ?? fallbackName;
  }

  load(seed) {
    if (typeof localStorage === "undefined") {
      return [...seed];
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...seed];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...seed];
      return parsed.map(normalizeEntry);
    } catch {
      return [...seed];
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}

function buildKey({ productId, supplierId, normalizedName, sourceDomain, sourceType }) {
  return [productId ?? "", supplierId ?? "", normalizedName ?? "", sourceDomain ?? "", sourceType ?? ""].join("|");
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeEntry(entry) {
  return {
    ...entry,
    key: entry.key ?? buildKey({
      productId: entry.productId,
      supplierId: entry.supplierId,
      normalizedName: entry.normalizedName ?? entry.rawName,
      sourceDomain: entry.sourceDomain,
      sourceType: entry.sourceType
    }),
    normalizedName: normalize(entry.normalizedName ?? entry.rawName),
    displayName: normalizeDisplayName(entry.displayName, entry.rawName),
    sourceDomain: entry.sourceDomain ?? "unknown",
    sourceType: entry.sourceType ?? "manual",
    confidence: Number(entry.confidence ?? 100),
    usageCount: Number(entry.usageCount ?? 1),
    verified: Boolean(entry.verified ?? false),
    isActive: entry.isActive !== false
  };
}

function scoreEntry(entry) {
  const domainWeight = SOURCE_DOMAIN_WEIGHTS[entry.sourceDomain] ?? 1;
  const typeWeight = SOURCE_TYPE_WEIGHTS[entry.sourceType] ?? 1;
  const confidenceWeight = Math.max(0.5, (entry.confidence ?? 100) / 100);
  const usageWeight = 1 + Math.min(entry.usageCount ?? 1, 50) * 0.04;
  const verifiedWeight = entry.verified ? 1.08 : 1;
  return domainWeight * typeWeight * confidenceWeight * usageWeight * verifiedWeight;
}

function normalizeDisplayName(displayName, fallback) {
  const value = String(displayName ?? "").trim();
  if (value) return value;
  return String(fallback ?? "").trim();
}
