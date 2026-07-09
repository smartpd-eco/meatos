export class AiEngine {
  constructor({ productEngine, inventoryEngine, eventEngine }) {
    this.productEngine = productEngine;
    this.inventoryEngine = inventoryEngine;
    this.eventEngine = eventEngine;
  }

  recommendAlias(rawName) {
    const recommendation = this.productEngine.matchAlias(rawName);
    this.eventEngine.record("ai.alias_recommended", {
      rawName,
      productId: recommendation.product?.id,
      score: recommendation.score,
      status: recommendation.status
    });
    return recommendation;
  }

  recommendPurchases() {
    const recommendations = this.inventoryEngine
      .getStockRows()
      .filter((row) => row.currentStock < row.safeStock)
      .map((row) => ({
        productId: row.id,
        productName: row.name,
        currentStock: row.currentStock,
        safeStock: row.safeStock,
        recommendedQuantity: Math.max(row.moq, Math.ceil(row.safeStock * 1.5 - row.currentStock)),
        reason: row.currentStock <= row.safeStock * 0.5
          ? "안전재고의 50% 이하로 긴급 발주가 필요합니다."
          : "안전재고 이하로 보충 발주가 필요합니다.",
        status: "recommended"
      }));

    this.eventEngine.record("ai.purchase_recommended", {
      count: recommendations.length
    });

    return recommendations;
  }

  detectSalesAnomaly(salesRows) {
    const anomaly = salesRows.find((row) => row.today > row.average * 2);
    if (!anomaly) {
      return {
        status: "normal",
        message: "현재 이상 판매 패턴은 없습니다."
      };
    }

    return {
      status: "needs_review",
      productName: anomaly.productName,
      message: `${anomaly.productName} 판매가 평균 대비 ${Math.round((anomaly.today / anomaly.average) * 100)}%입니다. 행사, 단체주문, 중복 입력 여부 확인이 필요합니다.`
    };
  }
}
