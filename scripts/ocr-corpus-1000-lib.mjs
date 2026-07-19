import { createHash } from "node:crypto";

export const ELIGIBLE_STORAGE_CLASSES = new Set([
  "APPROVED_REAL",
  "OFFICIAL_FORM",
  "SYNTHETIC_OWNED",
]);

export const REQUIRED_GROUND_TRUTH_FIELDS = [
  "species", "part", "productName", "grade", "condition", "unit",
  "quantity", "unitPrice", "supplyAmount", "taxAmount", "totalAmount",
  "traceOrImportNo",
];

export function maximumMarginOfError95(sampleCount) {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return null;
  return 1.96 * Math.sqrt(0.25 / sampleCount) * 100;
}

export function stableSampleHash(sample) {
  const source = [sample.fileHash, sample.documentHash, sample.redactedFileHash]
    .find((value) => typeof value === "string" && value.length > 0);
  return source ? createHash("sha256").update(source).digest("hex") : null;
}

export function validateCorpusSample(sample, now = new Date()) {
  const errors = [];
  if (!sample.sampleId) errors.push("sampleId is required");
  if (!ELIGIBLE_STORAGE_CLASSES.has(sample.storageClass)) errors.push("ineligible storageClass");
  if (sample.rightsStatus !== "APPROVED") errors.push("rights approval missing");
  if (sample.personalDataStatus !== "CLEARED") errors.push("personal data clearance missing");
  if (!sample.fileHash && !sample.documentHash && !sample.redactedFileHash) errors.push("content hash missing");
  if (!sample.groundTruthStatus || sample.groundTruthStatus !== "VERIFIED") errors.push("verified ground truth missing");
  if (!sample.documentFamily || !sample.species || !sample.quality || !sample.origin) errors.push("stratification fields missing");
  if (sample.expiresAt && new Date(sample.expiresAt) <= now) errors.push("sample expired");
  const missingTruth = REQUIRED_GROUND_TRUTH_FIELDS.filter((field) => !(field in (sample.groundTruth ?? {})));
  if (missingTruth.length) errors.push(`ground truth fields missing: ${missingTruth.join(", ")}`);
  return errors;
}
