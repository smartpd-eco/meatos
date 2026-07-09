export const categories = [
  { id: "cat-pork", name: "돼지고기" },
  { id: "cat-beef", name: "소고기" },
  { id: "cat-processed", name: "가공품" }
];

export const suppliers = [
  { id: "sup-001", name: "안산축산유통", leadTimeDays: 1 },
  { id: "sup-002", name: "한우리미트", leadTimeDays: 2 }
];

export const products = [
  {
    id: "prd-001",
    categoryId: "cat-pork",
    supplierId: "sup-001",
    name: "삼겹살",
    cutName: "삼겹",
    baseUnit: "kg",
    safeStock: 35,
    moq: 10,
    traceRequired: true,
    isActive: true
  },
  {
    id: "prd-002",
    categoryId: "cat-pork",
    supplierId: "sup-001",
    name: "미박 앞다리살",
    cutName: "앞다리",
    baseUnit: "kg",
    safeStock: 25,
    moq: 15,
    traceRequired: true,
    isActive: true
  },
  {
    id: "prd-003",
    categoryId: "cat-pork",
    supplierId: "sup-002",
    name: "목살",
    cutName: "목심",
    baseUnit: "kg",
    safeStock: 18,
    moq: 12,
    traceRequired: true,
    isActive: true
  },
  {
    id: "prd-004",
    categoryId: "cat-beef",
    supplierId: "sup-002",
    name: "갈비",
    cutName: "갈비",
    baseUnit: "kg",
    safeStock: 22,
    moq: 8,
    traceRequired: true,
    isActive: true
  }
];

export const aliases = [
  { id: "als-001", rawName: "생삼겹", productId: "prd-001", supplierId: "sup-001", confidence: 96 },
  { id: "als-002", rawName: "냉장삼겹", productId: "prd-001", supplierId: "sup-001", confidence: 94 },
  { id: "als-003", rawName: "미전지", productId: "prd-002", supplierId: "sup-001", confidence: 91 },
  { id: "als-004", rawName: "냉장목심", productId: "prd-003", supplierId: "sup-002", confidence: 86 },
  { id: "als-005", rawName: "LA갈비 선물", productId: "prd-004", supplierId: "sup-002", confidence: 78 }
];

export const ledger = [
  { id: "led-001", productId: "prd-001", eventType: "purchase_received", direction: "in", quantity: 70, source: "invoice", memo: "거래명세서 입고", createdAt: "2026-07-10T08:00:00.000Z" },
  { id: "led-002", productId: "prd-001", eventType: "sale", direction: "out", quantity: 27.5, source: "csv_pos", memo: "OKPOS CSV 판매", createdAt: "2026-07-10T09:00:00.000Z" },
  { id: "led-003", productId: "prd-002", eventType: "purchase_received", direction: "in", quantity: 45, source: "invoice", memo: "거래명세서 입고", createdAt: "2026-07-10T08:10:00.000Z" },
  { id: "led-004", productId: "prd-002", eventType: "sale", direction: "out", quantity: 26.8, source: "manual", memo: "수기 판매", createdAt: "2026-07-10T10:00:00.000Z" },
  { id: "led-005", productId: "prd-003", eventType: "purchase_received", direction: "in", quantity: 24, source: "invoice", memo: "거래명세서 입고", createdAt: "2026-07-10T08:20:00.000Z" },
  { id: "led-006", productId: "prd-003", eventType: "sale", direction: "out", quantity: 15.6, source: "csv_pos", memo: "POS 판매", createdAt: "2026-07-10T11:00:00.000Z" },
  { id: "led-007", productId: "prd-004", eventType: "purchase_received", direction: "in", quantity: 42, source: "invoice", memo: "거래명세서 입고", createdAt: "2026-07-10T08:30:00.000Z" },
  { id: "led-008", productId: "prd-004", eventType: "sale", direction: "out", quantity: 10.2, source: "api_pos", memo: "API 판매", createdAt: "2026-07-10T11:30:00.000Z" }
];

export const salesPatternRows = [
  { productName: "삼겹살", average: 15, today: 40 },
  { productName: "목살", average: 11, today: 8 },
  { productName: "갈비", average: 4, today: 11 }
];
