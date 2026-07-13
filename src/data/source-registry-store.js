const STORAGE_KEY = "meatos.source-registry.v1";

export class SourceRegistryStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(filters = {}) {
    const normalizedQuery = normalize(filters.query);
    return this.entries.filter((entry) => {
      const matchesQuery = !normalizedQuery
        || normalize(entry.sourceId).includes(normalizedQuery)
        || normalize(entry.sourceName).includes(normalizedQuery)
        || normalize(entry.organization).includes(normalizedQuery)
        || normalize(entry.collector).includes(normalizedQuery);
      const matchesType = !filters.sourceType || entry.sourceType === filters.sourceType;
      const matchesAuthority = !filters.authorityLevel || entry.authorityLevel === filters.authorityLevel;
      const matchesActive = filters.activeOnly === false || entry.status !== "inactive";
      return matchesQuery && matchesType && matchesAuthority && matchesActive;
    });
  }

  create(input) {
    const entry = normalizeEntry({
      sourceId: input.sourceId ?? `src-${String(this.entries.length + 1).padStart(4, "0")}`,
      sourceName: input.sourceName,
      sourceType: input.sourceType ?? "supplier",
      organization: input.organization ?? input.sourceName,
      authorityLevel: input.authorityLevel ?? "L5",
      collectedAt: input.collectedAt ?? new Date().toISOString(),
      collector: input.collector ?? "system",
      status: input.status ?? "active"
    });

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  update(sourceId, patch) {
    const entry = this.entries.find((item) => item.sourceId === sourceId);
    if (!entry) throw new Error(`Source Registry entry not found: ${sourceId}`);
    Object.assign(entry, normalizeEntry({ ...entry, ...patch, sourceId }));
    this.persist();
    return entry;
  }

  deactivate(sourceId) {
    return this.update(sourceId, { status: "inactive" });
  }

  getById(sourceId) {
    return this.entries.find((entry) => entry.sourceId === sourceId);
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
    sourceId: String(entry.sourceId ?? "").trim(),
    sourceName: String(entry.sourceName ?? "").trim(),
    sourceType: String(entry.sourceType ?? "supplier").trim(),
    organization: String(entry.organization ?? "").trim(),
    authorityLevel: String(entry.authorityLevel ?? "L5").trim(),
    collectedAt: entry.collectedAt ?? new Date().toISOString(),
    collector: String(entry.collector ?? "").trim(),
    status: String(entry.status ?? "active").trim(),
    updatedAt: entry.updatedAt ?? new Date().toISOString()
  };
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}
