import assert from "node:assert/strict";
import { inferSupplierColumnLayout, buildTemplateCellRegions } from "../src/data/ocr-table-reconstructor.js";
import { OcrSupplierTemplateStore } from "../src/data/ocr-supplier-template-store.js";
import { buildSelectiveOcrRegions } from "../src/data/ocr-selective-crop.js";

const headerY = 620;
const items = [
  token("상품명 및 등급", 70, 330, headerY),
  token("원산지", 360, 480, headerY),
  token("단위", 510, 600, headerY),
  token("수량", 640, 740, headerY),
  token("단가", 790, 900, headerY),
  token("공급가", 960, 1110, headerY),
  token("세액", 1160, 1260, headerY),
  token("미수금", 1380, 1500, 340)
];

const layout = inferSupplierColumnLayout({ items, imageWidth: 1600, imageHeight: 1200 });
assert.equal(layout.detectedHeaderCount, 7);
assert.deepEqual(layout.columns.map((column) => column.key), [
  "productName", "origin", "unit", "quantity", "unitPrice", "supplyAmount", "taxAmount"
]);
assert.ok(layout.confidence >= 95);
assert.ok(layout.columns.every((column) => column.minX < column.maxX));
assert.ok(layout.columns.every((column) => column.normalized.minX >= 0 && column.normalized.maxX <= 1));

const regions = buildTemplateCellRegions(layout, [{ rowNo: 1, minY: 700, maxY: 760 }]);
assert.equal(regions.length, 7);
assert.equal(regions[0].columnKey, "productName");
assert.equal(regions[0].source, "supplier-template");

const selective = buildSelectiveOcrRegions({ rawJson: { lines: [{
  rowNo: 8,
  text: "냉장 등심 국내산 3 Box 43.60 7,500 327,000",
  score: 72,
  bounds: { minX: 65, minY: 710, maxX: 1260, maxY: 765 }
}] } }, { templateProfile: { columnLayout: layout }, maxRegions: 1 });
assert.equal(selective.length, 1);
assert.deepEqual(selective[0].fieldRegions.map((field) => field.fieldType), ["description"]);

const store = new OcrSupplierTemplateStore([]);
store.recordTemplate({
  supplierName: "좋은축산",
  providerId: "paddleocr",
  columnLayout: layout,
  headerAliases: layout.headerAliases,
  expectedFields: layout.columns.map((column) => column.key),
  avgConfidence: layout.confidence,
  qualityScore: 90
});
store.recordTemplate({
  supplierName: "좋은축산",
  providerId: "paddleocr",
  columnLayout: inferSupplierColumnLayout({
    items: items.map((item) => ({ ...item, bounds: { ...item.bounds, minX: item.bounds.minX + 4, maxX: item.bounds.maxX + 4 } })),
    imageWidth: 1600,
    imageHeight: 1200
  }),
  avgConfidence: 96,
  qualityScore: 92
});

const saved = store.list({ supplierName: "좋은축산", providerId: "paddleocr" })[0];
assert.equal(saved.documentCount, 2);
assert.equal(saved.columnLayout.sampleCount, 2);
assert.equal(saved.columnLayout.columns.length, 7);
assert.ok(saved.columnLayout.columns[0].centerX > layout.columns[0].centerX);

console.log(JSON.stringify({
  supplier: saved.supplierName,
  detectedHeaders: layout.detectedHeaderCount,
  columns: saved.columnLayout.columns.map((column) => column.key),
  confidence: saved.columnLayout.confidence,
  sampleCount: saved.columnLayout.sampleCount,
  selectiveRegions: regions.length
}, null, 2));

function token(text, minX, maxX, minY) {
  return {
    text,
    confidence: 94,
    bounds: {
      minX,
      maxX,
      minY,
      maxY: minY + 42,
      width: maxX - minX,
      height: 42,
      centerY: minY + 21
    }
  };
}
