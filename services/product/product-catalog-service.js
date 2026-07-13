export class ProductCatalogService {
  constructor({ productEngine, eventEngine, learningTableStore }) {
    this.productEngine = productEngine;
    this.eventEngine = eventEngine;
    this.learningTableStore = learningTableStore ?? createFallbackLearningTableStore();
  }

  getCatalogSnapshot() {
    return {
      categories: this.productEngine.listCategories(),
      products: this.productEngine.listProducts({ activeOnly: false }),
      suppliers: this.productEngine.listSuppliers({ activeOnly: false }),
      aliases: this.productEngine.listAliases({ activeOnly: false }),
      aliasMemory: this.productEngine.listAliasMemory({ activeOnly: false }),
      learningTable: this.listLearningTable()
    };
  }

  createCategory(input, actor = "user") {
    const category = this.productEngine.createCategory(input);
    this.eventEngine.record("product_category.created", {
      categoryId: category.id,
      code: category.code,
      name: category.name
    }, actor);
    return category;
  }

  updateCategory(categoryId, patch, actor = "user") {
    const category = this.productEngine.updateCategory(categoryId, patch);
    this.eventEngine.record("product_category.updated", { categoryId, patch }, actor);
    return category;
  }

  deactivateCategory(categoryId, actor = "user") {
    const category = this.productEngine.deactivateCategory(categoryId);
    this.eventEngine.record("product_category.deactivated", { categoryId }, actor);
    return category;
  }

  createStandardProduct(input, actor = "user") {
    const product = this.productEngine.createProduct(input);
    this.eventEngine.record("product.created", {
      productId: product.id,
      name: product.name,
      categoryId: product.categoryId
    }, actor);
    return product;
  }

  updateStandardProduct(productId, patch, actor = "user") {
    const product = this.productEngine.updateProduct(productId, patch);
    this.eventEngine.record("product.updated", { productId, patch }, actor);
    return product;
  }

  deactivateStandardProduct(productId, actor = "user") {
    const product = this.productEngine.deactivateProduct(productId);
    this.eventEngine.record("product.deactivated", { productId }, actor);
    return product;
  }

  createSupplier(input, actor = "user") {
    const supplier = this.productEngine.createSupplier(input);
    this.eventEngine.record("supplier.created", {
      supplierId: supplier.id,
      name: supplier.name
    }, actor);
    return supplier;
  }

  updateSupplier(supplierId, patch, actor = "user") {
    const supplier = this.productEngine.updateSupplier(supplierId, patch);
    this.eventEngine.record("supplier.updated", { supplierId, patch }, actor);
    return supplier;
  }

  deactivateSupplier(supplierId, actor = "user") {
    const supplier = this.productEngine.deactivateSupplier(supplierId);
    this.eventEngine.record("supplier.deactivated", { supplierId }, actor);
    return supplier;
  }

  createProductAlias(input, actor = "user") {
    const alias = this.productEngine.createAlias(input);
    this.eventEngine.record("product_alias.created", {
      aliasId: alias.id,
      rawName: alias.rawName,
      productId: alias.productId,
      supplierId: alias.supplierId
    }, actor);
    return alias;
  }

  updateProductAlias(aliasId, patch, actor = "user") {
    const alias = this.productEngine.updateAlias(aliasId, patch);
    this.eventEngine.record("product_alias.updated", { aliasId, patch }, actor);
    return alias;
  }

  deactivateProductAlias(aliasId, actor = "user") {
    const alias = this.productEngine.deactivateAlias(aliasId);
    this.eventEngine.record("product_alias.deactivated", { aliasId }, actor);
    return alias;
  }

  listAliasMemory(filters = {}) {
    return this.productEngine.listAliasMemory(filters);
  }

  recordAliasMemory(input, actor = "user") {
    const memory = this.productEngine.recordAliasMemory(input);
    this.eventEngine.record("product_alias_memory.recorded", {
      memoryId: memory.id,
      rawName: memory.rawName,
      productId: memory.productId,
      supplierId: memory.supplierId,
      sourceDomain: memory.sourceDomain,
      sourceType: memory.sourceType,
      confidence: memory.confidence
    }, actor);
    return memory;
  }

  listLearningTable() {
    return this.learningTableStore.list();
  }

  recordLearning(input, actor = "user") {
    const learning = this.learningTableStore.recordLearning(input);
    this.eventEngine.record("product_learning.recorded", {
      learningId: learning.learningId,
      supplierId: learning.supplierId,
      originalName: learning.originalName,
      productMasterId: learning.productMasterId,
      confidence: learning.confidence,
      learningCount: learning.learningCount,
      autoApply: learning.autoApply,
      lastUsedAt: learning.lastUsedAt
    }, actor);
    return learning;
  }

  recommendAlias(rawName, options = {}, actor = "system") {
    const match = this.productEngine.matchAlias(rawName, options);
    this.eventEngine.record("product_alias.recommended", {
      rawName,
      supplierId: options?.supplierId,
      sourceDomain: options?.sourceDomain,
      sourceType: options?.sourceType,
      aliasId: match.aliasId,
      memoryId: match.memoryId,
      productId: match.product?.id,
      score: match.score,
      status: match.status
    }, actor);
    return match;
  }
}

function createFallbackLearningTableStore() {
  const entries = [];
  return {
    list: () => [...entries],
    recordLearning(input) {
      const existing = entries.find((entry) => entry.supplierId === (input.supplierId ?? "") && entry.originalName === String(input.originalName ?? "").trim() && entry.productMasterId === (input.productMasterId ?? ""));
      const now = input.lastUsedAt ?? new Date().toISOString();
      if (existing) {
        existing.learningCount += input.learningCount ?? 1;
        existing.confidence = Math.max(existing.confidence, input.confidence ?? existing.confidence);
        existing.autoApply = input.autoApply ?? existing.autoApply;
        existing.lastUsedAt = now;
        existing.updatedAt = now;
        return existing;
      }

      const entry = {
        learningId: input.learningId ?? `learn-${String(entries.length + 1).padStart(4, "0")}`,
        supplierId: String(input.supplierId ?? ""),
        originalName: String(input.originalName ?? "").trim(),
        productMasterId: String(input.productMasterId ?? ""),
        confidence: Number(input.confidence ?? 0),
        learningCount: Number(input.learningCount ?? 1),
        autoApply: Boolean(input.autoApply ?? false),
        lastUsedAt: now,
        createdAt: input.createdAt ?? now,
        updatedAt: now
      };
      entries.unshift(entry);
      return entry;
    }
  };
}
