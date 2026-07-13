const MAX_CANDIDATES = 5;

export function buildOcrDictionaryCandidates({ document, lineItem, catalog, historyEntries = [] }) {
  const rawName = String(lineItem?.rawProductName ?? "").trim();
  const normalizedRaw = normalize(rawName);
  const compactRaw = normalizeCompact(rawName);
  const symbolRaw = normalizeSymbols(rawName);
  const supplierId = String(document?.sourceId ?? "").trim();
  const supplierName = String(document?.supplierName ?? document?.sourceName ?? "").trim();

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const aliases = Array.isArray(catalog?.aliases) ? catalog.aliases : [];
  const aliasMemory = Array.isArray(catalog?.aliasMemory) ? catalog.aliasMemory : [];
  const learningTable = Array.isArray(catalog?.learningTable) ? catalog.learningTable : [];

  const candidates = products.map((product) => {
    const normalizedProductName = normalize(product.name);
    const compactProductName = normalizeCompact(product.name);
    const symbolProductName = normalizeSymbols(product.name);
    const productNameScore = bestNameScore({
      normalizedRaw,
      compactRaw,
      symbolRaw,
      normalizedProductName,
      compactProductName,
      symbolProductName
    });

    const productAliases = aliases.filter((alias) => alias.productId === product.id && alias.isActive !== false);
    const supplierAliases = productAliases.filter((alias) => !supplierId || !alias.supplierId || alias.supplierId === supplierId);
    const productMemory = aliasMemory.filter((entry) => entry.productId === product.id && entry.isActive !== false);
    const supplierMemory = productMemory.filter((entry) => !supplierId || !entry.supplierId || entry.supplierId === supplierId);
    const productLearning = learningTable.filter((entry) => entry.productMasterId === product.id);
    const supplierLearning = productLearning.filter((entry) => !supplierId || !entry.supplierId || entry.supplierId === supplierId);

    const bestAlias = bestMatch(rawName, supplierAliases.length ? supplierAliases : productAliases);
    const bestMemory = bestMatch(rawName, supplierMemory.length ? supplierMemory : productMemory);
    const bestLearning = bestLearningMatch(supplierLearning.length ? supplierLearning : productLearning);
    const matchStrategy = bestMatchStrategy({
      rawName,
      normalizedRaw,
      compactRaw,
      symbolRaw,
      productName: product.name,
      aliases: productAliases,
      supplierAliases,
      memory: productMemory,
      supplierMemory
    });

    const historyCount = historyEntries.filter((entry) => entry.productId === product.id && normalize(entry.rawName) === normalizedRaw).length;
    const sourceCount = supplierAliases.length + supplierMemory.length + supplierLearning.length;
    const sourceBoost = Math.min(20, sourceCount * 4);
    const historyBoost = Math.min(12, historyCount * 3);
    const learningBoost = Math.min(15, (bestLearning?.confidence ?? 0) / 10 + Math.log2((bestLearning?.learningCount ?? 0) + 1) * 2);
    const aliasBoost = bestAlias ? Math.min(20, bestAlias.score * 0.2) : 0;
    const memoryBoost = bestMemory ? Math.min(15, bestMemory.score * 0.15) : 0;

    const confidence = clamp(
      Math.round(
        (productNameScore * 0.38)
        + aliasBoost
        + memoryBoost
        + learningBoost
        + sourceBoost
        + historyBoost
      ),
      0,
      100
    );
    const route = resolveOcrCandidateRoute(confidence);

    const aliasMatch = bestAlias
      ? supplierAliases.includes(bestAlias.item) && bestAlias.item.supplierId
        ? "Supplier Alias"
        : "Alias"
      : bestMemory
        ? "Alias Memory"
        : bestLearning
          ? "Learning"
          : "Product Name";

    return {
      productId: product.id,
      standardProductName: product.name,
      confidence,
      aliasMatch,
      sourceCount,
      aliasCount: supplierAliases.length,
      supplierAliasCount: supplierAliases.filter((alias) => alias.supplierId).length,
      sharedAliasCount: supplierAliases.filter((alias) => !alias.supplierId).length,
      memoryCount: supplierMemory.length,
      learningCount: supplierLearning.reduce((sum, entry) => sum + Number(entry.learningCount ?? 1), 0),
      supplierName,
      normalizedRawName: normalizedRaw,
      normalizedProductName,
      matchStrategy,
      route,
      matchKind: matchKind({ bestAlias, bestMemory, bestLearning, productNameScore }),
      reason: buildReason({
        productNameScore,
        bestAlias,
        bestMemory,
        bestLearning,
        sourceCount,
        historyCount
      }),
      signal: {
        productNameScore,
        aliasScore: bestAlias?.score ?? 0,
        memoryScore: bestMemory?.score ?? 0,
        learningScore: bestLearning?.confidence ?? 0,
        historyCount
      },
      selectedAliasId: bestAlias?.item?.id ?? "",
      selectedMemoryId: bestMemory?.item?.id ?? "",
      selectedLearningId: bestLearning?.item?.learningId ?? ""
    };
  });

  return candidates
    .sort((left, right) => right.confidence - left.confidence || right.sourceCount - left.sourceCount || left.standardProductName.localeCompare(right.standardProductName))
    .slice(0, MAX_CANDIDATES);
}

function bestMatch(rawName, items) {
  if (!items.length) return null;
  const normalizedRaw = normalize(rawName);
  return items
    .map((item) => ({
      item,
      score: Math.max(
        similarity(normalizedRaw, normalize(item.rawName ?? item.displayName ?? item.normalizedName ?? item.name ?? "")),
        similarity(normalizedRaw, normalize(item.displayName ?? item.normalizedName ?? item.name ?? ""))
      )
    }))
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

function bestMatchStrategy({ rawName, normalizedRaw, compactRaw, symbolRaw, productName, aliases, supplierAliases, memory, supplierMemory }) {
  const candidates = [
    {
      strategy: "EXACT",
      score: normalizedRaw && normalizedRaw === normalize(productName) ? 100 : 0
    },
    {
      strategy: "ALIAS",
      score: bestStrategyScore(rawName, [...supplierAliases, ...aliases], ["rawName", "displayName", "normalizedName", "name"], 98)
    },
    {
      strategy: "COMPACT",
      score: compactRaw && compactRaw === normalizeCompact(productName) ? 96 : 0
    },
    {
      strategy: "SYMBOL_STRIP",
      score: symbolRaw && symbolRaw === normalizeSymbols(productName) ? 95 : 0
    },
    {
      strategy: "PARTIAL",
      score: partialMatchScore(normalizedRaw, normalize(productName))
    },
    {
      strategy: "SIMILARITY",
      score: bestStrategyScore(rawName, [...supplierMemory, ...memory], ["rawName", "displayName", "normalizedName"], 92)
    }
  ];

  const top = candidates.sort((a, b) => b.score - a.score)[0];
  return top?.strategy ?? "SIMILARITY";
}

function bestNameScore({ normalizedRaw, compactRaw, symbolRaw, normalizedProductName, compactProductName, symbolProductName }) {
  const exact = normalizedRaw && normalizedRaw === normalizedProductName ? 100 : 0;
  const compact = compactRaw && compactRaw === compactProductName ? 96 : 0;
  const symbol = symbolRaw && symbolRaw === symbolProductName ? 95 : 0;
  const partial = partialMatchScore(normalizedRaw, normalizedProductName);
  const similarityScore = similarity(normalizedRaw, normalizedProductName);
  return Math.max(exact, compact, symbol, partial, similarityScore);
}

function bestStrategyScore(rawName, items, fields, exactScore) {
  if (!items.length) return 0;
  const normalizedRaw = normalize(rawName);
  let score = 0;
  for (const item of items) {
    for (const field of fields) {
      const value = normalize(item?.[field] ?? "");
      if (value && value === normalizedRaw) {
        score = Math.max(score, exactScore);
      } else if (value && normalizeCompact(value) === normalizeCompact(rawName)) {
        score = Math.max(score, exactScore - 2);
      } else if (value && normalizeSymbols(value) === normalizeSymbols(rawName)) {
        score = Math.max(score, exactScore - 3);
      }
    }
  }
  return score;
}

function partialMatchScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    return Math.round(82 + ratio * 15);
  }
  return 0;
}

function normalizeCompact(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeSymbols(value) {
  return String(value ?? "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

function bestLearningMatch(items) {
  if (!items.length) return null;
  return [...items]
    .sort((a, b) => (Number(b.confidence ?? 0) + Number(b.learningCount ?? 0)) - (Number(a.confidence ?? 0) + Number(a.learningCount ?? 0)))[0] ?? null;
}

function matchKind({ bestAlias, bestMemory, bestLearning, productNameScore }) {
  if (bestAlias?.item?.supplierId) return "supplier_alias";
  if (bestAlias) return "alias";
  if (bestMemory) return "memory";
  if (bestLearning) return "learning";
  return productNameScore >= 70 ? "product_name" : "similarity";
}

function buildReason({ productNameScore, bestAlias, bestMemory, bestLearning, sourceCount, historyCount }) {
  const parts = [`상품명 ${productNameScore}%`];
  if (bestAlias) parts.push(`Alias ${bestAlias.score}%`);
  if (bestMemory) parts.push(`Memory ${bestMemory.score}%`);
  if (bestLearning) parts.push(`Learning ${bestLearning.confidence}%`);
  parts.push(`Source ${sourceCount}`);
  if (historyCount > 0) parts.push(`History ${historyCount}`);
  return parts.join(" / ");
}

function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 100;

  let matches = 0;
  for (const char of new Set(left)) {
    if (right.includes(char)) matches += 1;
  }

  return Math.round((matches / Math.max(left.length, right.length)) * 100);
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function resolveOcrCandidateRoute(confidence) {
  if (confidence >= 95) return "AUTO_APPROVED";
  if (confidence >= 80) return "REVIEW_REQUIRED";
  if (confidence >= 60) return "USER_SELECT";
  return "UNKNOWN";
}

export { resolveOcrCandidateRoute };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
