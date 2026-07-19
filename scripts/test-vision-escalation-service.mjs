import assert from "node:assert/strict";
import { runVisionEscalation } from "../src/data/ocr-vision-escalation-service.js";
import { OCR_ROUTING_ACTION } from "../src/data/ocr-provider-routing-policy.js";

let called = 0;
const providerFactory = (providerId) => ({
  async recognizeDocument() {
    called += 1;
    return { providerId, lineItems: [{ rowNo: 1 }], reviewRequired: true };
  }
});

const accepted = await runVisionEscalation({
  signals: { tableScore: 50 },
  providerAttempts: [],
  policy: { geminiConfigured: true },
  functionUrl: "https://example.test/analyze-invoice",
  providerFactory,
  validateResult: () => ({
    evidenceComplete: true,
    arithmeticOk: true,
    criticalNumericExact: true,
    traceRequired: false,
    traceValid: true,
    productMatchRate: 100,
    tableScore: 100
  })
});
assert.equal(called, 1);
assert.equal(accepted.attemptedProviderId, "gemini-2.5-flash");
assert.equal(accepted.decision.action, OCR_ROUTING_ACTION.APPROVAL_CANDIDATE);
assert.equal(accepted.approvalCandidate, true);

const unresolved = await runVisionEscalation({
  signals: { tableScore: 50 },
  providerAttempts: [],
  policy: { geminiConfigured: true },
  functionUrl: "https://example.test/analyze-invoice",
  providerFactory,
  validateResult: () => ({ tableScore: 40 })
});
assert.equal(unresolved.decision.action, OCR_ROUTING_ACTION.REVIEW_REQUIRED);
assert.equal(unresolved.approvalCandidate, false);

const failed = await runVisionEscalation({
  signals: { tableScore: 30 },
  providerAttempts: [],
  policy: { geminiConfigured: true },
  functionUrl: "https://example.test/analyze-invoice",
  providerFactory: () => ({
    async recognizeDocument() {
      throw new Error("NETWORK_ERROR");
    }
  })
});
assert.equal(failed.decision.action, OCR_ROUTING_ACTION.REVIEW_REQUIRED);
assert.equal(failed.providerResult, null);
assert.equal(failed.error.message, "NETWORK_ERROR");

console.log(JSON.stringify({ accepted: accepted.decision, unresolved: unresolved.decision, failed: failed.decision, externalCalls: called }, null, 2));
