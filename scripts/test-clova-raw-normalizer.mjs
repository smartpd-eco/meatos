import { normalizeClovaResponse } from "../src/data/ocr-provider-adapter.js";

const rows = [
  ["냉장 항정(장터) 국내산", "대전충남양돈농협", "1 Box", "3.90", "42,000", "163,800"],
  ["이력번호:L12605276054001"],
  ["냉장 목살(장터) S 국내산", "대전충남양돈농협", "2 Box", "23.90", "18,500", "442,150"],
  ["이력번호:L12605256054001"],
  ["냉장 목살(장터) S 국내산", "대전충남양돈농협", "1 Box", "11.10", "18,500", "205,350"],
  ["이력번호:L12605256054004"],
  ["냉장 삼겹(장터) S 국내산", "대전충남양돈농협", "2 Box", "37.70", "21,000", "791,700"],
  ["이력번호:L12605256054004"],
  ["냉동 우삼겹(엑셀) 미국산", "B/L:MAEU259709509", "Box", "5.44", "13,000", "70,720"],
  ["이력번호:803042102984"]
];

const fields = rows.flatMap((row, rowIndex) => row.map((text, columnIndex) => ({
  inferText: text,
  inferConfidence: 0.99,
  boundingPoly: {
    vertices: [
      { x: 100 + (columnIndex * 180), y: 400 + (rowIndex * 40) },
      { x: 240 + (columnIndex * 180), y: 400 + (rowIndex * 40) },
      { x: 240 + (columnIndex * 180), y: 430 + (rowIndex * 40) },
      { x: 100 + (columnIndex * 180), y: 430 + (rowIndex * 40) }
    ]
  }
})));

const result = normalizeClovaResponse({
  images: [{ inferResult: "SUCCESS", fields, convertedImageInfo: { width: 1400, height: 1000 } }]
}, { supplierName: "(주)좋은축산유통", qualityScore: 95 });

if (process.env.OCR_TEST_DEBUG === "1") {
  console.log(JSON.stringify({ text: result.reconstructedText, lineItems: result.lineItems }, null, 2));
}

if (result.lineItems.length !== 5) {
  throw new Error(`Expected 5 line items, received ${result.lineItems.length}`);
}
for (const [index, expectedName] of ["항정", "목살", "목살", "삼겹", "우삼겹"].entries()) {
  if (!result.lineItems[index].rawProductName.includes(expectedName)) {
    throw new Error(`Row ${index + 1} product mismatch: ${result.lineItems[index].rawProductName}`);
  }
}
if (result.lineItems[0].traceNumber !== "L12605276054001") {
  throw new Error(`Trace evidence was not attached: ${result.lineItems[0].traceNumber}`);
}
if (result.lineItems[4].traceNumber !== "803042102984") {
  throw new Error(`Import trace evidence was not attached: ${result.lineItems[4].traceNumber}`);
}
if (result.lineItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) !== 1673720) {
  throw new Error("Line amount sum did not match 1,673,720");
}
if (result.documentFields.totalAmount !== 1673720) {
  throw new Error(`Document total mismatch: ${result.documentFields.totalAmount}`);
}

console.log("CLOVA raw response normalization passed.");
