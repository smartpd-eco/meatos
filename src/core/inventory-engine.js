export class InventoryEngine {
  constructor({ products, ledger }, eventEngine) {
    this.products = products;
    this.ledger = [...ledger];
    this.eventEngine = eventEngine;
  }

  receive({ productId, quantity, source, memo }) {
    const entry = this.createLedgerEntry({
      productId,
      quantity,
      eventType: "purchase_received",
      direction: "in",
      source,
      memo
    });
    this.eventEngine.record("inventory.received", entry);
    return entry;
  }

  ship({ productId, quantity, source, memo }) {
    const entry = this.createLedgerEntry({
      productId,
      quantity,
      eventType: "sale",
      direction: "out",
      source,
      memo
    });
    this.eventEngine.record("inventory.shipped", entry);
    return entry;
  }

  adjust({ productId, quantity, memo }) {
    const entry = this.createLedgerEntry({
      productId,
      quantity: Math.abs(quantity),
      eventType: "manual_adjustment",
      direction: quantity >= 0 ? "in" : "out",
      source: "manual",
      memo
    });
    this.eventEngine.record("inventory.adjusted", entry);
    return entry;
  }

  getStockRows() {
    return this.products.map((product) => {
      const current = this.calculateCurrentStock(product.id);
      const status = current <= product.safeStock * 0.5 ? "danger" : current < product.safeStock ? "warn" : "ok";
      return {
        ...product,
        currentStock: Number(current.toFixed(1)),
        status
      };
    });
  }

  listLedger(limit = 20) {
    return this.ledger.slice(0, limit);
  }

  calculateCurrentStock(productId) {
    return this.ledger
      .filter((entry) => entry.productId === productId)
      .reduce((sum, entry) => {
        return entry.direction === "in" ? sum + entry.quantity : sum - entry.quantity;
      }, 0);
  }

  createLedgerEntry(input) {
    const entry = {
      id: `led-${Date.now()}-${this.ledger.length + 1}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    this.ledger.unshift(entry);
    return entry;
  }
}
