export function evaluateOcrIntakeQuality(analysis = {}) {
  const qualityScore = Number(analysis.qualityScore ?? 0);
  const warnings = Array.isArray(analysis.warnings) ? [...analysis.warnings] : [];
  const recapture = [];

  // 경고 하나만으로 현장 촬영을 막지 않는다. 심각한 불량만 재촬영하고,
  // 55~84점은 약하게 보정한 뒤 불확실 필드만 확인하도록 보낸다.
  // Only block genuinely unusable captures. Shadowed or slightly blurred invoices
  // continue through weak correction and are surfaced as field-level review instead.
  if (qualityScore < 35) recapture.push("LOW_QUALITY");
  if (warnings.includes("LOW_RESOLUTION") && Math.min(Number(analysis.width ?? 0), Number(analysis.height ?? 0)) < 500) recapture.push("LOW_RESOLUTION");
  if (warnings.includes("LOW_BRIGHTNESS") && Number(analysis.averageLuminance ?? 0) < 45) recapture.push("LOW_BRIGHTNESS");
  if (warnings.includes("LOW_CONTRAST") && Number(analysis.contrast ?? 0) < 12) recapture.push("LOW_CONTRAST");
  if (warnings.includes("SHADOW_RISK") && Number(analysis.darkRatio ?? 0) > 70) recapture.push("SHADOW_RISK");
  if (warnings.includes("BLUR_RISK") && Number(analysis.edgeDensity ?? 0) < 5) recapture.push("BLUR_RISK");
  if (warnings.includes("ROTATION_RECOMMENDED") || warnings.includes("ROTATION_REVIEW_REQUIRED")) {
    recapture.push("ROTATION_REVIEW_REQUIRED");
  }

  const recommendRecapture = recapture.length > 0;

  return {
    qualityScore,
    recommendRecapture,
    recaptureReasonCodes: dedupe(recapture),
    threshold: recommendRecapture ? "RECAPTURE_PATH" : qualityScore >= 85 ? "AUTO_PATH" : "REVIEW_PATH"
  };
}

function dedupe(values) {
  return [...new Set(values)];
}
