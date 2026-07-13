export function buildOcrPreprocessingVariants(image, analysis = {}, options = {}) {
  const sourceWidth = Number(image?.naturalWidth ?? image?.width ?? 0);
  const sourceHeight = Number(image?.naturalHeight ?? image?.height ?? 0);
  const rotationDegrees = Number(options.rotationDegrees ?? analysis.recommendedRotation ?? 0);
  const maxDimension = Number(options.maxDimension ?? 1600);
  const scale = sourceWidth > 0 && sourceHeight > 0
    ? Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    : 1;
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));

  return [
    createVariant(image, {
      key: "original",
      label: "ORIGINAL",
      rotationDegrees: 0,
      drawWidth,
      drawHeight,
      scale,
      contrastBoost: 1.0,
      brightnessBoost: 0,
      sharpen: 0
    }),
    createVariant(image, {
      key: "deskew",
      label: "DESKEW",
      rotationDegrees,
      drawWidth,
      drawHeight,
      scale,
      contrastBoost: analysis.qualityScore < 70 ? 1.26 : 1.14,
      brightnessBoost: analysis.averageLuminance < 120 ? 12 : 6,
      sharpen: 1
    }),
    createVariant(image, {
      key: "contrast",
      label: "CONTRAST",
      rotationDegrees,
      drawWidth,
      drawHeight,
      scale,
      contrastBoost: 1.35,
      brightnessBoost: analysis.averageLuminance < 115 ? 16 : 8,
      sharpen: 1
    })
  ];
}

export function estimateDocumentCropHints(image, analysis = {}) {
  const width = Number(image?.naturalWidth ?? image?.width ?? 0);
  const height = Number(image?.naturalHeight ?? image?.height ?? 0);
  const qualityScore = Number(analysis.qualityScore ?? 0);
  const cropMargin = qualityScore >= 85 ? 0.03 : qualityScore >= 70 ? 0.05 : 0.08;
  return {
    hasCropHint: width > 0 && height > 0,
    cropMargin,
    suggestedBounds: {
      left: Math.round(width * cropMargin),
      top: Math.round(height * cropMargin),
      right: Math.round(width * (1 - cropMargin)),
      bottom: Math.round(height * (1 - cropMargin))
    },
    documentConfidence: qualityScore >= 85 ? "HIGH" : qualityScore >= 70 ? "MEDIUM" : "LOW"
  };
}

export function summarizePreprocessingVariants(variants = []) {
  return variants.map((variant) => ({
    key: variant.key,
    label: variant.label,
    rotationDegrees: variant.rotationDegrees,
    width: variant.width,
    height: variant.height,
    dataUrl: variant.dataUrl,
    score: variant.score
  }));
}

function createVariant(image, config = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rotated = config.rotationDegrees === 90 || config.rotationDegrees === 270;
  canvas.width = rotated ? config.drawHeight : config.drawWidth;
  canvas.height = rotated ? config.drawWidth : config.drawHeight;

  context.save();
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((Number(config.rotationDegrees ?? 0) * Math.PI) / 180);
  context.drawImage(image, -config.drawWidth / 2, -config.drawHeight / 2, config.drawWidth, config.drawHeight);
  context.restore();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrastBoost = Number(config.contrastBoost ?? 1);
  const brightnessBoost = Number(config.brightnessBoost ?? 0);
  const sharpen = Number(config.sharpen ?? 0);

  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    let adjusted = (luminance - 128) * contrastBoost + 128 + brightnessBoost;
    if (sharpen > 0 && luminance < 118) {
      adjusted += (118 - luminance) * 0.12 * sharpen;
    }
    adjusted = clamp(adjusted, 0, 255);
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }

  context.putImageData(imageData, 0, 0);

  return {
    key: config.key ?? "variant",
    label: config.label ?? "VARIANT",
    rotationDegrees: Number(config.rotationDegrees ?? 0),
    width: canvas.width,
    height: canvas.height,
    scale: Number(config.scale ?? 1),
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    score: Math.round(estimateVariantScore(canvas))
  };
}

function estimateVariantScore(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const sample = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let luminance = 0;
  let variance = 0;
  let samples = 0;

  for (let index = 0; index < sample.length; index += 16) {
    const value = (sample[index] * 0.299) + (sample[index + 1] * 0.587) + (sample[index + 2] * 0.114);
    luminance += value;
    variance += value * value;
    samples += 1;
  }

  if (!samples) return 0;
  const average = luminance / samples;
  const spread = Math.sqrt(Math.max(0, (variance / samples) - (average * average)));
  return clamp((average / 2) + spread, 0, 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
}
