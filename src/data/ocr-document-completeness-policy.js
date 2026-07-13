import { createEvidenceField, FIELD_EVIDENCE_STATUS } from "./meatos-standard-invoice.js";

const TOTAL_FIELD_NAMES = ["supplyAmount", "taxAmount", "totalAmount"];

export function applyDocumentCompletenessPolicy(documentFields = {}, assessment = {}) {
  const reasonCodes = collectReasonCodes(assessment);
  const incomplete = reasonCodes.length > 0;
  if (!incomplete) {
    return { documentFields: structuredCloneSafe(documentFields), incomplete: false, totalsWithheld: false, warnings: [], uiWarning: null };
  }

  const nextFields = structuredCloneSafe(documentFields);
  for (const fieldName of TOTAL_FIELD_NAMES) {
    nextFields[fieldName] = createEvidenceField(null, {
      status: assessment.unreadableTotals ? FIELD_EVIDENCE_STATUS.UNREADABLE : FIELD_EVIDENCE_STATUS.MISSING,
      confidence: 0,
      source: "DOCUMENT_COMPLETENESS_GATE",
      reasonCodes
    });
  }
  return {
    documentFields: nextFields,
    incomplete: true,
    totalsWithheld: true,
    warnings: [{ code: "DOCUMENT_TOTALS_WITHHELD", reasonCodes }],
    uiWarning: {
      severity: "warning",
      title: "문서 합계를 확인할 수 없습니다",
      message: "문서 일부가 잘리거나 훼손되어 합계는 입력하지 않았습니다. 원본을 다시 촬영하거나 합계 항목을 직접 확인해주세요.",
      action: assessment.recaptureAvailable === false ? "REVIEW" : "RECAPTURE_OR_REVIEW"
    }
  };
}

function collectReasonCodes(assessment) {
  const reasons = [];
  if (assessment.isPartial) reasons.push("PARTIAL_DOCUMENT");
  if (assessment.isDamaged) reasons.push("DAMAGED_DOCUMENT");
  if (assessment.isCropped) reasons.push("DOCUMENT_CROPPED");
  if (assessment.unreadableTotals) reasons.push("TOTAL_REGION_UNREADABLE");
  if (Number(assessment.missingCornerCount ?? 0) > 0) reasons.push("DOCUMENT_BOUNDARY_INCOMPLETE");
  return [...new Set(reasons)];
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
