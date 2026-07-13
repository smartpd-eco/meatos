const STORAGE_KEY = "meatos.ocr-supplier-templates.v1";

export class OcrSupplierTemplateStore {
  constructor(seed = []) {
    this.entries = this.load(seed);
  }

  list(filters = {}) {
    return this.entries.filter((entry) => {
      const matchesSupplier = !filters.supplierName || normalize(entry.supplierName) === normalize(filters.supplierName);
      const matchesProvider = !filters.providerId || entry.providerId === filters.providerId;
      return matchesSupplier && matchesProvider;
    });
  }

  recordTemplate(input) {
    const supplierName = String(input.supplierName ?? "").trim();
    const providerId = String(input.providerId ?? "").trim();
    const templateKey = buildTemplateKey(supplierName, providerId);
    const now = input.updatedAt ?? new Date().toISOString();
    const existing = this.entries.find((entry) => entry.templateKey === templateKey);

    if (existing) {
      existing.documentCount += 1;
      existing.sampleProductNames = mergeSampleNames(existing.sampleProductNames, input.sampleProductNames);
      existing.qualityScore = Math.round((Number(existing.qualityScore ?? 0) + Number(input.qualityScore ?? 0)) / 2);
      existing.avgConfidence = weightedAverage(existing.avgConfidence, input.avgConfidence, existing.documentCount - 1);
      existing.headerAliases = mergeObject(existing.headerAliases, input.headerAliases);
      existing.columnLayout = mergeColumnLayout(existing.columnLayout, input.columnLayout, existing.documentCount);
      existing.anchorWords = mergeSampleNames(existing.anchorWords, input.anchorWords);
      existing.expectedFields = mergeSampleNames(existing.expectedFields, input.expectedFields);
      existing.qualityRules = mergeObject(existing.qualityRules, input.qualityRules);
      existing.lastObservedAt = now;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const entry = normalizeEntry({
      templateId: input.templateId ?? `tpl-${String(this.entries.length + 1).padStart(4, "0")}`,
      templateKey,
      supplierName,
      providerId,
      documentCount: Number(input.documentCount ?? 1),
      sampleProductNames: Array.isArray(input.sampleProductNames) ? input.sampleProductNames : [],
      avgConfidence: Number(input.avgConfidence ?? 0),
      qualityScore: Number(input.qualityScore ?? 0),
      headerAliases: input.headerAliases ?? {},
      columnLayout: input.columnLayout ?? {},
      anchorWords: input.anchorWords ?? [],
      expectedFields: input.expectedFields ?? [],
      qualityRules: input.qualityRules ?? {},
      lastObservedAt: input.lastObservedAt ?? now,
      createdAt: input.createdAt ?? now,
      updatedAt: now
    });

    this.entries.unshift(entry);
    this.persist();
    return entry;
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

function buildTemplateKey(supplierName, providerId) {
  return `${normalize(supplierName)}|${providerId}`;
}

function mergeSampleNames(current = [], incoming = []) {
  return [...new Set([...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])].map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeEntry(entry) {
  return {
    ...entry,
    templateId: String(entry.templateId ?? entry.id ?? `tpl-${String(Math.random()).slice(2, 8)}`),
    templateKey: String(entry.templateKey ?? buildTemplateKey(entry.supplierName ?? "", entry.providerId ?? "")),
    supplierName: String(entry.supplierName ?? "").trim(),
    providerId: String(entry.providerId ?? "").trim(),
    documentCount: Number(entry.documentCount ?? 1),
    sampleProductNames: mergeSampleNames(entry.sampleProductNames ?? [], []),
    avgConfidence: Number(entry.avgConfidence ?? 0),
    qualityScore: Number(entry.qualityScore ?? 0),
    headerAliases: entry.headerAliases && typeof entry.headerAliases === "object" ? entry.headerAliases : {},
    columnLayout: entry.columnLayout && typeof entry.columnLayout === "object" ? entry.columnLayout : {},
    anchorWords: mergeSampleNames(entry.anchorWords ?? [], []),
    expectedFields: mergeSampleNames(entry.expectedFields ?? [], []),
    qualityRules: entry.qualityRules && typeof entry.qualityRules === "object" ? entry.qualityRules : {},
    lastObservedAt: entry.lastObservedAt ?? entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()
  };
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function weightedAverage(current, incoming, previousCount) {
  const next = Number(incoming ?? 0);
  if (!next) return Number(current ?? 0);
  return Math.round(((Number(current ?? 0) * previousCount) + next) / (previousCount + 1));
}

function mergeObject(current, incoming) {
  return { ...(current && typeof current === "object" ? current : {}), ...(incoming && typeof incoming === "object" ? incoming : {}) };
}

function mergeColumnLayout(current, incoming, sampleCount) {
  if (!incoming?.columns?.length) return current ?? {};
  if (!current?.columns?.length) return { ...incoming, sampleCount: 1 };
  const previousWeight = Math.max(1, Number(sampleCount ?? 2) - 1);
  const incomingByKey = new Map(incoming.columns.map((column) => [column.key, column]));
  const columns = current.columns.map((column) => {
    const next = incomingByKey.get(column.key);
    if (!next) return column;
    return {
      ...column,
      headerText: next.headerText || column.headerText,
      minX: average(column.minX, next.minX, previousWeight),
      maxX: average(column.maxX, next.maxX, previousWeight),
      centerX: average(column.centerX, next.centerX, previousWeight),
      normalized: {
        minX: average(column.normalized?.minX, next.normalized?.minX, previousWeight, 6),
        maxX: average(column.normalized?.maxX, next.normalized?.maxX, previousWeight, 6),
        centerX: average(column.normalized?.centerX, next.normalized?.centerX, previousWeight, 6)
      },
      confidence: average(column.confidence, next.confidence, previousWeight)
    };
  });
  for (const next of incoming.columns) {
    if (!columns.some((column) => column.key === next.key)) columns.push(next);
  }
  return {
    ...current,
    ...incoming,
    columns: columns.sort((left, right) => left.centerX - right.centerX),
    confidence: average(current.confidence, incoming.confidence, previousWeight),
    sampleCount: previousWeight + 1
  };
}

function average(current, incoming, previousWeight, precision = 2) {
  const currentValue = Number(current ?? 0);
  const incomingValue = Number(incoming ?? 0);
  return Number((((currentValue * previousWeight) + incomingValue) / (previousWeight + 1)).toFixed(precision));
}
