import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { maximumMarginOfError95 } from "./ocr-corpus-1000-lib.mjs";

const root = path.resolve("ai/ocr-training/corpus-1000");
const plan = JSON.parse(await readFile(path.join(root, "stratification-plan.json"), "utf8"));
const errors = [];
for (const [dimension, strata] of Object.entries(plan.dimensions)) {
  const total = strata.reduce((sum, item) => sum + item.target, 0);
  if (total !== plan.targetSampleCount) errors.push(`${dimension} target total is ${total}, expected ${plan.targetSampleCount}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const expand = (strata) => strata.flatMap((item) => Array(item.target).fill(item.code));
  const rotate = (items, offset) => items.map((_, index) => items[(index + offset) % items.length]);
  const documentFamilies = expand(plan.dimensions.documentFamily);
  const species = rotate(expand(plan.dimensions.species), 137);
  const qualities = rotate(expand(plan.dimensions.quality), 311);
  const origins = rotate(expand(plan.dimensions.origin), 523);
  const years = Array.from({ length: plan.targetSampleCount }, (_, index) => plan.period.from + (index % (plan.period.to - plan.period.from + 1)));
  const slots = Array.from({ length: plan.targetSampleCount }, (_, index) => ({
    slotId: `OCR1000-${String(index + 1).padStart(4, "0")}`,
    year: years[index],
    documentFamily: documentFamilies[index],
    species: species[index],
    quality: qualities[index],
    origin: origins[index],
    status: "OPEN",
  }));
  await writeFile(path.join(root, "sampling-slots.json"), `${JSON.stringify({ schemaVersion: "1.0", slots }, null, 2)}\n`, "utf8");
  console.log(`Corpus target: ${plan.targetSampleCount}`);
  console.log(`Period: ${plan.period.from}-${plan.period.to}`);
  console.log(`Maximum 95% proportion margin of error: +/-${maximumMarginOfError95(plan.targetSampleCount).toFixed(2)}%p`);
  console.log("All stratification dimensions total 1,000 samples.");
  console.log("Created 1,000 deterministic intake slots.");
}
