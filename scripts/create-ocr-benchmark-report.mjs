import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "outputs/ocr-benchmark");
const readJson = async (name) => JSON.parse(await readFile(path.join(outputDir, name), "utf8"));
const easy = await readJson("easyocr-products.json");
const tesseract = await readJson("tesseract-numeric.json");
const manifest = JSON.parse(await readFile(path.join(root, "ai/ocr-training/generated/manifest.json"), "utf8"));
const sampleMeta = new Map(manifest.samples.map((sample) => [sample.id, sample]));
const summarizeByVariant = (samples, valueKey) => Object.fromEntries(
  [...new Set(manifest.samples.map((sample) => sample.variant))].map((variant) => {
    const rows = samples.filter((sample) => sampleMeta.get(sample.id)?.variant === variant);
    const value = rows.length ? rows.reduce((sum, sample) => sum + Number(sample[valueKey] ?? 0), 0) / rows.length : 0;
    return [variant, Number(value.toFixed(2))];
  }),
);
const fastPathVariants = new Set(["clean", "shadow", "glare", "low-contrast", "soft-blur", "fold"]);
const tesseractFastPath = tesseract.samples.filter((sample) => fastPathVariants.has(sampleMeta.get(sample.id)?.variant));
const fastPathFields = tesseractFastPath.flatMap((sample) => sample.fields);
const fastPathExactMatchRate = fastPathFields.length
  ? Number(((fastPathFields.filter((field) => field.matched).length / fastPathFields.length) * 100).toFixed(2))
  : 0;
const report = {
  generatedAt: new Date().toISOString(),
  dataset: {
    syntheticSamples: manifest.sampleCount,
    approvedRealSamples: 1,
    split: manifest.evaluationSplit,
    note: "Controlled synthetic camera simulation and approved real captures are reported separately.",
  },
  targets: {
    numericTraceExactMatchRate: 100,
    productCharacterAccuracy: 99,
    unseenTableReconstructionRate: 95,
    primaryProcessingMs: 3000,
    clovaFallbackRate: 10,
  },
  providers: [
    { id: "paddleocr", role: "PRIMARY", status: "BROWSER_BENCHMARK_REQUIRED", reason: "Browser ONNX runtime and local model assets are ready; reproducible browser batch harness is the next integration step." },
    { id: "pp-structure-v3", role: "UNSEEN_LAYOUT_COMPARE", status: "RUNTIME_NOT_INSTALLED", reason: "PP-StructureV3 package/model is not installed locally." },
    { id: "easyocr", role: "PRODUCT_CELL_COMPARE", status: "MEASURED", productCharacterAccuracy: easy.productCharacterAccuracy, averageDurationMs: easy.averageDurationMs, p95DurationMs: easy.p95DurationMs, accuracyByVariant: summarizeByVariant(easy.samples, "characterAccuracy") },
    { id: "tesseract", role: "NUMERIC_TRACE_VALIDATE", status: "MEASURED", numericTraceExactMatchRate: tesseract.numericTraceExactMatchRate, legibleNumericTraceExactMatchRate: tesseract.legibleNumericTraceExactMatchRate, fastPathExactMatchRate, damagedDocumentPolicy: tesseract.damagedDocumentPolicy, averageDurationMs: tesseract.averageDurationMs, p95DurationMs: tesseract.p95DurationMs },
    { id: "clova", role: "FINAL_FALLBACK", status: "NOT_CALLED", fallbackRate: 0 },
  ],
};
report.gaps = [
  easy.productCharacterAccuracy < 99 ? `EasyOCR product character accuracy gap: ${(99 - easy.productCharacterAccuracy).toFixed(2)}%p` : null,
  tesseract.legibleNumericTraceExactMatchRate < 100 ? `Tesseract legible numeric/trace exact match gap: ${(100 - tesseract.legibleNumericTraceExactMatchRate).toFixed(2)}%p` : null,
  tesseract.numericTraceExactMatchRate < 100 ? `Damaged-document exact match is ${tesseract.numericTraceExactMatchRate}%; unreadable cells remain REVIEW_REQUIRED.` : null,
  "PaddleOCR and PP-StructureV3 metrics remain pending until their browser/server batch runtimes are available.",
].filter(Boolean);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "benchmark-summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const markdown = `# MEATOS OCR Benchmark

- Controlled synthetic documents: ${manifest.sampleCount}
- Approved real documents: 1
- EasyOCR product character accuracy: ${easy.productCharacterAccuracy}%
- EasyOCR average latency: ${easy.averageDurationMs}ms (selective cells)
- Tesseract numeric/trace exact match (legible): ${tesseract.legibleNumericTraceExactMatchRate}%
- Tesseract numeric/trace exact match (including occlusion): ${tesseract.numericTraceExactMatchRate}%
- Tesseract fast-path exact match (no rotation/perspective/occlusion): ${fastPathExactMatchRate}%
- Tesseract average latency: ${tesseract.averageDurationMs}ms (selective cells)
- PaddleOCR: browser batch benchmark pending
- PP-StructureV3: runtime not installed
- CLOVA: not called

## Gaps

${report.gaps.map((gap) => `- ${gap}`).join("\n")}
`;
await writeFile(path.join(outputDir, "README.md"), markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
