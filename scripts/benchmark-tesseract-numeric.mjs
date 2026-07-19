import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { buildTraceCellCandidates } from "../src/data/ocr-trace-number-extractor.js";

const root = process.cwd();
const dataset = path.join(root, "ai/ocr-training/generated");
const manifest = JSON.parse(await readFile(path.join(dataset, "manifest.json"), "utf8"));
const worker = await createWorker("kor+eng", 1, {
  langPath: path.join(root, "ocr-models/tesseract/lang-data"),
  gzip: false,
  logger: () => {},
});
await worker.setParameters({
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1",
  user_defined_dpi: "300",
});
const normalize = (value) => String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
const numeric = (value) => String(value ?? "").replace(/[^0-9.]/g, "");
const samples = [];

for (const sample of manifest.samples) {
  const truth = JSON.parse(await readFile(path.join(dataset, sample.truth), "utf8"));
  const startedAt = performance.now();
  const result = await worker.recognize(path.join(dataset, sample.numericTraceCrop));
  const durationMs = Math.round(performance.now() - startedAt);
  const rawText = String(result.data.text ?? "");
  const normalizedText = normalize(rawText);
  const numericText = numeric(rawText);
  const traceCandidates = buildTraceCellCandidates(rawText, { origin: "국내산", domestic: true });
  const fields = truth.lineItems.flatMap((item) => [
    { type: "quantity", expected: String(item.quantity), matched: numericText.includes(String(item.quantity)) },
    { type: "unitPrice", expected: String(item.unitPrice), matched: normalizedText.includes(String(item.unitPrice)) },
    { type: "amount", expected: String(item.supplyAmount ?? item.amount), matched: normalizedText.includes(String(item.supplyAmount ?? item.amount)) },
    { type: "traceNo", expected: item.traceNo, matched: normalizedText.includes(normalize(item.traceNo)) || traceCandidates.includes(normalize(item.traceNo)) },
  ]);
  samples.push({
    id: sample.id,
    durationMs,
    confidence: Number(result.data.confidence ?? 0),
    exactMatches: fields.filter((field) => field.matched).length,
    fieldCount: fields.length,
    exactMatchRate: Math.round((fields.filter((field) => field.matched).length / fields.length) * 10000) / 100,
    fields,
    rawText,
  });
}
await worker.terminate();
const totalMatches = samples.reduce((sum, sample) => sum + sample.exactMatches, 0);
const totalFields = samples.reduce((sum, sample) => sum + sample.fieldCount, 0);
const legibleIds = new Set(manifest.samples.filter((sample) => sample.legibility !== "DAMAGED").map((sample) => sample.id));
const legibleSamples = samples.filter((sample) => legibleIds.has(sample.id));
const legibleMatches = legibleSamples.reduce((sum, sample) => sum + sample.exactMatches, 0);
const legibleFields = legibleSamples.reduce((sum, sample) => sum + sample.fieldCount, 0);
const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
const summary = {
  provider: "Tesseract.js",
  scope: "numeric and trace selective cells",
  sampleCount: samples.length,
  averageDurationMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
  p95DurationMs: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)],
  numericTraceExactMatchRate: Math.round((totalMatches / totalFields) * 10000) / 100,
  legibleNumericTraceExactMatchRate: Math.round((legibleMatches / legibleFields) * 10000) / 100,
  damagedDocumentPolicy: "REVIEW_REQUIRED",
  samples,
};
const outputDir = path.join(root, "outputs/ocr-benchmark");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "tesseract-numeric.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "samples")), null, 2));
