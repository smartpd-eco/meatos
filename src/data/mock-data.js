export const categories = [
  { id: "cat-pork", code: "PORK", name: "돼지고기", isActive: true },
  { id: "cat-beef", code: "BEEF", name: "소고기", isActive: true },
  { id: "cat-processed", code: "PROCESSED", name: "가공품", isActive: true }
];

export const suppliers = [
  {
    id: "sup-001",
    name: "안산축산유통",
    businessNumber: "123-45-67890",
    manager: "김대표",
    phone: "010-1111-2222",
    leadTimeDays: 1,
    isActive: true
  },
  {
    id: "sup-002",
    name: "한우리미트",
    businessNumber: "234-56-78901",
    manager: "박과장",
    phone: "010-3333-4444",
    leadTimeDays: 2,
    isActive: true
  }
];

export const products = [
  {
    id: "prd-001",
    categoryId: "cat-pork",
    supplierId: "sup-001",
    name: "삼겹살",
    cutName: "삼겹",
    species: "돼지",
    part: "삼겹",
    processingType: "냉장",
    skinType: "미박",
    boneType: "무뼈",
    storageType: "fresh",
    origin: "국내산",
    grade: "1+",
    brand: "MEATOS",
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
    species: "돼지",
    part: "앞다리",
    processingType: "냉장",
    skinType: "미박",
    boneType: "무뼈",
    storageType: "fresh",
    origin: "국내산",
    grade: "1+",
    brand: "MEATOS",
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
    species: "돼지",
    part: "목심",
    processingType: "냉장",
    skinType: "무박",
    boneType: "무뼈",
    storageType: "fresh",
    origin: "국내산",
    grade: "1+",
    brand: "MEATOS",
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
    species: "소",
    part: "갈비",
    processingType: "냉장",
    skinType: "무박",
    boneType: "뼈있음",
    storageType: "fresh",
    origin: "국내산",
    grade: "1++",
    brand: "MEATOS",
    baseUnit: "kg",
    safeStock: 22,
    moq: 8,
    traceRequired: true,
    isActive: true
  }
];

export const aliases = [
  {
    id: "als-001",
    rawName: "생삼겹",
    normalizedName: "생삼겹",
    productId: "prd-001",
    supplierId: "sup-001",
    sourceType: "supplier_invoice",
    confidence: 96,
    verified: true,
    useCount: 18,
    isActive: true
  },
  {
    id: "als-002",
    rawName: "냉장삼겹",
    normalizedName: "냉장삼겹",
    productId: "prd-001",
    supplierId: "sup-001",
    sourceType: "supplier_invoice",
    confidence: 94,
    verified: true,
    useCount: 11,
    isActive: true
  },
  {
    id: "als-003",
    rawName: "미전지",
    normalizedName: "미전지",
    productId: "prd-002",
    supplierId: "sup-001",
    sourceType: "supplier_invoice",
    confidence: 91,
    verified: true,
    useCount: 9,
    isActive: true
  },
  {
    id: "als-004",
    rawName: "냉장목심",
    normalizedName: "냉장목심",
    productId: "prd-003",
    supplierId: "sup-002",
    sourceType: "ocr",
    confidence: 86,
    verified: false,
    useCount: 3,
    isActive: true
  },
  {
    id: "als-005",
    rawName: "LA갈비 선물",
    normalizedName: "l갈비선물",
    productId: "prd-004",
    supplierId: "sup-002",
    sourceType: "pos",
    confidence: 78,
    verified: false,
    useCount: 1,
    isActive: true
  }
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

export const aliasMemory = [
  {
    id: "mem-001",
    rawName: "삼겹",
    normalizedName: "삼겹",
    displayName: "삼겹살",
    productId: "prd-001",
    supplierId: "sup-001",
    sourceDomain: "consumer",
    sourceType: "manual",
    confidence: 72,
    verified: false,
    usageCount: 42,
    firstSeenAt: "2026-07-01T08:00:00.000Z",
    lastSeenAt: "2026-07-10T11:00:00.000Z",
    isActive: true
  },
  {
    id: "mem-002",
    rawName: "삼겹살",
    normalizedName: "삼겹살",
    displayName: "삼겹살",
    productId: "prd-001",
    supplierId: "sup-001",
    sourceDomain: "government",
    sourceType: "ocr",
    confidence: 97,
    verified: true,
    usageCount: 51,
    firstSeenAt: "2026-07-01T08:00:00.000Z",
    lastSeenAt: "2026-07-10T11:30:00.000Z",
    isActive: true
  },
  {
    id: "mem-003",
    rawName: "미전지",
    normalizedName: "미전지",
    displayName: "미박 앞다리살",
    productId: "prd-002",
    supplierId: "sup-001",
    sourceDomain: "distributor",
    sourceType: "supplier_invoice",
    confidence: 94,
    verified: true,
    usageCount: 37,
    firstSeenAt: "2026-07-01T08:10:00.000Z",
    lastSeenAt: "2026-07-10T10:00:00.000Z",
    isActive: true
  },
  {
    id: "mem-004",
    rawName: "목심",
    normalizedName: "목심",
    displayName: "목살",
    productId: "prd-003",
    supplierId: "sup-002",
    sourceDomain: "butcher_shop",
    sourceType: "manual",
    confidence: 86,
    verified: true,
    usageCount: 18,
    firstSeenAt: "2026-07-01T08:20:00.000Z",
    lastSeenAt: "2026-07-10T09:00:00.000Z",
    isActive: true
  },
  {
    id: "mem-005",
    rawName: "갈비",
    normalizedName: "갈비",
    displayName: "갈비",
    productId: "prd-004",
    supplierId: "sup-002",
    sourceDomain: "organization",
    sourceType: "ocr",
    confidence: 95,
    verified: true,
    usageCount: 29,
    firstSeenAt: "2026-07-01T08:30:00.000Z",
    lastSeenAt: "2026-07-10T09:30:00.000Z",
    isActive: true
  }
];
