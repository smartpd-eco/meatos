import { buildAttributeSignature, normalizeProductAttributes } from "../data/product-attribute-standard.js";

export class ProductEngine {
  constructor({ categories, products, aliases, suppliers, aliasMemoryStore }) {
    this.categories = [...categories];
    this.products = products.map((product) => this.hydrateProduct(product));
    this.aliases = [...aliases];
    this.suppliers = [...suppliers];
    this.aliasMemoryStore = aliasMemoryStore ?? createFallbackAliasMemoryStore();
  }

  listCategories() {
    return this.categories.filter((item) => item.isActive !== false);
  }

  listProducts({ query = "", activeOnly = true } = {}) {
    const normalizedQuery = normalize(query);
    return this.products.filter((item) => {
      const matchesQuery = !normalizedQuery
        || normalize(item.name).includes(normalizedQuery)
        || normalize(item.cutName).includes(normalizedQuery)
        || normalize(item.attributeSignature).includes(normalizedQuery)
        || normalize(item.attributes?.species).includes(normalizedQuery)
        || normalize(item.attributes?.category).includes(normalizedQuery)
        || normalize(item.attributes?.part).includes(normalizedQuery)
        || normalize(item.attributes?.processing).includes(normalizedQuery)
        || normalize(item.attributes?.storage).includes(normalizedQuery)
        || normalize(item.attributes?.origin).includes(normalizedQuery)
        || normalize(item.attributes?.grade).includes(normalizedQuery);
      const matchesActive = !activeOnly || item.isActive !== false;
      return matchesQuery && matchesActive;
    });
  }

  listSuppliers({ query = "", activeOnly = true } = {}) {
    const normalizedQuery = normalize(query);
    return this.suppliers.filter((item) => {
      const matchesQuery = !normalizedQuery || normalize(item.name).includes(normalizedQuery);
      const matchesActive = !activeOnly || item.isActive !== false;
      return matchesQuery && matchesActive;
    });
  }

  listAliases({ query = "", activeOnly = true } = {}) {
    const normalizedQuery = normalize(query);
    return this.aliases
      .filter((item) => {
        const matchesQuery = !normalizedQuery || normalize(item.rawName).includes(normalizedQuery) || normalize(item.normalizedName).includes(normalizedQuery);
        const matchesActive = !activeOnly || item.isActive !== false;
        return matchesQuery && matchesActive;
      })
      .map((alias) => ({
        ...alias,
        product: this.findProductById(alias.productId),
        supplier: alias.supplierId ? this.findSupplierById(alias.supplierId) : undefined
      }));
  }

  listAliasMemory({ query = "", productId = "", sourceDomain = "", activeOnly = true } = {}) {
    const normalizedQuery = normalize(query);
    return this.aliasMemoryStore
      .list()
      .filter((entry) => {
        const matchesQuery = !normalizedQuery
          || normalize(entry.rawName).includes(normalizedQuery)
          || normalize(entry.displayName).includes(normalizedQuery)
          || normalize(this.findProductById(entry.productId)?.name).includes(normalizedQuery);
        const matchesProduct = !productId || entry.productId === productId;
        const matchesSourceDomain = !sourceDomain || entry.sourceDomain === sourceDomain;
        const matchesActive = !activeOnly || entry.isActive !== false;
        return matchesQuery && matchesProduct && matchesSourceDomain && matchesActive;
      })
      .map((entry) => ({
        ...entry,
        product: this.findProductById(entry.productId),
        supplier: entry.supplierId ? this.findSupplierById(entry.supplierId) : undefined
      }));
  }

  findProductById(productId) {
    return this.products.find((item) => item.id === productId);
  }

  findSupplierById(supplierId) {
    return this.suppliers.find((item) => item.id === supplierId);
  }

  findCategoryById(categoryId) {
    return this.categories.find((item) => item.id === categoryId);
  }

  findAliasById(aliasId) {
    return this.aliases.find((item) => item.id === aliasId);
  }

  findNaturalProductLabel(productId, fallbackName = "") {
    const product = this.findProductById(productId);
    if (!product) return fallbackName;
    return this.aliasMemoryStore.findNaturalLabel(productId, product.name ?? fallbackName);
  }

  createCategory(input) {
    assertRequired(input.name, "category name");
    assertRequired(input.code, "category code");

    const category = {
      id: nextId("cat", this.categories.length + 1),
      isActive: true,
      ...input
    };

    this.categories.unshift(category);
    return category;
  }

  updateCategory(categoryId, patch) {
    const category = this.findCategoryById(categoryId);
    if (!category) throw new Error(`Category not found: ${categoryId}`);
    Object.assign(category, patch);
    return category;
  }

  deactivateCategory(categoryId) {
    return this.updateCategory(categoryId, { isActive: false });
  }

  createProduct(input) {
    assertRequired(input.name, "product name");
    assertRequired(input.categoryId, "category id");
    this.assertCategoryExists(input.categoryId);
    if (input.supplierId) this.assertSupplierExists(input.supplierId);

    const product = this.hydrateProduct({
      id: nextId("prd", this.products.length + 1),
      supplierId: undefined,
      species: "",
      part: "",
      processingType: "",
      skinType: "",
      boneType: "",
      storageType: "",
      origin: "",
      grade: "",
      brand: "",
      baseUnit: "kg",
      safeStock: 0,
      moq: 0,
      traceRequired: true,
      isActive: true,
      ...input
    });

    this.products.unshift(product);
    return product;
  }

  updateProduct(productId, patch) {
    const product = this.findProductById(productId);
    if (!product) throw new Error(`Product not found: ${productId}`);
    if (patch.categoryId) this.assertCategoryExists(patch.categoryId);
    if (patch.supplierId) this.assertSupplierExists(patch.supplierId);
    const updated = this.hydrateProduct({ ...product, ...patch });
    Object.assign(product, updated);
    return product;
  }

  deactivateProduct(productId) {
    return this.updateProduct(productId, { isActive: false });
  }

  createSupplier(input) {
    assertRequired(input.name, "supplier name");

    const supplier = {
      id: nextId("sup", this.suppliers.length + 1),
      businessNumber: "",
      manager: "",
      phone: "",
      leadTimeDays: 1,
      isActive: true,
      ...input
    };

    this.suppliers.unshift(supplier);
    return supplier;
  }

  updateSupplier(supplierId, patch) {
    const supplier = this.findSupplierById(supplierId);
    if (!supplier) throw new Error(`Supplier not found: ${supplierId}`);
    Object.assign(supplier, patch);
    return supplier;
  }

  deactivateSupplier(supplierId) {
    return this.updateSupplier(supplierId, { isActive: false });
  }

  createAlias(input) {
    assertRequired(input.rawName, "alias raw name");
    assertRequired(input.productId, "alias product id");
    this.assertProductExists(input.productId);
    if (input.supplierId) this.assertSupplierExists(input.supplierId);

    const alias = {
      id: nextId("als", this.aliases.length + 1),
      rawName: input.rawName,
      normalizedName: normalize(input.rawName),
      supplierId: undefined,
      sourceType: "manual",
      confidence: 100,
      verified: true,
      useCount: 0,
      isActive: true,
      ...input,
      normalizedName: normalize(input.normalizedName ?? input.rawName)
    };

    this.aliases.unshift(alias);
    return this.enrichAlias(alias);
  }

  recordAliasMemory(input) {
    assertRequired(input.rawName, "alias memory raw name");
    assertRequired(input.productId, "alias memory product id");
    this.assertProductExists(input.productId);
    if (input.supplierId) this.assertSupplierExists(input.supplierId);

    return this.aliasMemoryStore.recordUsage({
      ...input,
      displayName: String(input.displayName ?? "").trim() || this.findNaturalProductLabel(input.productId, this.findProductById(input.productId)?.name ?? input.rawName),
      sourceDomain: input.sourceDomain ?? "unknown",
      sourceType: input.sourceType ?? "manual",
      confidence: input.confidence ?? 100,
      verified: input.verified ?? false,
      isActive: input.isActive ?? true
    });
  }

  updateAlias(aliasId, patch) {
    const alias = this.findAliasById(aliasId);
    if (!alias) throw new Error(`Alias not found: ${aliasId}`);
    if (patch.productId) this.assertProductExists(patch.productId);
    if (patch.supplierId) this.assertSupplierExists(patch.supplierId);
    if (patch.rawName) {
      patch.normalizedName = normalize(patch.rawName);
    }
    Object.assign(alias, patch);
    return this.enrichAlias(alias);
  }

  deactivateAlias(aliasId) {
    return this.updateAlias(aliasId, { isActive: false });
  }

  matchAlias(rawName, options = {}) {
    const {
      supplierId,
      sourceDomain = "unknown",
      sourceType = "unknown",
      persistUsage = false
    } = typeof options === "string" ? { supplierId: options } : options;

    const normalized = normalize(rawName);
    const candidates = this.aliases.filter((alias) => alias.isActive !== false && (!supplierId || !alias.supplierId || alias.supplierId === supplierId));
    const memoryCandidates = this.aliasMemoryStore
      .list()
      .filter((entry) => entry.isActive !== false && (!supplierId || !entry.supplierId || entry.supplierId === supplierId));

    const exact = candidates.find((alias) => alias.normalizedName === normalized);
    if (exact) {
      exact.useCount += 1;
      const product = this.findProductById(exact.productId);
      if (persistUsage && product) {
        this.recordAliasMemory({
          rawName,
          productId: product.id,
          supplierId: exact.supplierId ?? supplierId,
          displayName: this.findNaturalProductLabel(product.id, product.name),
          sourceDomain,
          sourceType,
          confidence: exact.confidence,
          verified: exact.verified
        });
      }
      return {
        rawName,
        aliasId: exact.id,
        product,
        supplier: exact.supplierId ? this.findSupplierById(exact.supplierId) : undefined,
        score: exact.confidence,
        displayName: this.findNaturalProductLabel(exact.productId, exact.normalizedName),
        status: exact.confidence >= 90 ? "matched" : "needs_review"
      };
    }

    const memoryExact = memoryCandidates.find((entry) => entry.normalizedName === normalized);
    if (memoryExact) {
      const product = this.findProductById(memoryExact.productId);
      const score = Math.round(Math.min(99, scoreMemoryEntry(memoryExact) * 100));
      if (persistUsage && product) {
        this.recordAliasMemory({
          rawName,
          productId: product.id,
          supplierId: memoryExact.supplierId ?? supplierId,
          displayName: memoryExact.displayName ?? product.name,
          sourceDomain,
          sourceType,
          confidence: score,
          verified: memoryExact.verified
        });
      }
      return {
        rawName,
        memoryId: memoryExact.id,
        product,
        supplier: memoryExact.supplierId ? this.findSupplierById(memoryExact.supplierId) : undefined,
        score,
        displayName: memoryExact.displayName ?? product?.name,
        status: "learned_match"
      };
    }

    const aliasCandidate = candidates
      .map((alias) => ({
        alias,
        score: similarityScore(normalized, alias.normalizedName)
      }))
      .sort((a, b) => b.score - a.score)[0];

    const memoryCandidate = memoryCandidates
      .map((entry) => ({
        memory: entry,
        score: Math.round(Math.min(99, similarityScore(normalized, entry.normalizedName) * scoreMemoryEntry(entry)))
      }))
      .sort((a, b) => b.score - a.score)[0];

    const candidate = selectBestCandidate(aliasCandidate, memoryCandidate);

    if (!candidate) {
      return { rawName, product: undefined, score: 0, status: "new_alias_candidate", displayName: rawName };
    }

    if (candidate.kind === "alias") {
      candidate.alias.useCount += 1;
      const product = this.findProductById(candidate.alias.productId);
      if (persistUsage && product) {
        this.recordAliasMemory({
          rawName,
          productId: product.id,
          supplierId: candidate.alias.supplierId ?? supplierId,
          displayName: this.findNaturalProductLabel(product.id, product.name),
          sourceDomain,
          sourceType,
          confidence: candidate.alias.confidence,
          verified: candidate.alias.verified
        });
      }
      const status = candidate.score >= 86 ? "needs_review" : "new_alias_candidate";
      return {
        rawName,
        aliasId: candidate.alias.id,
        product,
        supplier: candidate.alias.supplierId ? this.findSupplierById(candidate.alias.supplierId) : undefined,
        score: candidate.score,
        displayName: this.findNaturalProductLabel(candidate.alias.productId, candidate.alias.normalizedName),
        status
      };
    }

    candidate.memory.usageCount += 1;
    const product = this.findProductById(candidate.memory.productId);
    if (persistUsage && product) {
      this.recordAliasMemory({
        rawName,
        productId: product.id,
        supplierId: candidate.memory.supplierId ?? supplierId,
        displayName: candidate.memory.displayName ?? product.name,
        sourceDomain,
        sourceType,
        confidence: candidate.score,
        verified: candidate.memory.verified
      });
    }
    const status = candidate.score >= 86 ? "needs_review" : "new_alias_candidate";
    return {
      rawName,
      memoryId: candidate.memory.id,
      product,
      supplier: candidate.memory.supplierId ? this.findSupplierById(candidate.memory.supplierId) : undefined,
      score: candidate.score,
      displayName: candidate.memory.displayName ?? product?.name ?? rawName,
      status
    };
  }

  enrichAlias(alias) {
    return {
      ...alias,
      product: this.findProductById(alias.productId),
      supplier: alias.supplierId ? this.findSupplierById(alias.supplierId) : undefined
    };
  }

  hydrateProduct(product) {
    const attributes = normalizeProductAttributes(product);
    const categoryName = this.findCategoryById(product.categoryId)?.name ?? attributes.category;
    const baseUnit = String(product.baseUnit ?? attributes.unit ?? "kg").trim() || "kg";
    const hydratedAttributes = {
      ...attributes,
      category: String(product.category ?? categoryName ?? "").trim(),
      unit: baseUnit
    };

    return {
      ...product,
      supplierId: product.supplierId ?? undefined,
      species: String(product.species ?? hydratedAttributes.species ?? "").trim(),
      part: String(product.part ?? hydratedAttributes.part ?? "").trim(),
      processingType: String(product.processingType ?? hydratedAttributes.processing ?? "").trim(),
      skinType: String(product.skinType ?? hydratedAttributes.skin ?? "").trim(),
      boneType: String(product.boneType ?? hydratedAttributes.bone ?? "").trim(),
      storageType: String(product.storageType ?? hydratedAttributes.storage ?? "").trim(),
      origin: String(product.origin ?? hydratedAttributes.origin ?? "").trim(),
      grade: String(product.grade ?? hydratedAttributes.grade ?? "").trim(),
      baseUnit,
      attributes: hydratedAttributes,
      attributeSignature: buildAttributeSignature(hydratedAttributes)
    };
  }

  assertProductExists(productId) {
    if (!this.findProductById(productId)) throw new Error(`Product not found: ${productId}`);
  }

  assertSupplierExists(supplierId) {
    if (!this.findSupplierById(supplierId)) throw new Error(`Supplier not found: ${supplierId}`);
  }

  assertCategoryExists(categoryId) {
    if (!this.findCategoryById(categoryId)) throw new Error(`Category not found: ${categoryId}`);
  }
}

function nextId(prefix, index) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function assertRequired(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing ${fieldName}`);
  }
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;

  let matches = 0;
  for (const char of new Set(a)) {
    if (b.includes(char)) matches += 1;
  }

  return Math.round((matches / Math.max(a.length, b.length)) * 100);
}

function scoreMemoryEntry(entry) {
  const domainWeights = {
    government: 1.35,
    organization: 1.24,
    distributor: 1.14,
    butcher_shop: 1.06,
    consumer: 0.92,
    unknown: 1
  };
  const typeWeights = {
    supplier_invoice: 1.2,
    pos: 1.08,
    manual: 1.1,
    ocr: 1.05,
    unknown: 1
  };
  const confidenceWeight = Math.max(0.5, (entry.confidence ?? 100) / 100);
  const usageWeight = 1 + Math.min(entry.usageCount ?? 1, 50) * 0.04;
  const verifiedWeight = entry.verified ? 1.08 : 1;
  return (domainWeights[entry.sourceDomain] ?? 1)
    * (typeWeights[entry.sourceType] ?? 1)
    * confidenceWeight
    * usageWeight
    * verifiedWeight;
}

function selectBestCandidate(aliasCandidate, memoryCandidate) {
  if (!aliasCandidate && !memoryCandidate) return null;
  if (!aliasCandidate) return { ...memoryCandidate, kind: "memory" };
  if (!memoryCandidate) return { ...aliasCandidate, kind: "alias" };
  if (aliasCandidate.score >= memoryCandidate.score) return { ...aliasCandidate, kind: "alias" };
  return { ...memoryCandidate, kind: "memory" };
}

function createFallbackAliasMemoryStore() {
  const entries = [];
  return {
    list: () => [...entries],
    getByProduct: (productId) => entries.filter((entry) => entry.productId === productId),
    recordUsage(input) {
      const normalizedName = normalize(input.normalizedName ?? input.rawName);
      const existing = entries.find((entry) => entry.productId === input.productId && entry.normalizedName === normalizedName && entry.supplierId === (input.supplierId ?? undefined) && entry.sourceDomain === (input.sourceDomain ?? "unknown") && entry.sourceType === (input.sourceType ?? "manual"));
      if (existing) {
        existing.usageCount += input.usageCount ?? 1;
        existing.lastSeenAt = input.lastSeenAt ?? new Date().toISOString();
        existing.confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence);
        existing.displayName = String(input.displayName ?? "").trim() || existing.displayName;
        existing.verified = input.verified ?? existing.verified;
        existing.isActive = input.isActive ?? existing.isActive;
        return existing;
      }

      const entry = {
        id: input.id ?? `mem-${String(entries.length + 1).padStart(3, "0")}`,
        rawName: input.rawName,
        normalizedName,
        displayName: String(input.displayName ?? "").trim() || input.rawName,
        productId: input.productId,
        supplierId: input.supplierId,
        sourceDomain: input.sourceDomain ?? "unknown",
        sourceType: input.sourceType ?? "manual",
        confidence: input.confidence ?? 100,
        verified: input.verified ?? false,
        usageCount: input.usageCount ?? 1,
        firstSeenAt: input.firstSeenAt ?? new Date().toISOString(),
        lastSeenAt: input.lastSeenAt ?? new Date().toISOString(),
        isActive: input.isActive ?? true
      };
      entries.unshift(entry);
      return entry;
    },
    rankByProduct(productId) {
      return entries
        .filter((entry) => entry.productId === productId && entry.isActive !== false)
        .map((entry) => ({ ...entry, score: scoreMemoryEntry(entry) }))
        .sort((a, b) => b.score - a.score);
    },
    findNaturalLabel(productId, fallbackName) {
      const ranked = entries
        .filter((entry) => entry.productId === productId && entry.isActive !== false)
        .map((entry) => ({ ...entry, score: scoreMemoryEntry(entry) }))
        .sort((a, b) => b.score - a.score);
      return ranked[0]?.displayName ?? fallbackName;
    }
  };
}
