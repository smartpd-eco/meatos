export function evaluateOcrIntakeQuality(analysis = {}) {
  const qualityScore = Number(analysis.qualityScore ?? 0);
  const warnings = Array.isArray(analysis.warnings) ? [...analysis.warnings] : [];
  const recapture = [];

  if (qualityScore < 70) recapture.push("LOW_QUALITY");
  if (warnings.includes("LOW_RESOLUTION")) recapture.push("LOW_RESOLUTION");
  if (warnings.includes("LOW_BRIGHTNESS")) recapture.push("LOW_BRIGHTNESS");
  if (warnings.includes("LOW_CONTRAST")) recapture.push("LOW_CONTRAST");
  if (warnings.includes("SHADOW_RISK")) recapture.push("SHADOW_RISK");
  if (warnings.includes("BLUR_RISK")) recapture.push("BLUR_RISK");
  if (warnings.includes("ROTATION_RECOMMENDED") || warnings.includes("ROTATION_REVIEW_REQUIRED")) {
    recapture.push("ROTATION_REVIEW_REQUIRED");
  }

  const recommendRecapture = recapture.length > 0;

  return {
    qualityScore,
    recommendRecapture,
    recaptureReasonCodes: dedupe(recapture),
    threshold: qualityScore >= 85 ? "AUTO_PATH" : qualityScore >= 70 ? "REVIEW_PATH" : "RECAPTURE_PATH"
  };
}

function dedupe(values) {
  return [...new Set(values)];
}
