import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("ai/ocr-training/generated");
const layouts = [
  "wholesale-grid", "retail-butcher", "restaurant-supply", "import-distribution",
  "slaughter-certificate", "grade-certificate", "traceability-ledger",
  "compact-erp", "carbon-copy", "dense-multipage",
];
const variants = [
  "clean", "rotated-left", "rotated-right", "shadow", "glare",
  "low-contrast", "soft-blur", "perspective", "fold", "partial-occlusion",
];
const productCatalog = [
  { name: "냉장 등심(장터)", species: "한우", origin: "국내산", grade: "1+", condition: "냉장", unit: "kg", trace: "L12607026054002", price: 7500 },
  { name: "냉장 사태(장터)", species: "한우", origin: "국내산", grade: "1", condition: "냉장", unit: "kg", trace: "L12607026054001", price: 7000 },
  { name: "냉동 등뼈", species: "돼지", origin: "국내산", grade: "", condition: "냉동", unit: "kg", trace: "L12504116807001", price: 1200 },
  { name: "냉동 미후지(황금)", species: "돼지", origin: "국내산", grade: "", condition: "냉동", unit: "kg", trace: "140028101672", price: 5000 },
  { name: "미국산 냉장 척아이롤", species: "소", origin: "미국산", grade: "CH", condition: "냉장", unit: "kg", trace: "US24A0198457", price: 14800 },
  { name: "호주산 냉동 갈비", species: "소", origin: "호주산", grade: "GF", condition: "냉동", unit: "kg", trace: "AU25B7741029", price: 16200 },
  { name: "스페인산 냉동 삼겹살", species: "돼지", origin: "스페인산", grade: "", condition: "냉동", unit: "kg", trace: "ES25P3301842", price: 9200 },
  { name: "국내산 냉장 목살", species: "돼지", origin: "국내산", grade: "1", condition: "냉장", unit: "kg", trace: "L12607110541123", price: 11300 },
  { name: "냉장 안심", species: "육우", origin: "국내산", grade: "2", condition: "냉장", unit: "kg", trace: "L12607120541987", price: 18500 },
  { name: "브라질산 냉동 닭정육", species: "닭", origin: "브라질산", grade: "", condition: "냉동", unit: "Box", trace: "BR26C0091721", price: 43000 },
];

function makeRows(sequence) {
  return Array.from({ length: 4 }, (_, index) => {
    const product = productCatalog[(sequence + index * 2) % productCatalog.length];
    const quantity = Number((6.5 + ((sequence * 17 + index * 23) % 340) / 10).toFixed(3));
    const amount = Math.round(quantity * product.price);
    return {
      lineNo: index + 1,
      species: product.species,
      productName: product.name,
      part: product.name.replace(/^(?:국내산|미국산|호주산|스페인산|브라질산)\s*/, "").replace(/^(?:냉장|냉동)\s*/, "").replace(/\([^)]*\)/g, "").trim(),
      origin: product.origin,
      grade: product.grade,
      condition: product.condition,
      quantity,
      unit: product.unit,
      unitPrice: product.price,
      supplyAmount: amount,
      taxAmount: 0,
      totalAmount: amount,
      traceNo: product.trace,
    };
  });
}

function createTruth(layout, variant, sequence) {
  const lineItems = makeRows(sequence);
  return {
    schemaVersion: "2.0",
    ownership: "MEATOS_SYNTHETIC_OWNED",
    trainingEligible: true,
    evaluationSplit: "CONTROLLED_LAB_100",
    sourceFile: `${String(sequence).padStart(3, "0")}-${layout}-${variant}.png`,
    layoutType: layout,
    degradation: variant,
    legibility: variant === "partial-occlusion" ? "DAMAGED" : "LEGIBLE",
    inputMode: "SYNTHETIC_CAMERA_SIMULATION",
    document: {
      supplierName: sequence % 3 === 0 ? "대한수입육유통" : sequence % 2 === 0 ? "좋은축산유통" : "한결축산도매",
      supplierBusinessNo: "324-88-00980",
      invoiceDate: `20${15 + (sequence % 12)}-${String((sequence % 12) + 1).padStart(2, "0")}-${String((sequence % 27) + 1).padStart(2, "0")}`,
      invoiceNo: `LAB-${String(sequence).padStart(4, "0")}`,
      supplyAmount: lineItems.reduce((sum, item) => sum + item.supplyAmount, 0),
      taxAmount: 0,
      totalAmount: lineItems.reduce((sum, item) => sum + item.totalAmount, 0),
    },
    lineItems,
  };
}

await mkdir(root, { recursive: true });
const samples = [];
let sequence = 1;
for (const layout of layouts) {
  for (const variant of variants) {
    const id = `${String(sequence).padStart(3, "0")}-${layout}-${variant}`;
    const truthName = `${id}.truth.json`;
    const imageName = `${id}.png`;
    await writeFile(path.join(root, truthName), `${JSON.stringify(createTruth(layout, variant, sequence), null, 2)}\n`, "utf8");
    samples.push({
      id,
      image: imageName,
      truth: truthName,
      layout,
      variant,
      legibility: variant === "partial-occlusion" ? "DAMAGED" : "LEGIBLE",
      inputMode: "SYNTHETIC_CAMERA_SIMULATION",
      trainingEligible: true,
    });
    sequence += 1;
  }
}

const manifest = {
  schemaVersion: "2.0",
  generatedAt: new Date().toISOString(),
  ownership: "MEATOS_SYNTHETIC_OWNED",
  evaluationSplit: "CONTROLLED_LAB_100",
  sampleCount: samples.length,
  samples,
};
await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated ${samples.length} MEATOS-owned controlled OCR samples.`);
