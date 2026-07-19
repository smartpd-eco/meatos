import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { maximumMarginOfError95, validateCorpusSample } from "./ocr-corpus-1000-lib.mjs";

const root = path.resolve("ai/ocr-training/corpus-1000");
const output = path.resolve("outputs/ocr-benchmark/corpus-1000-status.json");
const plan = JSON.parse(await readFile(path.join(root, "stratification-plan.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "corpus-registry.json"), "utf8"));
const valid = (registry.samples ?? []).filter((sample) => validateCorpusSample(sample).length === 0);
const status = {
  generatedAt: new Date().toISOString(),
  target: plan.targetSampleCount,
  eligible: valid.length,
  completionRate: Number(((valid.length / plan.targetSampleCount) * 100).toFixed(2)),
  maximumMarginOfError95AtTargetPercentagePoints: Number(maximumMarginOfError95(plan.targetSampleCount).toFixed(2)),
  publishable: valid.length === plan.targetSampleCount,
  researchReferenceCount: registry.researchReferences?.length ?? 0,
  notice: "Research references and unapproved web assets are excluded from benchmark metrics.",
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(status, null, 2)}\n`, "utf8");
console.log(JSON.stringify(status, null, 2));
