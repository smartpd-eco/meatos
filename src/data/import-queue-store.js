const STORAGE_KEY = "meatos.import-queue.v1";

export class ImportQueueStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list() {
    return [...this.entries];
  }

  search(query = "") {
    const normalizedQuery = normalize(query);
    return this.entries.filter((entry) => {
      if (!normalizedQuery) return true;
      return normalize(entry.importId).includes(normalizedQuery)
        || normalize(entry.sourceId).includes(normalizedQuery)
        || normalize(entry.sourceName).includes(normalizedQuery)
        || normalize(entry.reviewNote).includes(normalizedQuery)
        || normalize(entry.status).includes(normalizedQuery)
        || normalize(entry.reviewStatus).includes(normalizedQuery);
    });
  }

  enqueue(input) {
    const entry = {
      importId: input.importId ?? `imp-${String(this.entries.length + 1).padStart(4, "0")}`,
      sourceId: String(input.sourceId ?? ""),
      sourceName: String(input.sourceName ?? "").trim(),
      sourceType: String(input.sourceType ?? "supplier").trim(),
      authorityLevel: String(input.authorityLevel ?? "L5").trim(),
      payloadType: String(input.payloadType ?? "raw").trim(),
      status: String(input.status ?? "pending_review").trim(),
      collectedAt: input.collectedAt ?? new Date().toISOString(),
      reviewStatus: String(input.reviewStatus ?? "pending_review").trim(),
      reviewer: String(input.reviewer ?? "").trim(),
      reviewNote: String(input.reviewNote ?? "").trim(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      updatedAt: input.updatedAt ?? new Date().toISOString()
    };

    this.entries.unshift(entry);
    this.persist();
    return entry;
  }

  update(importId, patch) {
    const entry = this.entries.find((item) => item.importId === importId);
    if (!entry) throw new Error(`Import Queue entry not found: ${importId}`);
    Object.assign(entry, normalizeEntry({ ...entry, ...patch, importId }));
    this.persist();
    return entry;
  }

  approve(importId, note = "") {
    return this.update(importId, {
      status: "APPROVED",
      reviewStatus: "approved",
      reviewNote: note || "승인"
    });
  }

  reject(importId, note = "") {
    return this.update(importId, {
      status: "REVIEW",
      reviewStatus: "rejected",
      reviewNote: note || "반려"
    });
  }

  hold(importId, note = "") {
    return this.update(importId, {
      status: "REVIEW",
      reviewStatus: "pending_review",
      reviewNote: note || "보류"
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
    importId: entry.importId ?? `imp-${String(Math.random()).slice(2, 8)}`,
    sourceId: String(entry.sourceId ?? ""),
    sourceName: String(entry.sourceName ?? "").trim(),
    sourceType: String(entry.sourceType ?? "supplier").trim(),
    authorityLevel: String(entry.authorityLevel ?? "L5").trim(),
    payloadType: String(entry.payloadType ?? "raw").trim(),
    status: String(entry.status ?? "NEW").trim(),
    collectedAt: entry.collectedAt ?? new Date().toISOString(),
    reviewStatus: String(entry.reviewStatus ?? "pending_review").trim(),
    reviewer: String(entry.reviewer ?? "").trim(),
    reviewNote: String(entry.reviewNote ?? "").trim(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}
