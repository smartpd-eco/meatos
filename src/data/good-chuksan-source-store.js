const STORAGE_KEY = "meatos.good-chuksan-source-rows.v1";

export class GoodChuksanSourceStore {
  constructor({ batch, seedRows = [] } = {}) {
    this.batch = batch ?? null;
    this.rows = this.load(seedRows);
  }

  list(filters = {}) {
    const {
      query = "",
      unit2Raw = "",
      originRaw = "",
      storageType = "",
      mappingStatus = "",
      reviewStatus = "",
      productClass = "",
      onlyDups = false,
      onlyCosts = false
    } = filters;

    const normalizedQuery = normalize(query);
    return this.rows.filter((row) => {
      const matchesQuery = !normalizedQuery
        || normalize(row.sourceProductCode).includes(normalizedQuery)
        || normalize(row.sourceProductName).includes(normalizedQuery)
        || normalize(row.normalizedName).includes(normalizedQuery);
      const matchesUnit2 = !unit2Raw || row.unit2Raw === unit2Raw;
      const matchesOrigin = !originRaw || row.originRaw === originRaw;
      const matchesStorage = !storageType || row.inferredStorageType === storageType;
      const matchesMapping = !mappingStatus || row.mappingStatus === mappingStatus;
      const matchesReview = !reviewStatus || row.reviewStatus === reviewStatus;
      const matchesProductClass = !productClass || row.productClassCode === productClass || row.productClassName === productClass;
      const matchesDuplicate = !onlyDups || row.isDuplicate;
      const matchesCost = !onlyCosts || row.isCostItem;
      return matchesQuery && matchesUnit2 && matchesOrigin && matchesStorage && matchesMapping && matchesReview && matchesProductClass && matchesDuplicate && matchesCost;
    });
  }

  listReviewQueue() {
    return this.rows.filter((row) => row.reviewStatus === "pending_review");
  }

  listDuplicateGroups() {
    const groups = new Map();
    for (const row of this.rows) {
      const key = row.duplicateGroupKey ?? row.normalizedName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    return [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({
        key,
        count: items.length,
        rows: items
      }))
      .sort((a, b) => b.count - a.count);
  }

  summary() {
    const duplicateGroups = this.listDuplicateGroups();
    return {
      batchId: this.batch?.id ?? "",
      supplierName: this.batch?.supplierName ?? "좋은축산",
      sourceFile: this.batch?.sourceFile ?? "",
      sourceSheet: this.batch?.sourceSheet ?? "",
      sourcePrintedDate: this.batch?.sourcePrintedDate ?? "",
      expectedRows: this.batch?.expectedRows ?? 0,
      loadedRows: this.rows.length,
      pendingReviewCount: this.rows.filter((row) => row.reviewStatus === "pending_review").length,
      mappedCount: this.rows.filter((row) => row.mappedProductId).length,
      duplicateGroupCount: duplicateGroups.length,
      costItemCount: this.rows.filter((row) => row.isCostItem).length
    };
  }

  getRowById(rowId) {
    return this.rows.find((row) => row.id === rowId);
  }

  updateRow(rowId, patch) {
    const row = this.getRowById(rowId);
    if (!row) throw new Error(`Good Chuksan source row not found: ${rowId}`);
    Object.assign(row, patch, {
      updatedAt: new Date().toISOString()
    });
    this.persist();
    return row;
  }

  assignMapping(rowId, { mappedProductId, reviewStatus = "approved", reviewNote = "" }) {
    const row = this.updateRow(rowId, {
      mappedProductId: mappedProductId ?? "",
      reviewStatus,
      mappingStatus: mappedProductId ? "mapped" : "pending_review",
      reviewNote
    });
    return row;
  }

  markDuplicate(rowId, reviewNote = "중복 원문명") {
    return this.updateRow(rowId, {
      isDuplicate: true,
      mappingStatus: "duplicate",
      reviewStatus: "pending_review",
      reviewNote
    });
  }

  load(seedRows) {
    if (typeof localStorage === "undefined") {
      return seedRows.map(normalizeRow);
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedRows.map(normalizeRow);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return seedRows.map(normalizeRow);
      return parsed.map(normalizeRow);
    } catch {
      return seedRows.map(normalizeRow);
    }
  }

  persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rows));
  }
}

function normalizeRow(row, index = 0) {
  const sourceProductName = String(row.sourceProductName ?? "").trim();
  const normalizedName = String(row.normalizedName ?? sourceProductName).trim() || sourceProductName;
  const unit2Raw = String(row.unit2Raw ?? "").trim();
  const inferredStorageType = row.inferredStorageType ?? inferStorageType(sourceProductName);
  const mappingStatus = row.mappingStatus ?? inferMappingStatus(row);
  const reviewStatus = row.reviewStatus ?? "pending_review";
  const isCostItem = Boolean(row.isCostItem ?? ["작업비", "운송비", "부가세"].includes(sourceProductName));

  return {
    id: row.id ?? `gcs-${String(index + 1).padStart(4, "0")}`,
    batchId: row.batchId ?? "batch-good-chuksan-20260707",
    rowNo: Number(row.rowNo ?? index + 1),
    sourceProductCode: String(row.sourceProductCode ?? "").trim(),
    sourceProductName,
    originRaw: String(row.originRaw ?? "").trim(),
    gradeRaw: String(row.gradeRaw ?? "").trim(),
    unit1Raw: String(row.unit1Raw ?? "").trim(),
    unit2Raw,
    purchasePrice: Number(row.purchasePrice ?? 0),
    salesPrice: Number(row.salesPrice ?? 0),
    majorCategoryCode: String(row.majorCategoryCode ?? "").trim(),
    majorCategoryName: String(row.majorCategoryName ?? "").trim(),
    middleCategoryCode: String(row.middleCategoryCode ?? "").trim(),
    middleCategoryName: String(row.middleCategoryName ?? "").trim(),
    minorCategoryCode: String(row.minorCategoryCode ?? "").trim(),
    minorCategoryName: String(row.minorCategoryName ?? "").trim(),
    productClassCode: String(row.productClassCode ?? "").trim(),
    productClassName: String(row.productClassName ?? "").trim(),
    cutCode: String(row.cutCode ?? "").trim(),
    cutName: String(row.cutName ?? "").trim(),
    importTypeCode: String(row.importTypeCode ?? "").trim(),
    importTypeName: String(row.importTypeName ?? "").trim(),
    supplierName: String(row.supplierName ?? "좋은축산").trim() || "좋은축산",
    normalizedName,
    inferredSpecies: row.inferredSpecies ?? inferSpecies(unit2Raw, sourceProductName),
    inferredStorageType,
    mappingStatus,
    reviewStatus,
    reviewNote: String(row.reviewNote ?? "").trim(),
    mappedProductId: String(row.mappedProductId ?? "").trim(),
    isDuplicate: Boolean(row.isDuplicate ?? false),
    isCostItem,
    duplicateGroupKey: String(row.duplicateGroupKey ?? normalizedName).trim() || normalizedName,
    createdAt: row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updatedAt ?? new Date().toISOString()
  };
}

function inferSpecies(unit2Raw, productName) {
  const value = `${unit2Raw} ${productName}`;
  if (value.includes("돈육") || value.includes("돼지") || value.includes("삼겹") || value.includes("전지")) return "돼지";
  if (value.includes("우육") || value.includes("한우") || value.includes("우")) return "소";
  if (value.includes("닭")) return "닭";
  return "기타";
}

function inferStorageType(productName) {
  if (productName.includes("냉장")) return "냉장";
  if (productName.includes("냉동")) return "냉동";
  return "미표기";
}

function inferMappingStatus(row) {
  if (["작업비", "운송비", "부가세"].includes(String(row.sourceProductName ?? "").trim())) return "cost_item";
  return "pending_review";
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}
