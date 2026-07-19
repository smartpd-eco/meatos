import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createWorker } from "tesseract.js";

const root = process.cwd();
const imagePath = process.argv[2] || "C:/Users/admin/Downloads/거래명세서0715.jpg";
const outputPath = path.join(root, "outputs/ocr-benchmark/invoice-0715-tesseract.json");
const truth = {
  supplierName: "(주)좋은축산유통",
  invoiceDate: "2026-05-29",
  totalAmount: "1673720",
  rows: [
    { productName: "냉장 항정(장터)", quantity: "3.90", unitPrice: "42000", supplyAmount: "163800", traceNo: "L12605276054001" },
    { productName: "냉장 목살(장터)", quantity: "23.90", unitPrice: "18500", supplyAmount: "442150", traceNo: "L12605256054001" },
    { productName: "냉장 목살(장터)", quantity: "11.10", unitPrice: "18500", supplyAmount: "205350", traceNo: "L12605256054004" },
    { productName: "냉장 삼겹(장터)", quantity: "37.70", unitPrice: "21000", supplyAmount: "791700", traceNo: "L12605256054004" },
    { productName: "냉동 우삼겹(엑셀)", quantity: "5.44", unitPrice: "13000", supplyAmount: "70720", traceNo: "803042102984" }
  ]
};

const worker = await createWorker("kor+eng", 1, {
  langPath: path.join(root, "ocr-models/tesseract/lang-data"),
  gzip: false,
  logger: () => {}
});
await worker.setParameters({
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1",
  user_defined_dpi: "300"
});

const startedAt = performance.now();
const result = await worker.recognize(imagePath);
const durationMs = Math.round(performance.now() - startedAt);
await worker.terminate();

const rawText = String(result.data.text ?? "");
const compact = (value) => String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Z가-힣]/g, "");
const normalizedText = compact(rawText);
const fields = [
  { field: "supplierName", expected: truth.supplierName },
  { field: "invoiceDate", expected: truth.invoiceDate },
  { field: "totalAmount", expected: truth.totalAmount },
  ...truth.rows.flatMap((row, index) => [
    { field: `rows.${index + 1}.productName`, expected: row.productName },
    { field: `rows.${index + 1}.quantity`, expected: row.quantity },
    { field: `rows.${index + 1}.unitPrice`, expected: row.unitPrice },
    { field: `rows.${index + 1}.supplyAmount`, expected: row.supplyAmount },
    { field: `rows.${index + 1}.traceNo`, expected: row.traceNo }
  ])
].map((field) => ({
  ...field,
  matched: normalizedText.includes(compact(field.expected))
}));

const report = {
  imagePath,
  provider: "Tesseract.js 7",
  role: "full-document diagnostic; production role remains numeric/trace selective validation",
  durationMs,
  confidence: Number(result.data.confidence ?? 0),
  matchedFields: fields.filter((field) => field.matched).length,
  totalFields: fields.length,
  exactPresenceRate: Math.round((fields.filter((field) => field.matched).length / fields.length) * 10000) / 100,
  fields,
  rawText
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  provider: report.provider,
  durationMs: report.durationMs,
  confidence: report.confidence,
  matchedFields: report.matchedFields,
  totalFields: report.totalFields,
  exactPresenceRate: report.exactPresenceRate,
  failedFields: fields.filter((field) => !field.matched)
}, null, 2));
