import assert from "node:assert/strict";
import {
  OCR_ROUTING_ACTION,
  decideVisionLlmEscalation,
  estimateTokenCostUsd,
  projectMonthlyVisionCost
} from "../src/data/ocr-provider-routing-policy.js";

const approvalCandidate = decideVisionLlmEscalation({
  evidenceComplete: true,
  arithmeticOk: true,
  criticalNumericExact: true,
  traceRequired: true,
  traceValid: true,
  productMatchRate: 90,
  tableScore: 98
});
assert.equal(approvalCandidate.action, OCR_ROUTING_ACTION.APPROVAL_CANDIDATE);
assert.notEqual(approvalCandidate.action, "POSTED");

const reviewWithoutGemini = decideVisionLlmEscalation({ tableScore: 85 });
assert.equal(reviewWithoutGemini.action, OCR_ROUTING_ACTION.REVIEW_REQUIRED);

const gemini = decideVisionLlmEscalation({
  tableScore: 50,
  providerAttempts: []
}, {
  geminiConfigured: true,
  geminiUsage: { inputTokens: 3000, outputTokens: 1000 }
});
assert.equal(gemini.action, OCR_ROUTING_ACTION.GEMINI_COMPARE);
assert.equal(gemini.estimatedCostUsd, 0.0034);

const reviewAfterGemini = decideVisionLlmEscalation({
  tableScore: 50,
  providerAttempts: ["gemini-2.5-flash"]
}, {
  geminiConfigured: true
});
assert.equal(reviewAfterGemini.action, OCR_ROUTING_ACTION.REVIEW_REQUIRED);

const review = decideVisionLlmEscalation({ tableScore: 20, providerAttempts: [] });
assert.equal(review.action, OCR_ROUTING_ACTION.REVIEW_REQUIRED);

assert.equal(estimateTokenCostUsd({ inputTokens: 3000, outputTokens: 1000 }, { inputPerMillion: 0.3, outputPerMillion: 2.5 }), 0.0034);
const projection = projectMonthlyVisionCost({
  pages: 10000,
  geminiCallRate: 0.15,
  gptCallRate: 0.02,
  geminiUsage: { inputTokens: 3000, outputTokens: 1000 },
  gptUsage: { inputTokens: 3000, outputTokens: 1000 }
});
assert.equal(projection.geminiCalls, 1500);
assert.equal(projection.gptCalls, 200);
assert.equal(projection.totalUsd, 7.9);

console.log(JSON.stringify({ approvalCandidate, reviewWithoutGemini, gemini, reviewAfterGemini, review, projection }, null, 2));
