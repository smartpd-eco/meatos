const DEFAULT_PADDLE_MODEL_BASE_URL = "/ocr-models/paddle";
const DEFAULT_TESSERACT_WORKER_PATH = "/node_modules/tesseract.js/dist/worker.min.js";
const DEFAULT_TESSERACT_CORE_PATH = "/node_modules/tesseract.js-core";
const DEFAULT_TESSERACT_LANG_PATH = "/ocr-models/tesseract/lang-data";
const DEFAULT_EASYOCR_SERVICE_URL = "";

export const OCR_RUNTIME_CONFIG = {
  paddleModelBaseUrl: normalizeBaseUrl(globalThis.__MEATOS_OCR__?.paddleModelBaseUrl ?? DEFAULT_PADDLE_MODEL_BASE_URL),
  paddleDetectionModelName: "PP-OCRv5_mobile_det",
  paddleRecognitionModelName: "PP-OCRv5_mobile_rec",
  easyOcrServiceUrl: normalizeOptionalBaseUrl(globalThis.__MEATOS_OCR__?.easyOcrServiceUrl ?? DEFAULT_EASYOCR_SERVICE_URL),
  tesseractWorkerPath: normalizePath(globalThis.__MEATOS_OCR__?.tesseractWorkerPath ?? DEFAULT_TESSERACT_WORKER_PATH),
  tesseractCorePath: normalizePath(globalThis.__MEATOS_OCR__?.tesseractCorePath ?? DEFAULT_TESSERACT_CORE_PATH),
  tesseractLangPath: normalizePath(globalThis.__MEATOS_OCR__?.tesseractLangPath ?? DEFAULT_TESSERACT_LANG_PATH),
  tesseractLanguages: Array.isArray(globalThis.__MEATOS_OCR__?.tesseractLanguages)
    ? globalThis.__MEATOS_OCR__.tesseractLanguages.map((value) => String(value ?? "").trim()).filter(Boolean)
    : ["kor", "eng"]
};

function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return DEFAULT_PADDLE_MODEL_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

function normalizeOptionalBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function normalizePath(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}
