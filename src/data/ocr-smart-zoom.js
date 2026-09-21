export const SMART_ZOOM_CONFIG = Object.freeze({
  promptVersion: "meatos-smart-zoom-v1",
  maxCellsPerDocument: 3,
  readConfidenceThreshold: 0.9,
  mappingAutoThreshold: 0.9,
  mappingSuggestThreshold: 0.75,
  candidateGapThreshold: 0.1,
  paddingRatio: 0.15,
  scale: 4
});

const zoomCache = new Map();

export function normalizeConfidenceRatio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(1, numeric > 1 ? numeric / 100 : numeric);
}

export function normalizeBoundingBox(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= 1 || y >= 1) return null;
  const right = Math.min(1, x + width);
  const bottom = Math.min(1, y + height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function mappingDecision(topScore, secondScore = 0) {
  const top = normalizeConfidenceRatio(topScore);
  const second = normalizeConfidenceRatio(secondScore);
  const gap = Math.max(0, top - second);
  if (top >= SMART_ZOOM_CONFIG.mappingAutoThreshold && gap >= SMART_ZOOM_CONFIG.candidateGapThreshold) {
    return { status: "AUTO_APPROVED", confidence: top, gap };
  }
  if (top >= SMART_ZOOM_CONFIG.mappingSuggestThreshold) {
    return { status: "SUGGESTED", confidence: top, gap };
  }
  return { status: "UNRESOLVED", confidence: top, gap };
}

export function shouldTriggerSmartZoom(lineItem, mapping = {}) {
  const readConfidence = normalizeConfidenceRatio(lineItem?.readConfidence ?? lineItem?.confidence);
  const uncertainFields = Array.isArray(lineItem?.uncertainFields) ? lineItem.uncertainFields : [];
  const readStatus = String(lineItem?.readStatus ?? "").toUpperCase();
  const top = normalizeConfidenceRatio(mapping.topScore);
  const second = normalizeConfidenceRatio(mapping.secondScore);
  const mappingUncertain = Boolean(mapping.candidateFound) && (
    top < SMART_ZOOM_CONFIG.mappingAutoThreshold
    || Math.max(0, top - second) < SMART_ZOOM_CONFIG.candidateGapThreshold
  );
  return Boolean(
    !String(lineItem?.rawProductName ?? "").trim()
    || readConfidence < SMART_ZOOM_CONFIG.readConfidenceThreshold
    || (readStatus && readStatus !== "READABLE")
    || uncertainFields.includes("rawProductName")
    || mappingUncertain
  );
}

export function selectSmartZoomTargets(lineItems, mappings = []) {
  const candidates = (Array.isArray(lineItems) ? lineItems : [])
    .map((lineItem, index) => ({
      lineItem,
      index,
      mapping: mappings[index] ?? {},
      box: normalizeBoundingBox(lineItem?.boundingBox),
      confidence: normalizeConfidenceRatio(lineItem?.readConfidence ?? lineItem?.confidence)
    }))
    .filter((entry) => shouldTriggerSmartZoom(entry.lineItem, entry.mapping) && entry.box)
    .sort((left, right) => left.confidence - right.confidence || left.index - right.index);
  return candidates
    .filter((entry, index, all) => !all.some((other, otherIndex) =>
      otherIndex !== index && boundingBoxOverlapRatio(entry.box, other.box) >= 0.65
    ))
    .slice(0, SMART_ZOOM_CONFIG.maxCellsPerDocument);
}

export function boundingBoxOverlapRatio(left, right) {
  const a = normalizeBoundingBox(left);
  const b = normalizeBoundingBox(right);
  if (!a || !b) return 0;
  const intersectionWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const intersectionHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = intersectionWidth * intersectionHeight;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

export function initializeSmartZoomFields(lineItem) {
  const first = String(lineItem?.rawProductName ?? "").trim();
  const readConfidence = normalizeConfidenceRatio(lineItem?.readConfidence ?? lineItem?.confidence);
  const readStatus = String(lineItem?.readStatus ?? (first && readConfidence >= 0.9 ? "READABLE" : "PARTIAL")).toUpperCase();
  return {
    ...lineItem,
    rawProductNameFirstPass: first || null,
    rawProductNameZoomPass: null,
    rawProductNameFinal: first || null,
    rawProductName: first || null,
    readConfidenceFirst: readConfidence,
    readConfidenceZoom: null,
    readConfidence,
    readStatus,
    correctionSource: "FIRST_PASS",
    reviewRequired: readStatus !== "READABLE" || readConfidence < SMART_ZOOM_CONFIG.readConfidenceThreshold
  };
}

export function mergeSmartZoomResult(lineItem, zoomResult) {
  const base = initializeSmartZoomFields(lineItem);
  const zoomName = String(zoomResult?.rawProductName ?? "").trim();
  const zoomConfidence = normalizeConfidenceRatio(zoomResult?.readConfidence);
  const zoomStatus = String(zoomResult?.readStatus ?? "UNREADABLE").toUpperCase();
  const zoomReadable = zoomStatus === "READABLE" && zoomConfidence >= SMART_ZOOM_CONFIG.readConfidenceThreshold && Boolean(zoomName);
  const changed = zoomReadable && fingerprint(zoomName) !== fingerprint(base.rawProductNameFirstPass);
  const unresolved = !zoomReadable;
  const uncertainFields = new Set(Array.isArray(base.uncertainFields) ? base.uncertainFields : []);
  if (unresolved || changed) uncertainFields.add("rawProductName");
  else uncertainFields.delete("rawProductName");
  return {
    ...base,
    rawProductNameZoomPass: zoomName || null,
    rawProductNameFinal: base.rawProductNameFirstPass,
    rawProductName: base.rawProductNameFirstPass,
    smartZoomSuggestion: changed ? zoomName : null,
    readConfidenceZoom: zoomConfidence,
    readConfidence: changed ? base.readConfidenceFirst : (zoomReadable ? zoomConfidence : base.readConfidenceFirst),
    readStatus: changed ? "PARTIAL" : (zoomReadable ? "READABLE" : zoomStatus),
    uncertainCharacters: Array.isArray(zoomResult?.uncertainCharacters) ? zoomResult.uncertainCharacters : [],
    uncertainFields: [...uncertainFields],
    correctionSource: zoomReadable ? (changed ? "SMART_ZOOM_SUGGESTED" : "SMART_ZOOM_VERIFIED") : "SMART_ZOOM_UNRESOLVED",
    reviewRequired: unresolved || changed
  };
}

export function smartZoomCacheKey(imageHash, boundingBox, modelVersion = "gemini-flash") {
  const box = normalizeBoundingBox(boundingBox);
  if (!imageHash || !box) return "";
  const coordinates = [box.x, box.y, box.width, box.height].map((value) => value.toFixed(5)).join(":");
  return [imageHash, coordinates, SMART_ZOOM_CONFIG.promptVersion, modelVersion].join(":");
}

export function getCachedSmartZoom(key) {
  return key ? zoomCache.get(key) ?? null : null;
}

export function cacheSmartZoom(key, value) {
  if (!key || !value) return;
  zoomCache.set(key, value);
  while (zoomCache.size > 30) zoomCache.delete(zoomCache.keys().next().value);
}

export async function createSmartZoomCrop(imageDataUrl, boundingBox, options = {}) {
  const box = normalizeBoundingBox(boundingBox);
  if (!box) throw new Error("SMART_ZOOM_BOUNDING_BOX_REQUIRED");
  const image = await loadImage(imageDataUrl);
  const paddingRatio = Number(options.paddingRatio ?? SMART_ZOOM_CONFIG.paddingRatio);
  const scale = Math.max(1, Number(options.scale ?? SMART_ZOOM_CONFIG.scale));
  const padX = box.width * paddingRatio;
  const padY = box.height * paddingRatio;
  const left = Math.max(0, box.x - padX);
  const top = Math.max(0, box.y - padY);
  const right = Math.min(1, box.x + box.width + padX);
  const bottom = Math.min(1, box.y + box.height + padY);
  const source = {
    x: Math.floor(left * image.naturalWidth),
    y: Math.floor(top * image.naturalHeight),
    width: Math.max(1, Math.ceil((right - left) * image.naturalWidth)),
    height: Math.max(1, Math.ceil((bottom - top) * image.naturalHeight))
  };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("SMART_ZOOM_CANVAS_UNAVAILABLE");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  applyWeakContrast(context, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.94),
    source,
    output: { width: canvas.width, height: canvas.height },
    paddingRatio,
    scale
  };
}

function applyWeakContrast(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const contrast = 1.06;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = clampByte((pixels[index] - 128) * contrast + 128);
    pixels[index + 1] = clampByte((pixels[index + 1] - 128) * contrast + 128);
    pixels[index + 2] = clampByte((pixels[index + 2] - 128) * contrast + 128);
  }
  context.putImageData(imageData, 0, 0);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("SMART_ZOOM_IMAGE_LOAD_FAILED"));
    image.src = dataUrl;
  });
}

function fingerprint(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
