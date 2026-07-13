const STORAGE_KEY = "meatos.learning-table.v1";

export class LearningTableStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list() {
    return [...this.entries];
  }

  recordLearning(input) {
    const originalName = String(input.originalName ?? "").trim();
    const supplierId = input.supplierId ?? "";
    const productMasterId = input.productMasterId ?? "";
    const key = `${supplierId}|${originalName}|${productMasterId}`;
    const now = input.lastUsedAt ?? new Date().toISOString();
    const existing = this.entries.find((entry) => entry.key === key);

    if (existing) {
      existing.learningCount += input.learningCount ?? 1;
      existing.confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence);
      existing.autoApply = input.autoApply ?? existing.autoApply;
      existing.lastUsedAt = now;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const entry = {
      learningId: input.learningId ?? `learn-${String(this.entries.length + 1).padStart(4, "0")}`,
      key,
      supplierId,
      originalName,
      productMasterId,
      confidence: Number(input.confidence ?? 0),
      learningCount: Number(input.learningCount ?? 1),
      autoApply: Boolean(input.autoApply ?? false),
      lastUsedAt: now,
      createdAt: input.createdAt ?? now,
      updatedAt: now
    };

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  update(learningId, patch) {
    const entry = this.entries.find((item) => item.learningId === learningId);
    if (!entry) throw new Error(`Learning entry not found: ${learningId}`);
    Object.assign(entry, normalizeEntry({ ...entry, ...patch, learningId }));
    this.persist();
    return entry;
  }

  approve(learningId) {
    return this.update(learningId, {
      autoApply: true
    });
  }

  reject(learningId) {
    return this.update(learningId, {
      autoApply: false
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
}

function normalizeEntry(entry) {
    return {
      ...entry,
    learningId: entry.learningId ?? entry.id ?? `learn-${String(Math.random()).slice(2, 8)}`,
    key: entry.key ?? `${entry.supplierId ?? ""}|${String(entry.originalName ?? "").trim()}|${entry.productMasterId ?? ""}`,
    supplierId: String(entry.supplierId ?? ""),
    originalName: String(entry.originalName ?? "").trim(),
    productMasterId: String(entry.productMasterId ?? ""),
    confidence: Number(entry.confidence ?? 0),
    learningCount: Number(entry.learningCount ?? 1),
    autoApply: Boolean(entry.autoApply ?? false),
    lastUsedAt: entry.lastUsedAt ?? entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}
