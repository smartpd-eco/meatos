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
  const detectedBounds = detectDarkBorderBounds(image);
  const cropMargin = qualityScore >= 85 ? 0.01 : qualityScore >= 70 ? 0.015 : 0.02;
  const padX = Math.round(width * cropMargin);
  const padY = Math.round(height * cropMargin);
  const suggestedBounds = detectedBounds
    ? {
        left: Math.max(0, detectedBounds.left - padX),
        top: Math.max(0, detectedBounds.top - padY),
        right: Math.min(width, detectedBounds.right + padX),
        bottom: Math.min(height, detectedBounds.bottom + padY)
      }
    : { left: 0, top: 0, right: width, bottom: height };
  return {
    hasCropHint: width > 0 && height > 0,
    cropApplied: Boolean(detectedBounds),
    cropMargin,
    suggestedBounds,
    documentConfidence: qualityScore >= 85 ? "HIGH" : qualityScore >= 70 ? "MEDIUM" : "LOW"
  };
}

// 문서 경계 전체를 추측해 잘라내면 표의 첫/마지막 행이 사라질 수 있다.
// 따라서 사진 가장자리에 연속된 검은 띠가 명확할 때만 보수적으로 제거한다.
function detectDarkBorderBounds(image) {
  const sourceWidth = Number(image?.naturalWidth ?? image?.width ?? 0);
  const sourceHeight = Number(image?.naturalHeight ?? image?.height ?? 0);
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rowUsable = (y) => bandIsUsable(pixels, canvas.width, canvas.height, "row", y);
  const columnUsable = (x) => bandIsUsable(pixels, canvas.width, canvas.height, "column", x);
  let top = 0;
  let bottom = canvas.height - 1;
  let left = 0;
  let right = canvas.width - 1;
  while (top < bottom && !rowUsable(top)) top += 1;
  while (bottom > top && !rowUsable(bottom)) bottom -= 1;
  while (left < right && !columnUsable(left)) left += 1;
  while (right > left && !columnUsable(right)) right -= 1;
  const retainedWidth = right - left + 1;
  const retainedHeight = bottom - top + 1;
  if (retainedWidth < canvas.width * 0.55 || retainedHeight < canvas.height * 0.55) return null;
  const removedRatio = 1 - ((retainedWidth * retainedHeight) / (canvas.width * canvas.height));
  if (removedRatio < 0.025) return null;
  return {
    left: Math.round(left / scale),
    top: Math.round(top / scale),
    right: Math.round((right + 1) / scale),
    bottom: Math.round((bottom + 1) / scale)
  };
}

function bandIsUsable(pixels, width, height, axis, position) {
  const length = axis === "row" ? width : height;
  let luminanceSum = 0;
  let bright = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const x = axis === "row" ? offset : position;
    const y = axis === "row" ? position : offset;
    const index = (y * width + x) * 4;
    const luminance = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    luminanceSum += luminance;
    if (luminance > 80) bright += 1;
  }
  const average = luminanceSum / Math.max(1, length);
  return average >= 38 || bright / Math.max(1, length) >= 0.12;
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
