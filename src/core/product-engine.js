export class ProductEngine {
  constructor({ categories, products, aliases, suppliers }) {
    this.categories = categories;
    this.products = products;
    this.aliases = aliases;
    this.suppliers = suppliers;
  }

  listProducts() {
    return [...this.products];
  }

  listAliases() {
    return this.aliases.map((alias) => ({
      ...alias,
      product: this.findProductById(alias.productId)
    }));
  }

  findProductById(productId) {
    return this.products.find((product) => product.id === productId);
  }

  matchAlias(rawName) {
    const normalized = normalizeName(rawName);
    const exact = this.aliases.find((alias) => normalizeName(alias.rawName) === normalized);
    if (exact) {
      return {
        rawName,
        product: this.findProductById(exact.productId),
        score: exact.confidence,
        status: exact.confidence >= 90 ? "matched" : "needs_review"
      };
    }

    const candidate = this.aliases
      .map((alias) => ({
        alias,
        score: similarityScore(normalized, normalizeName(alias.rawName))
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!candidate) {
      return { rawName, product: undefined, score: 0, status: "new_alias_candidate" };
    }

    return {
      rawName,
      product: this.findProductById(candidate.alias.productId),
      score: candidate.score,
      status: candidate.score >= 86 ? "needs_review" : "new_alias_candidate"
    };
  }

  createProduct(input) {
    const product = {
      id: `prd-${String(this.products.length + 1).padStart(3, "0")}`,
      isActive: true,
      ...input
    };
    this.products.unshift(product);
    return product;
  }
}

function normalizeName(value) {
  return value.replace(/\s/g, "").toLowerCase();
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
