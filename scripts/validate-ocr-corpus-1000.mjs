import { readFile } from "node:fs/promises";
import path from "node:path";
import { stableSampleHash, validateCorpusSample } from "./ocr-corpus-1000-lib.mjs";

const root = path.resolve("ai/ocr-training/corpus-1000");
const plan = JSON.parse(await readFile(path.join(root, "stratification-plan.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "corpus-registry.json"), "utf8"));
const errors = [];
const eligible = [];
const hashes = new Set();

for (const sample of registry.samples ?? []) {
  const sampleErrors = validateCorpusSample(sample);
  if (sampleErrors.length) {
    errors.push(`${sample.sampleId ?? "UNKNOWN"}: ${sampleErrors.join("; ")}`);
    continue;
  }
  const hash = stableSampleHash(sample);
  if (hashes.has(hash)) {
    errors.push(`${sample.sampleId}: duplicate content hash`);
    continue;
  }
  hashes.add(hash);
  eligible.push(sample);
}

function validateTargets(dimension) {
  for (const stratum of plan.dimensions[dimension]) {
    const actual = eligible.filter((sample) => sample[dimension] === stratum.code).length;
    if (actual < stratum.target) errors.push(`${dimension}.${stratum.code}: ${actual}/${stratum.target}`);
  }
}

for (const dimension of Object.keys(plan.dimensions)) validateTargets(dimension);
if (eligible.length !== plan.targetSampleCount) errors.push(`eligible corpus size: ${eligible.length}/${plan.targetSampleCount}`);

if (errors.length) {
  console.error("MEATOS OCR corpus release gate is not satisfied:");
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Validated 1,000 eligible, deduplicated OCR benchmark samples.");
}
