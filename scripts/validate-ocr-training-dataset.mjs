import { access, readFile } from "node:fs/promises";
import path from "node:path";

const trainingRoot = path.resolve("ai/ocr-training");
const registry = JSON.parse(await readFile(path.join(trainingRoot, "source-registry.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(trainingRoot, "generated/manifest.json"), "utf8"));
const errors = [];

const allowedEligibility = new Set(["APPROVED_REAL", "SYNTHETIC_OWNED"]);
for (const source of registry.sources ?? []) {
  if (source.eligibility !== "RESEARCH_ONLY" && !allowedEligibility.has(source.eligibility)) {
    errors.push(`Source ${source.sourceId} has an unknown training eligibility ${source.eligibility}`);
  }
}

const validTraceNo = /^(?:L?\d{12,15}|[A-Z]{2}\d{2}[A-Z]\d{7})$/;
for (const sample of manifest.samples ?? []) {
  const imagePath = path.join(trainingRoot, "generated", sample.image);
  const truthPath = path.join(trainingRoot, "generated", sample.truth);
  try { await access(imagePath); } catch { errors.push(`Missing image: ${sample.image}`); }
  try { await access(truthPath); } catch { errors.push(`Missing truth: ${sample.truth}`); continue; }
  const truth = JSON.parse(await readFile(truthPath, "utf8"));
  if (truth.ownership !== "MEATOS_SYNTHETIC_OWNED" || !truth.trainingEligible) {
    errors.push(`Invalid ownership/training flag: ${sample.id}`);
  }
  for (const item of truth.lineItems ?? []) {
    const expected = Math.round(item.quantity * item.unitPrice);
    const actualAmount = Number(item.supplyAmount ?? item.amount);
    if (Math.abs(expected - actualAmount) > 0.01) {
      errors.push(`${sample.id} line ${item.lineNo}: quantity x unitPrice does not match amount`);
    }
    if (!validTraceNo.test(item.traceNo)) {
      errors.push(`${sample.id} line ${item.lineNo}: invalid trace number ${item.traceNo}`);
    }
  }
}

const researchSourceIds = new Set((registry.sources ?? [])
  .filter((source) => source.eligibility === "RESEARCH_ONLY")
  .map((source) => source.sourceId));
for (const sample of manifest.samples ?? []) {
  if (researchSourceIds.has(sample.sourceId)) {
    errors.push(`Research-only source leaked into training manifest: ${sample.id}`);
  }
}

if (manifest.sampleCount !== manifest.samples?.length) errors.push("Manifest sampleCount mismatch");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${manifest.sampleCount} synthetic samples and ${registry.sources?.length ?? 0} source records.`);
  console.log("Training corpus contains no research-only web assets.");
}
