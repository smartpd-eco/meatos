import { createCloudOcrProvider } from "./ocr-cloud-provider-adapter.js";
import { OCR_ROUTING_ACTION, decideVisionLlmEscalation } from "./ocr-provider-routing-policy.js";

export async function runVisionEscalation(input = {}) {
  const attempts = Array.isArray(input.providerAttempts) ? [...input.providerAttempts] : [];
  const initialDecision = decideVisionLlmEscalation({
    ...(input.signals ?? {}),
    providerAttempts: attempts
  }, input.policy ?? {});

  if (initialDecision.action !== OCR_ROUTING_ACTION.GEMINI_COMPARE) {
    return { decision: initialDecision, providerResult: null, validation: null, approvalCandidate: initialDecision.action === OCR_ROUTING_ACTION.APPROVAL_CANDIDATE };
  }

  const providerFactory = input.providerFactory ?? createCloudOcrProvider;
  const provider = providerFactory(initialDecision.providerId, {
    functionUrl: input.functionUrl,
    timeoutMs: input.timeoutMs ?? 15000
  });
  let providerResult;
  try {
    providerResult = await provider.recognizeDocument(input.recognitionInput ?? {});
  } catch (error) {
    return {
      decision: {
        action: OCR_ROUTING_ACTION.REVIEW_REQUIRED,
        providerId: "none",
        externalCall: false,
        estimatedCostUsd: 0,
        reason: "Gemini comparison failed; preserve local OCR evidence for user review"
      },
      attemptedProviderId: initialDecision.providerId,
      providerResult: null,
      validation: null,
      error,
      approvalCandidate: false
    };
  }
  const validation = typeof input.validateResult === "function"
    ? await input.validateResult(providerResult)
    : { evidenceComplete: false, arithmeticOk: false, criticalNumericExact: false, traceValid: false, productMatchRate: 0, tableScore: 0 };
  const nextDecision = decideVisionLlmEscalation({
    ...validation,
    providerAttempts: [...attempts, initialDecision.providerId]
  }, input.policy ?? {});

  return {
    decision: nextDecision,
    attemptedProviderId: initialDecision.providerId,
    providerResult,
    validation,
    approvalCandidate: nextDecision.action === OCR_ROUTING_ACTION.APPROVAL_CANDIDATE
  };
}
