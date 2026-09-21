import { estimateDocumentCropHints } from "./ocr-image-preprocessor.js";

export async function processUploadedOcrImage(file, options = {}) {
  const originalImageDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalImageDataUrl);
  const initialCropHints = estimateDocumentCropHints(image);
  const cropBounds = initialCropHints.suggestedBounds;
  const analysis = analyzeDocumentImage(image, { ...options, cropBounds });
  const cropHints = { ...estimateDocumentCropHints(image, analysis), suggestedBounds: cropBounds };
  const preprocessing = preprocessDocumentImage(image, analysis, { ...options, cropBounds });
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
      encodedSizeBytes: preprocessing.encodedSizeBytes,
      rotationDegrees: preprocessing.rotationDegrees,
      dataUrl: preprocessing.dataUrl,
      steps: preprocessing.steps
    },
    imageAnalysis: analysis,
    cropHints,
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
  const sample = createSampleCanvas(image, maxSampleSize, options.cropBounds);
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
  // 접사(가까이서 찍은 작은 글자) 대응: 상한을 올려 해상도를 덜 버리고,
  // 명세서가 작게 잡힌 사진은 OCR 최소 글자높이를 확보하도록 확대(업스케일)한다.
  const maxDimension = Number(options.maxDimension ?? 2600);   // 긴 변 상한(기존 1800 → 2600)
  const minLongSide = Number(options.minLongSide ?? 2200);     // 이보다 작으면 확대
  const maxUpscale = Number(options.maxUpscale ?? 2);          // 확대 배율 상한(과확대 방지)
  const sourceWidth = Number(image?.naturalWidth ?? image?.width ?? 0);
  const sourceHeight = Number(image?.naturalHeight ?? image?.height ?? 0);
  const crop = normalizeCropBounds(options.cropBounds, sourceWidth, sourceHeight);
  const croppedWidth = Math.max(1, crop.right - crop.left);
  const croppedHeight = Math.max(1, crop.bottom - crop.top);
  const longSide = Math.max(croppedWidth, croppedHeight);
  let sourceRatio = maxDimension / longSide;                   // 큰 사진은 상한까지 축소
  if (longSide < minLongSide) sourceRatio = minLongSide / longSide; // 작은/접사 사진은 확대
  sourceRatio = Math.max(0.1, Math.min(sourceRatio, maxUpscale));   // 확대는 최대 maxUpscale 배
  const drawWidth = Math.max(1, Math.round(croppedWidth * sourceRatio));
  const drawHeight = Math.max(1, Math.round(croppedHeight * sourceRatio));
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
  context.drawImage(
    image,
    crop.left,
    crop.top,
    croppedWidth,
    croppedHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  context.restore();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrastBoost = Number(options.contrastBoost ?? (analysis.qualityScore < 70 ? 1.10 : 1.06));
  const brightnessBoost = Number(options.brightnessBoost ?? (analysis.averageLuminance < 120 ? 8 : 4));
  const shadowLift = Number(options.shadowLift ?? (analysis.darkRatio > 30 ? 0.14 : 0.08));
  const preserveColor = options.preserveColor !== false;

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
    if (preserveColor) {
      const lift = adjusted - luminance;
      data[index] = clamp((originalR - 128) * contrastBoost + 128 + lift, 0, 255);
      data[index + 1] = clamp((originalG - 128) * contrastBoost + 128 + lift, 0, 255);
      data[index + 2] = clamp((originalB - 128) * contrastBoost + 128 + lift, 0, 255);
    } else {
      data[index] = adjusted;
      data[index + 1] = adjusted;
      data[index + 2] = adjusted;
    }
  }

  // 접사·흔들림으로 뭉개진 글자 윤곽을 살리는 선명화(언샤프 마스크). 흐릴수록 강하게.
  const sharpenAmount = Number(options.sharpenAmount ?? (analysis.edgeDensity != null && analysis.edgeDensity < 22 ? 0.9 : 0.6));
  applyUnsharpMask(data, canvas.width, canvas.height, sharpenAmount);
  context.putImageData(imageData, 0, 0);

  const jpegQuality = clamp(Number(options.jpegQuality ?? 0.84), 0.72, 0.94);
  const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
  return {
    dataUrl,
    encodedSizeBytes: estimateDataUrlBytes(dataUrl),
    width: canvas.width,
    height: canvas.height,
    rotationDegrees,
    steps: [
      "EXIF_ROTATE",
      "CONSERVATIVE_DOCUMENT_CROP",
      `RESIZE_LIMIT_${maxDimension}`,
      preserveColor ? "COLOR_GRID_SEPARATION_PRESERVED" : "GRAYSCALE",
      "WEAK_CONTRAST_ENHANCE",
      "WEAK_SHADOW_LIFT",
      "UNSHARP_MASK_SHARPEN",
      "JPEG_NORMALIZE"
    ]
  };
}

// 언샤프 마스크: 중심값 + amount×(중심값 - 이웃평균). 테두리 1px는 그대로 둔다.
function applyUnsharpMask(data, width, height, amount) {
  if (!(amount > 0) || width < 3 || height < 3) return;
  const src = new Uint8ClampedArray(data);
  const rowBytes = width * 4;
  for (let y = 1; y < height - 1; y += 1) {
    let offset = (y * width + 1) * 4;
    for (let x = 1; x < width - 1; x += 1, offset += 4) {
      for (let c = 0; c < 3; c += 1) {
        const p = offset + c;
        const center = src[p];
        const blur = (src[p - 4] + src[p + 4] + src[p - rowBytes] + src[p + rowBytes] + center) / 5;
        const v = center + amount * (center - blur);
        data[p] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
}

function estimateDataUrlBytes(dataUrl) {
  const encoded = String(dataUrl ?? "").split(",", 2)[1] || "";
  return Math.max(0, Math.floor(encoded.length * 0.75));
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

function createSampleCanvas(image, maxSize, cropBounds) {
  const width = Number(image?.naturalWidth ?? image?.width ?? 0);
  const height = Number(image?.naturalHeight ?? image?.height ?? 0);
  const crop = normalizeCropBounds(cropBounds, width, height);
  const croppedWidth = Math.max(1, crop.right - crop.left);
  const croppedHeight = Math.max(1, crop.bottom - crop.top);
  const scale = Math.min(1, maxSize / Math.max(croppedWidth, croppedHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(croppedWidth * scale));
  canvas.height = Math.max(1, Math.round(croppedHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, crop.left, crop.top, croppedWidth, croppedHeight, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function normalizeCropBounds(bounds, width, height) {
  const left = clamp(Math.round(Number(bounds?.left ?? 0)), 0, Math.max(0, width - 1));
  const top = clamp(Math.round(Number(bounds?.top ?? 0)), 0, Math.max(0, height - 1));
  const right = clamp(Math.round(Number(bounds?.right ?? width)), left + 1, width);
  const bottom = clamp(Math.round(Number(bounds?.bottom ?? height)), top + 1, height);
  return { left, top, right, bottom };
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
