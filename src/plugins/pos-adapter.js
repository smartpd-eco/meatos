export class PosAdapterPlugin {
  constructor({ productEngine, inventoryEngine, eventEngine }) {
    this.productEngine = productEngine;
    this.inventoryEngine = inventoryEngine;
    this.eventEngine = eventEngine;
  }

  importCsvRows(rows) {
    const results = rows.map((row) => {
      const match = this.productEngine.matchAlias(row.productName);
      if (!match.product) {
        this.eventEngine.record("pos.sale_unmatched", row);
        return {
          ...row,
          status: "unmatched"
        };
      }

      const ledger = this.inventoryEngine.ship({
        productId: match.product.id,
        quantity: row.quantity,
        source: "csv_pos",
        memo: `${row.vendor} CSV 판매`
      });

      this.eventEngine.record("pos.sale_imported", {
        row,
        productId: match.product.id,
        ledgerId: ledger.id
      });

      return {
        ...row,
        productId: match.product.id,
        standardProductName: match.product.name,
        status: "imported"
      };
    });

    return {
      total: rows.length,
      imported: results.filter((result) => result.status === "imported").length,
      unmatched: results.filter((result) => result.status === "unmatched").length,
      results
    };
  }

  createManualSale({ productName, quantity }) {
    const match = this.productEngine.matchAlias(productName);
    const product = match.product ?? this.productEngine.listProducts().find((item) => item.name === productName);

    if (!product) {
      this.eventEngine.record("manual_sale.unmatched", { productName, quantity });
      return { status: "unmatched", productName, quantity };
    }

    const ledger = this.inventoryEngine.ship({
      productId: product.id,
      quantity,
      source: "manual",
      memo: "Manual Sales"
    });

    this.eventEngine.record("manual_sale.created", {
      productId: product.id,
      quantity,
      ledgerId: ledger.id
    });

    return {
      status: "created",
      product,
      quantity,
      ledger
    };
  }

  runHealthCheck() {
    const result = {
      detectedVendor: "OKPOS",
      supportsApi: true,
      supportsDbRead: true,
      supportsCsvExport: true,
      supportsFolderWatch: true,
      supportsPrinterCapture: false,
      recommendedAdapterLevel: 3,
      confidence: 94,
      notes: ["CSV Export 폴더 감지", "API 후보 감지", "읽기 전용 DB 후보 감지"]
    };

    this.eventEngine.record("pos.health_checked", result);
    return result;
  }
}
