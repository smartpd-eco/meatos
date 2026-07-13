import { buildOcrPreprocessingVariants, estimateDocumentCropHints, summarizePreprocessingVariants } from "./ocr-image-preprocessor.js";

export async function processUploadedOcrImage(file, options = {}) {
  const originalImageDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalImageDataUrl);
  const analysis = analyzeDocumentImage(image, options);
  const preprocessing = preprocessDocumentImage(image, analysis, options);
  const cropHints = estimateDocumentCropHints(image, analysis);
  const preprocessingVariants = summarizePreprocessingVariants(buildOcrPreprocessingVariants(image, analysis, options));
  const pipelineTrace = buildPipelineTrace(analysis, preprocessing);
  const originalImageHash = createLocalFileHash(file);
  const preprocessedImageHash = fingerprint(`${originalImageHash}:${preprocessing.rotationDegrees}:${analysis.qualityScore}`);

  return {
    originalImageDataUrl,
    originalImageHash,
    originalImage: {
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      hash: originalImageHash,
      capturedAt: new Date().toISOString()
    },
    preprocessedImageDataUrl: preprocessing.dataUrl,
    preprocessedImageBlob: dataUrlToBlob(preprocessing.dataUrl),
    preprocessedImageHash,
    preprocessedImage: {
      width: preprocessing.width,
      height: preprocessing.height,
      rotationDegrees: preprocessing.rotationDegrees,
      dataUrl: preprocessing.dataUrl,
      steps: preprocessing.steps
    },
    imageAnalysis: analysis,
    cropHints,
    preprocessingVariants,
    pipelineTrace,
    qualityScore: analysis.qualityScore,
    recommendedRotation: analysis.recommendedRotation,
    warnings: analysis.warnings
  };
}

export function analyzeDocumentImage(image, options = {}) {
  const width = Number(image?.naturalWidth ?? image?.width ?? 0);
  const height = Number(image?.naturalHeight ?? image?.height ?? 0);
  const maxSampleSize = Number(options.maxSampleSize ?? 240);
  const sample = createSampleCanvas(image, maxSampleSize);
  const context = sample.canvas.getContext("2d", { willReadFrequently: true });
  const data = context.getImageData(0, 0, sample.canvas.width, sample.canvas.height).data;

  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let darkPixels = 0;
  let edgeScore = 0;
  let total = 0;
  let topHalfLum = 0;
  let bottomHalfLum = 0;
  let leftHalfLum = 0;
  let rightHalfLum = 0;

  for (let y = 0; y < sample.canvas.height; y += 1) {
    for (let x = 0; x < sample.canvas.width; x += 1) {
      const index = (y * sample.canvas.width + x) * 4;
      const luminance = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
      luminanceSum += luminance;
      luminanceSquaredSum += luminance * luminance;
      if (luminance < 92) darkPixels += 1;
      if (y < sample.canvas.height / 2) topHalfLum += luminance;
      else bottomHalfLum += luminance;
      if (x < sample.canvas.width / 2) leftHalfLum += luminance;
      else rightHalfLum += luminance;

      if (x > 0) {
        const leftIndex = (y * sample.canvas.width + (x - 1)) * 4;
        const leftLum = (data[leftIndex] * 0.299) + (data[leftIndex + 1] * 0.587) + (data[leftIndex + 2] * 0.114);
        edgeScore += Math.abs(luminance - leftLum);
      }
      if (y > 0) {
        const topIndex = ((y - 1) * sample.canvas.width + x) * 4;
        const topLum = (data[topIndex] * 0.299) + (data[topIndex + 1] * 0.587) + (data[topIndex + 2] * 0.114);
        edgeScore += Math.abs(luminance - topLum);
      }
      total += 1;
    }
  }

  const averageLuminance = total ? luminanceSum / total : 0;
  const variance = total ? (luminanceSquaredSum / total) - (averageLuminance * averageLuminance) : 0;
  const contrast = Math.sqrt(Math.max(0, variance));
  const darkRatio = total ? darkPixels / total : 0;
  const edgeDensity = total ? edgeScore / total : 0;
  const topBottomDelta = total ? Math.abs((topHalfLum - bottomHalfLum) / total) : 0;
  const leftRightDelta = total ? Math.abs((leftHalfLum - rightHalfLum) / total) : 0;
  const aspectRatio = height > 0 ? width / height : 1;
  const lowResolutionPenalty = Math.max(0, 28 - Math.min(width, height) / 70);
  const brightnessPenalty = averageLuminance < 95 ? (95 - averageLuminance) * 0.7 : 0;
  const contrastPenalty = contrast < 35 ? (35 - contrast) * 0.8 : 0;
  const shadowPenalty = Math.min(18, (darkRatio * 40) + Math.min(10, topBottomDelta / 12) + Math.min(6, leftRightDelta / 14));
  const blurPenalty = edgeDensity < 18 ? (18 - edgeDensity) * 1.2 : 0;
  const qualityScore = clamp(100 - lowResolutionPenalty - brightnessPenalty - contrastPenalty - shadowPenalty - blurPenalty, 0, 100);
  // 거래명세서는 가로/세로 양식이 모두 있으므로 화면 비율만으로 90도 회전하지 않는다.
  const recommendedRotation = Number(options.exifRotation ?? options.rotationDegrees ?? 0);
  const warnings = [];

  if (minDimension(width, height) < 1200) warnings.push("LOW_RESOLUTION");
  if (averageLuminance < 95) warnings.push("LOW_BRIGHTNESS");
  if (contrast < 35) warnings.push("LOW_CONTRAST");
  if (darkRatio > 0.38) warnings.push("SHADOW_RISK");
  if (edgeDensity < 18) warnings.push("BLUR_RISK");
  if (![0, 90, 180, 270].includes(recommendedRotation)) warnings.push("ROTATION_REVIEW_REQUIRED");

  return {
    width,
    height,
    aspectRatio: Number(aspectRatio.toFixed(2)),
    averageLuminance: Math.round(averageLuminance),
    contrast: Math.round(contrast),
    darkRatio: Number((darkRatio * 100).toFixed(1)),
    edgeDensity: Number(edgeDensity.toFixed(1)),
    shadowDelta: Number((topBottomDelta + leftRightDelta).toFixed(1)),
    qualityScore: Math.round(qualityScore),
    qualityLevel: qualityScore >= 85 ? "GOOD" : qualityScore >= 70 ? "FAIR" : qualityScore >= 50 ? "POOR" : "RECAPTURE",
    recommendedRotation,
    warnings
  };
}

export function preprocessDocumentImage(image, analysis = {}, options = {}) {
  const rotationDegrees = Number(options.rotationDegrees ?? analysis.recommendedRotation ?? 0);
  const maxDimension = Number(options.maxDimension ?? 1600);
  const sourceWidth = Number(image?.naturalWidth ?? image?.width ?? 0);
  const sourceHeight = Number(image?.naturalHeight ?? image?.height ?? 0);
  const sourceRatio = sourceWidth > 0 && sourceHeight > 0 ? Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight)) : 1;
  const drawWidth = Math.max(1, Math.round(sourceWidth * sourceRatio));
  const drawHeight = Math.max(1, Math.round(sourceHeight * sourceRatio));
  const rotated = rotationDegrees === 90 || rotationDegrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? drawHeight : drawWidth;
  canvas.height = rotated ? drawWidth : drawHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.save();
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotationDegrees * Math.PI) / 180);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrastBoost = Number(options.contrastBoost ?? (analysis.qualityScore < 70 ? 1.22 : 1.12));
  const brightnessBoost = Number(options.brightnessBoost ?? (analysis.averageLuminance < 120 ? 14 : 6));
  const shadowLift = Number(options.shadowLift ?? (analysis.darkRatio > 30 ? 0.18 : 0.10));

  for (let index = 0; index < data.length; index += 4) {
    const originalR = data[index];
    const originalG = data[index + 1];
    const originalB = data[index + 2];
    const luminance = (originalR * 0.299) + (originalG * 0.587) + (originalB * 0.114);
    let adjusted = luminance;
    adjusted = (adjusted - 128) * contrastBoost + 128 + brightnessBoost;
    if (luminance < 110) {
      adjusted += (110 - luminance) * shadowLift;
    }
    adjusted = clamp(adjusted, 0, 255);
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }

  context.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    width: canvas.width,
    height: canvas.height,
    rotationDegrees,
    steps: [
      "EXIF_ROTATE",
      "AUTOROTATE",
      "GRAYSCALE",
      "CONTRAST_ENHANCE",
      "SHADOW_REDUCTION",
      "JPEG_NORMALIZE"
    ]
  };
}

export function createLocalFileHash(file) {
  return fingerprint([file.name, file.size, file.lastModified, file.type].join("|"));
}

function buildPipelineTrace(analysis, preprocessing) {
  return [
    { step: "CAPTURED", status: "DONE", score: analysis.qualityScore },
    { step: "QUALITY_ANALYZED", status: analysis.qualityLevel, score: analysis.qualityScore },
    { step: "PREPROCESSED", status: "DONE", rotationDegrees: preprocessing.rotationDegrees },
    { step: "OCR_PENDING", status: "READY", score: analysis.qualityScore },
    { step: "REVIEW", status: analysis.qualityScore >= 85 ? "FAST_PATH" : "REVIEW_REQUIRED" }
  ];
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("이미지 파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    image.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded = ""] = String(dataUrl ?? "").split(",", 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function createSampleCanvas(image, maxSize) {
  const width = Number(image?.naturalWidth ?? image?.width ?? 0);
  const height = Number(image?.naturalHeight ?? image?.height ?? 0);
  const scale = width > 0 && height > 0 ? Math.min(1, maxSize / Math.max(width, height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function minDimension(width, height) {
  return Math.min(Number(width ?? 0), Number(height ?? 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fingerprint(value) {
  const text = String(value ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}
