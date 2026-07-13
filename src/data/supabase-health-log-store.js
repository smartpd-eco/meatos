const STORAGE_KEY = "meatos.supabase.health-log.v1";

export class SupabaseHealthLogStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(limit = 20) {
    return [...this.entries].slice(0, limit);
  }

  add(entry) {
    const record = {
      id: entry.id ?? `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      checkedAt: entry.checkedAt ?? new Date().toISOString(),
      status: entry.status ?? "unknown",
      latencyMs: Number(entry.latencyMs ?? 0),
      schema: entry.schema ?? "public",
      migrationStatus: entry.migrationStatus ?? "unknown",
      seedStatus: entry.seedStatus ?? "unknown",
      readStatus: entry.readStatus ?? "unknown",
      tableStatus: entry.tableStatus ?? {},
      errorCode: entry.errorCode ?? "",
      errorMessage: entry.errorMessage ?? ""
    };

    this.entries.unshift(record);
    this.persist();
    return record;
  }

  load(seed) {
    if (typeof localStorage === "undefined") return [...seed];

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...seed];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [...seed];
    } catch {
      return [...seed];
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }
}
