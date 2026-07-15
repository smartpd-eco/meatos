import { OCR_RUNTIME_CONFIG } from "./ocr-runtime-config.js";
import { validateOcrInvoiceData } from "./ocr-business-validator.js";
import { reconstructOcrTable } from "./ocr-table-reconstructor.js";

const EASY_OCR_RESULT_CACHE = new Map();
const PADDLE_INSTANCE_CACHE = new Map();
const TESSERACT_WORKER_CACHE = new Map();

export function createOcrProviderAdapter(providerId, config = {}) {
  const normalizedProviderId = String(providerId ?? "mock").trim().toLowerCase();
  if (normalizedProviderId === "paddleocr" || normalizedProviderId === "paddle-ocr" || normalizedProviderId === "paddle") {
    return new PaddleOcrProvider(config);
  }
  if (normalizedProviderId === "clova-general" || normalizedProviderId === "clova") {
    return new ClovaOcrProvider(config);
  }
  if (normalizedProviderId === "easyocr-compare" || normalizedProviderId === "easyocr" || normalizedProviderId === "easy") {
    return new EasyOcrCompareProvider(config);
  }
  if (normalizedProviderId === "tesseract-compare" || normalizedProviderId === "tesseract" || normalizedProviderId === "compare") {
    return new TesseractCompareProvider(config);
  }
  return new MockOcrProvider(config);
}

class MockOcrProvider {
  constructor(config = {}) {
    this.config = config;
  }

  getProviderName() {
    return "Mock OCR Provider";
  }

  getProviderId() {
    return "mock";
  }

  getProviderVersion() {
    return "mock-1.0";
  }

  async healthCheck() {
    return {
      ok: true,
      providerName: this.getProviderName(),
      providerVersion: this.getProviderVersion(),
      mode: "mock",
      secretConnected: false,
      latencyMs: 0,
      checkedAt: new Date().toISOString()
    };
  }

  async recognizeDocument(input = {}) {
    const rawText = String(input.rawText ?? "").trim();
    const parsed = parseMockProviderText(rawText, input.supplierName ?? "");
    return {
      providerName: this.getProviderName(),
      providerVersion: this.getProviderVersion(),
      providerConfidence: 93,
      rawJson: {
        provider: "mock",
        text: rawText,
        supplierName: input.supplierName ?? "",
        imageHash: input.imageHash ?? ""
      },
      ...parsed,
      qualityScore: Number(input.qualityScore ?? parsed.qualityScore ?? 80),
      qualityGrade: qualityGrade(Number(input.qualityScore ?? parsed.qualityScore ?? 80)),
      recaptureRequired: false,
      recaptureReasonCodes: [],
      reconstructionConfidence: 0,
      reconstructionBasis: [],
      status: "REVIEW_REQUIRED"
    };
  }
}

class PaddleOcrProvider {
  constructor(config = {}) {
    this.config = config;
    this.instancePromise = null;
    this.modelAssetBaseUrl = normalizeModelAssetBaseUrl(
      config.modelAssetBaseUrl
      ?? globalThis.__MEATOS_OCR__?.paddleModelBaseUrl
      ?? OCR_RUNTIME_CONFIG.paddleModelBaseUrl
    );
    this.modelConfig = {
      lang: String(config.lang ?? "ch"),
      ocrVersion: String(config.ocrVersion ?? "PP-OCRv5"),
      textDetectionModelName: OCR_RUNTIME_CONFIG.paddleDetectionModelName,
      textDetectionModelAsset: {
        url: joinModelAssetUrl(this.modelAssetBaseUrl, `${OCR_RUNTIME_CONFIG.paddleDetectionModelName}_onnx_infer.tar`)
      },
      textRecognitionModelName: OCR_RUNTIME_CONFIG.paddleRecognitionModelName,
      textRecognitionModelAsset: {
        url: joinModelAssetUrl(this.modelAssetBaseUrl, `${OCR_RUNTIME_CONFIG.paddleRecognitionModelName}_onnx_infer.tar`)
      },
      worker: Boolean(config.worker ?? true),
      ortOptions: {
        backend: "wasm",
        wasmPaths: String(config.wasmPaths ?? "/node_modules/onnxruntime-web/dist/"),
        numThreads: Number(config.numThreads ?? 2),
        simd: config.simd ?? true
      }
    };
    this.instanceCacheKey = JSON.stringify(this.modelConfig);
  }

  getProviderName() {
    return "PaddleOCR Browser SDK";
  }

  getProviderId() {
    return "paddleocr";
  }

  getProviderVersion() {
    return "paddleocr-js@0.4.2";
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await this.ensureInstance();
      return {
        ok: true,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "browser-sdk",
        secretConnected: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: "PaddleOCR browser SDK is ready"
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "browser-sdk",
        secretConnected: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: error?.message ?? "PaddleOCR initialization failed",
        errorCode: error?.code ?? "INIT_ERROR"
      };
    }
  }

  async recognizeDocument(input = {}) {
    const image = input.imageBlob ?? input.file ?? input.blob ?? input.image ?? null;
    if (!image) {
      throw new Error("PaddleOCR requires a File or Blob input.");
    }

    const startedAt = Date.now();
    const ocr = await this.ensureInstance();
    const results = await ocr.predict(image);
    const result = Array.isArray(results) ? results[0] : results;
    if (!result) {
      throw new Error("PaddleOCR did not return a result.");
    }

    const normalized = normalizePaddleOcrResult(result, input);
    return {
      providerName: this.getProviderName(),
      providerVersion: this.getProviderVersion(),
      providerConfidence: normalized.providerConfidence,
      rawJson: {
        provider: "paddleocr-js",
        model: this.modelConfig,
        result,
        metrics: result.metrics ?? {},
        runtime: result.runtime ?? {},
        elapsedMs: Date.now() - startedAt
      },
      ...normalized
    };
  }

  async ensureInstance() {
    if (!this.instancePromise) {
      this.instancePromise = PADDLE_INSTANCE_CACHE.get(this.instanceCacheKey);
      if (!this.instancePromise) {
        this.instancePromise = this.createInstance().catch((error) => {
          PADDLE_INSTANCE_CACHE.delete(this.instanceCacheKey);
          this.instancePromise = null;
          throw error;
        });
        PADDLE_INSTANCE_CACHE.set(this.instanceCacheKey, this.instancePromise);
      }
    }
    return this.instancePromise;
  }

  async createInstance() {
    const mod = await import("@paddleocr/paddleocr-js");
    const PaddleOCR = mod.PaddleOCR ?? mod.default?.PaddleOCR ?? mod.default;
    if (!PaddleOCR) {
      throw new Error("PaddleOCR SDK export was not found.");
    }

    return PaddleOCR.create(this.modelConfig);
  }
}

class ClovaOcrProvider {
  constructor(config = {}) {
    this.config = config;
    this.functionUrl = String(config.functionUrl ?? "").trim();
  }

  getProviderName() {
    return "NAVER CLOVA OCR General";
  }

  getProviderId() {
    return "clova-general";
  }

  getProviderVersion() {
    return "clova-general";
  }

  async healthCheck() {
    if (!this.functionUrl) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "unconfigured",
        secretConnected: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: "OCR Edge Function URL is missing"
      };
    }

    const startedAt = Date.now();
    try {
      const response = await requestWithRetry(this.functionUrl, 2, { method: "GET" });
      const payload = await parseResponse(response);
      return {
        ok: response.ok,
        providerName: payload.providerName ?? this.getProviderName(),
        providerVersion: payload.providerVersion ?? this.getProviderVersion(),
        mode: payload.providerMode ?? "edge-function",
        secretConnected: Boolean(payload.secretConnected ?? payload.configured ?? response.ok),
        secretFingerprint: String(payload.secretFingerprint ?? "").trim(),
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: String(payload.message ?? payload.error ?? (response.ok ? "Provider healthy" : `OCR provider HTTP ${response.status}`)).trim(),
        errorCode: String(payload.errorCode ?? response.status ?? "")
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "edge-function",
        secretConnected: false,
        secretFingerprint: "",
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: error?.message ?? "OCR provider health check failed",
        errorCode: error?.code ?? "NETWORK"
      };
    }
  }

  async recognizeDocument(input = {}) {
    if (!this.functionUrl) {
      throw new Error("OCR Edge Function URL is missing");
    }

    const response = await fetch(this.functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: createTimeoutSignal(Number(this.config.timeoutMs ?? 15000)),
      body: JSON.stringify({
        providerId: this.getProviderVersion(),
        providerName: this.getProviderName(),
        imageDataUrl: input.imageDataUrl ?? "",
        supplierName: input.supplierName ?? "",
        templateProfile: input.templateProfile ?? {},
        qualityScore: Number(input.qualityScore ?? 0),
        rawText: String(input.rawText ?? "").trim(),
        documentId: input.documentId ?? "",
        tenantId: input.tenantId ?? ""
      })
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `OCR provider HTTP ${response.status}`);
    }

    return normalizeClovaResponse(payload, input);
  }
}

class EasyOcrCompareProvider {
  constructor(config = {}) {
    this.config = config;
    this.serviceUrl = String(
      config.serviceUrl
      ?? globalThis.__MEATOS_OCR__?.easyOcrServiceUrl
      ?? OCR_RUNTIME_CONFIG.easyOcrServiceUrl
    ).trim().replace(/\/+$/, "");
  }

  getProviderName() {
    return "EasyOCR Compare";
  }

  getProviderId() {
    return "easyocr-compare";
  }

  getProviderVersion() {
    return "easyocr@1.7.2";
  }

  async healthCheck() {
    const startedAt = Date.now();
    if (!this.serviceUrl) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "unconfigured",
        secretConnected: false,
        modelReady: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: "EasyOCR comparison service is not configured",
        errorCode: "UNCONFIGURED"
      };
    }
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        method: "GET",
        signal: createTimeoutSignal(3000)
      });
      const payload = await parseResponse(response);
      return {
        ok: response.ok && Boolean(payload.ok),
        providerName: payload.providerName ?? this.getProviderName(),
        providerVersion: payload.providerVersion ?? this.getProviderVersion(),
        mode: payload.mode ?? "python-local-service",
        secretConnected: false,
        modelReady: Boolean(payload.modelReady),
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: response.ok ? "EasyOCR comparison service is ready" : `EasyOCR service HTTP ${response.status}`
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "python-local-service",
        secretConnected: false,
        modelReady: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: error?.message ?? "EasyOCR comparison service is unavailable",
        errorCode: error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK"
      };
    }
  }

  async recognizeDocument(input = {}) {
    if (!this.serviceUrl) {
      throw new Error("EasyOCR comparison service is not configured.");
    }
    if (!input.imageDataUrl) {
      throw new Error("EasyOCR compare requires an image data URL.");
    }
    const cacheKey = createEasyOcrCacheKey(input);
    if (cacheKey && EASY_OCR_RESULT_CACHE.has(cacheKey)) {
      return structuredCloneSafe(EASY_OCR_RESULT_CACHE.get(cacheKey));
    }
    const response = await fetch(`${this.serviceUrl}/recognize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: createTimeoutSignal(Number(this.config.timeoutMs ?? 45000)),
      body: JSON.stringify({
        imageDataUrl: input.imageDataUrl,
        documentId: input.documentId ?? "",
        tenantId: input.tenantId ?? "",
        supplierName: input.supplierName ?? "",
        qualityScore: Number(input.qualityScore ?? 0)
        ,regions: Array.isArray(input.regions) ? input.regions : []
      })
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || `EasyOCR service HTTP ${response.status}`);
    }
    const normalized = normalizeEasyOcrResult(payload, input);
    if (cacheKey) {
      EASY_OCR_RESULT_CACHE.set(cacheKey, normalized);
      trimEasyOcrCache(20);
    }
    return normalized;
  }
}

class TesseractCompareProvider {
  constructor(config = {}) {
    this.config = config;
    this.workerPromise = null;
    this.workerPath = String(config.workerPath ?? globalThis.__MEATOS_OCR__?.tesseractWorkerPath ?? OCR_RUNTIME_CONFIG.tesseractWorkerPath).trim();
    this.corePath = String(config.corePath ?? globalThis.__MEATOS_OCR__?.tesseractCorePath ?? OCR_RUNTIME_CONFIG.tesseractCorePath).trim();
    this.langPath = String(config.langPath ?? globalThis.__MEATOS_OCR__?.tesseractLangPath ?? OCR_RUNTIME_CONFIG.tesseractLangPath).trim();
    this.languages = Array.isArray(config.languages) && config.languages.length
      ? config.languages.map((value) => String(value ?? "").trim()).filter(Boolean)
      : OCR_RUNTIME_CONFIG.tesseractLanguages;
    this.workerCacheKey = [this.workerPath, this.corePath, this.langPath, ...this.languages].join("|");
  }

  getProviderName() {
    return "Tesseract Compare";
  }

  getProviderId() {
    return "tesseract-compare";
  }

  getProviderVersion() {
    return "tesseract.js@7";
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await this.ensureWorker();
      return {
        ok: true,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "browser-sdk",
        secretConnected: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: "Tesseract compare engine is ready"
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.getProviderName(),
        providerVersion: this.getProviderVersion(),
        mode: "browser-sdk",
        secretConnected: false,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: error?.message ?? "Tesseract compare engine failed",
        errorCode: error?.code ?? "INIT_ERROR"
      };
    }
  }

  async recognizeDocument(input = {}) {
    const image = input.imageBlob ?? input.file ?? input.blob ?? input.image ?? null;
    if (!image) {
      throw new Error("Tesseract compare requires a File or Blob input.");
    }

    const startedAt = Date.now();
    const worker = await this.ensureWorker();
    const { data } = await worker.recognize(image);
    const rawText = String(data?.text ?? "").trim();
    const normalized = normalizeTesseractResult(data ?? {}, rawText, input);
    return {
      providerName: this.getProviderName(),
      providerVersion: this.getProviderVersion(),
      providerConfidence: normalized.providerConfidence,
      rawJson: {
        provider: "tesseract.js",
        languages: this.languages,
        workerPath: this.workerPath,
        corePath: this.corePath,
        langPath: this.langPath,
        result: data ?? {},
        elapsedMs: Date.now() - startedAt
      },
      ...normalized
    };
  }

  async ensureWorker() {
    if (!this.workerPromise) {
      this.workerPromise = TESSERACT_WORKER_CACHE.get(this.workerCacheKey);
      if (!this.workerPromise) {
        this.workerPromise = this.createWorker().catch((error) => {
          TESSERACT_WORKER_CACHE.delete(this.workerCacheKey);
          this.workerPromise = null;
          throw error;
        });
        TESSERACT_WORKER_CACHE.set(this.workerCacheKey, this.workerPromise);
      }
    }
    return this.workerPromise;
  }

  async createWorker() {
    if (!this.workerPath || !this.corePath || !this.langPath) {
      throw new Error("Tesseract compare paths are not configured.");
    }

    const mod = await import("/node_modules/tesseract.js/dist/tesseract.esm.min.js");
    const createWorker = mod.createWorker ?? mod.default?.createWorker ?? mod.default;
    if (typeof createWorker !== "function") {
      throw new Error("Tesseract worker factory was not found.");
    }

    const worker = await createWorker(this.languages.join("+"), 1, {
      workerPath: this.workerPath,
      corePath: this.corePath,
      langPath: this.langPath,
      cacheMethod: "readOnly",
      gzip: false,
      workerBlobURL: false,
      logger: () => {}
    });

    return worker;
  }
}

export function normalizeClovaResponse(payload, input = {}) {
  const clovaImage = Array.isArray(payload.images) ? payload.images[0] : null;
  const clovaItems = normalizeClovaFields(clovaImage?.fields ?? []);
  const clovaLines = collapseOcrItemsIntoLines(clovaItems);
  const clovaText = clovaLines.map((line) => line.text).filter(Boolean).join("\n");
  const parsedClova = clovaText ? parseRecognizedTextV2(clovaText, input) : null;
  const clovaConfidences = clovaItems.map((item) => Number(item.score ?? 0)).filter((value) => value > 0);
  const clovaConfidence = clovaConfidences.length
    ? Math.round(clovaConfidences.reduce((sum, value) => sum + value, 0) / clovaConfidences.length)
    : 0;
  const providerName = String(payload.providerName ?? payload.provider ?? "NAVER CLOVA OCR General");
  const providerVersion = String(payload.providerVersion ?? payload.providerId ?? "clova-general");
  const providerConfidence = clamp(Number(payload.providerConfidence ?? payload.confidence ?? clovaConfidence), 0, 100);
  const qualityScore = clamp(Number(payload.qualityScore ?? input.qualityScore ?? providerConfidence), 0, 100);
  const qualityGradeValue = String(payload.qualityGrade ?? qualityGradeFromScore(qualityScore));
  const recaptureReasonCodes = toStringArray(payload.recaptureReasonCodes ?? payload.recaptureReasons ?? []);
  const reconstructedText = String(payload.reconstructedText ?? payload.rawText ?? payload.text ?? clovaText).trim();
  const reconstructionBasis = toStringArray(payload.reconstructionBasis ?? payload.basis ?? []);
  const rawJson = payload.rawJson ?? payload.ocrRawJson ?? {
    ...payload,
    items: clovaItems,
    lines: clovaLines,
    image: {
      width: Number(clovaImage?.convertedImageInfo?.width ?? 0),
      height: Number(clovaImage?.convertedImageInfo?.height ?? 0)
    },
    tableStructure: reconstructOcrTable({ lines: clovaLines, rawText: clovaText })
  };
  const documentFields = normalizeDocumentFields(
    payload.documentFields ?? (payload.fields && !Array.isArray(payload.fields) ? payload.fields : parsedClova?.documentFields) ?? {}
  );
  const lineItems = normalizeLineItems(
    payload.lineItems ?? payload.items ?? payload.tables?.[0]?.rows ?? parsedClova?.lineItems ?? []
  );
  const parsedJson = payload.parsedJson ?? {
    documentFields,
    lineItems,
    validation: payload.validation ?? {},
    meatosScore: Number(payload.meatosScore ?? qualityScore)
  };

  return {
    providerName,
    providerVersion,
    providerConfidence,
    rawJson,
    documentFields,
    lineItems,
    parsedJson,
    qualityScore,
    qualityGrade: qualityGradeValue,
    recaptureRequired: Boolean(payload.recaptureRequired ?? (qualityScore < 70 || recaptureReasonCodes.length > 0)),
    recaptureReasonCodes,
    reconstructedText,
    reconstructionConfidence: clamp(Number(payload.reconstructionConfidence ?? 0), 0, 100),
    reconstructionBasis,
    status: String(payload.status ?? "REVIEW_REQUIRED"),
    meatosScore: clamp(Number(payload.meatosScore ?? qualityScore), 0, 100),
    validation: payload.validation ?? {
      totalMatched: Boolean(documentFields.totalAmount),
      lineCount: lineItems.length,
      calculationOk: true,
      issues: []
    }
  };
}

function normalizeClovaFields(fields = []) {
  return (Array.isArray(fields) ? fields : [])
    .map((field, index) => {
      const vertices = field?.boundingPoly?.vertices ?? field?.boundingPoly ?? [];
      const poly = normalizePoly(vertices);
      const rawConfidence = Number(field?.inferConfidence ?? field?.confidence ?? 0);
      return {
        index,
        text: String(field?.inferText ?? field?.text ?? "").trim(),
        score: clamp(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence, 0, 100),
        poly,
        bounds: polyBounds(poly)
      };
    })
    .filter((item) => item.text)
    .sort((a, b) => {
      if (Math.abs(a.bounds.centerY - b.bounds.centerY) > Math.max(12, Math.min(a.bounds.height, b.bounds.height) * 0.75)) {
        return a.bounds.centerY - b.bounds.centerY;
      }
      return a.bounds.minX - b.bounds.minX;
    });
}

function normalizeTesseractResult(data, rawText, input = {}) {
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const recognizedLines = lines.map((text, index) => ({
    rowNo: index + 1,
    text,
    score: clamp(Number(data.confidence ?? data.meanConfidence ?? 0), 0, 100),
    bounds: {
      minX: 0,
      minY: index * 20,
      maxX: 0,
      maxY: (index + 1) * 20,
      width: 0,
      height: 20,
      centerY: (index * 20) + 10
    }
  }));
  const parsed = parseRecognizedTextV2(rawText, input);
  const providerConfidence = clamp(Number(data.confidence ?? data.meanConfidence ?? 0), 0, 100);
  const qualityScore = clamp(Number(input.qualityScore ?? providerConfidence), 0, 100);
  const tableStructure = reconstructOcrTable({ lines: recognizedLines, rawText });
  const validation = validateOcrInvoiceData({ lineItems: parsed.lineItems, documentFields: parsed.documentFields });

  return {
    providerConfidence,
    rawJson: {
      provider: "tesseract.js",
      text: rawText,
      lines: recognizedLines,
      tableStructure,
      data
    },
    documentFields: parsed.documentFields,
    lineItems: parsed.lineItems.map((item, index) => ({
      rowNo: Number(item.rowNo ?? index + 1),
      rawProductName: String(item.rawProductName ?? "").trim(),
      rawSpecification: String(item.rawSpecification ?? "").trim(),
      rawQuantity: Number(item.rawQuantity ?? 0),
      rawUnit: String(item.rawUnit ?? "kg").trim(),
      rawUnitPrice: Number(item.rawUnitPrice ?? 0),
      rawAmount: Number(item.rawAmount ?? 0),
      rawOrigin: String(item.rawOrigin ?? "").trim(),
      rawGrade: String(item.rawGrade ?? "").trim(),
      normalizedProductName: String(item.normalizedProductName ?? item.rawProductName ?? "").trim(),
      specification: String(item.specification ?? item.rawSpecification ?? "").trim(),
      quantity: Number(item.quantity ?? item.rawQuantity ?? 0),
      unit: String(item.unit ?? item.rawUnit ?? "kg").trim(),
      unitPrice: Number(item.unitPrice ?? item.rawUnitPrice ?? 0),
      amount: Number(item.amount ?? item.rawAmount ?? 0),
      origin: String(item.origin ?? item.rawOrigin ?? "").trim(),
      grade: String(item.grade ?? item.rawGrade ?? "").trim(),
      storageType: String(item.storageType ?? "").trim(),
      dictionaryCandidateId: String(item.dictionaryCandidateId ?? "").trim(),
      productMasterId: String(item.productMasterId ?? "").trim(),
      confidence: clamp(Number(item.confidence ?? providerConfidence), 0, 100),
      reviewStatus: String(item.reviewStatus ?? "PENDING").trim()
    })),
    parsedJson: {
      documentFields: parsed.documentFields,
      lineItems: parsed.lineItems,
      validation,
      meatosScore: validation.meatosScore,
      recognizedText: rawText,
      tableStructure
    },
    qualityScore,
    qualityGrade: qualityGradeFromScore(qualityScore),
    recaptureRequired: Boolean(qualityScore < 70 || parsed.lineItems.length === 0),
    recaptureReasonCodes: parsed.lineItems.length ? [] : ["NO_LINE_ITEMS"],
    reconstructedText: rawText,
    reconstructionConfidence: providerConfidence,
    reconstructionBasis: ["TESSERACT_COMPARE", "LINE_GROUPING", "TABLE_STRUCTURE"],
    status: parsed.lineItems.length > 0 ? "REVIEW_REQUIRED" : "OCR_FAILED",
    meatosScore: validation.meatosScore,
    validation
  };
}

function normalizeEasyOcrResult(payload, input = {}) {
  const rawText = String(payload.rawText ?? "").trim();
  const recognizedLines = (Array.isArray(payload.lines) ? payload.lines : []).map((line, index) => ({
    rowNo: Number(line.rowNo ?? index + 1),
    text: String(line.text ?? "").trim(),
    score: clamp(Number(line.confidence ?? payload.providerConfidence ?? 0), 0, 100),
    bounds: line.bounds ?? { minX: 0, minY: index * 20, maxX: 0, maxY: (index + 1) * 20, width: 0, height: 20, centerY: (index * 20) + 10 }
  }));
  const parsed = parseRecognizedTextV2(rawText, input);
  const providerConfidence = clamp(Number(payload.providerConfidence ?? 0), 0, 100);
  const qualityScore = clamp(Number(input.qualityScore ?? providerConfidence), 0, 100);
  const tableStructure = reconstructOcrTable({ lines: recognizedLines, rawText });
  const selectiveLineItems = parseEasyOcrSelectiveLineItems(payload.regionResults, providerConfidence);
  const parsedLineItems = selectiveLineItems.length ? selectiveLineItems : parsed.lineItems;
  const lineItems = parsedLineItems.map((item, index) => normalizeLineItemV2({
    ...item,
    confidence: Number(item.confidence ?? providerConfidence)
  }, index));
  const validation = validateOcrInvoiceData({ lineItems, documentFields: parsed.documentFields });
  const recaptureReasonCodes = [];
  if (!rawText) recaptureReasonCodes.push("NO_TEXT");
  if (!lineItems.length) recaptureReasonCodes.push("NO_LINE_ITEMS");

  return {
    providerName: String(payload.providerName ?? "EasyOCR Compare"),
    providerVersion: String(payload.providerVersion ?? "easyocr@1.7.2"),
    providerConfidence,
    rawJson: {
      provider: "easyocr",
      items: payload.items ?? [],
      lines: recognizedLines,
      text: rawText,
      image: payload.image ?? {},
      processingMs: Number(payload.processingMs ?? 0),
      regionResults: payload.regionResults ?? [],
      selective: Boolean(payload.selective),
      tableStructure
    },
    documentFields: parsed.documentFields,
    lineItems,
    parsedJson: {
      documentFields: parsed.documentFields,
      lineItems,
      validation,
      meatosScore: validation.meatosScore,
      recognizedText: rawText,
      tableStructure
    },
    qualityScore,
    qualityGrade: qualityGradeFromScore(qualityScore),
    recaptureRequired: Boolean(qualityScore < 70 || !lineItems.length),
    recaptureReasonCodes,
    reconstructedText: rawText,
    reconstructionConfidence: providerConfidence,
    reconstructionBasis: ["EASYOCR_COMPARE", "OPENCV_ENHANCEMENT", "LINE_GROUPING", "TABLE_STRUCTURE"],
    status: lineItems.length ? "REVIEW_REQUIRED" : "OCR_FAILED",
    meatosScore: validation.meatosScore,
    validation
  };
}

function parseEasyOcrSelectiveLineItems(regionResults, providerConfidence) {
  return (Array.isArray(regionResults) ? regionResults : [])
    .map((region, index) => {
      const fields = Array.isArray(region.fields) ? region.fields : [];
      const description = String(fields.find((field) => field.fieldType === "description")?.text ?? "").trim();
      const quantityAndPrice = String(fields.find((field) => field.fieldType === "quantityAndPrice")?.text ?? "").trim();
      const quantityText = String(fields.find((field) => field.fieldType === "quantity")?.text ?? "").trim();
      const unitPriceText = String(fields.find((field) => field.fieldType === "unitPrice")?.text ?? "").trim();
      const unitText = String(fields.find((field) => field.fieldType === "unit")?.text ?? "").trim();
      const amountText = String(fields.find((field) => field.fieldType === "amount")?.text ?? "").trim();
      const quantityPriceNumbers = extractOcrNumbers(quantityAndPrice);
      const quantityNumbers = extractOcrNumbers(quantityText);
      const unitPriceNumbers = extractOcrNumbers(unitPriceText);
      const amountNumbers = extractOcrNumbers(amountText);
      const quantity = quantityNumbers.at(-1) ?? quantityPriceNumbers.at(-2);
      const unitPrice = unitPriceNumbers.at(-1) ?? quantityPriceNumbers.at(-1);
      if (!description) return null;
      const amount = amountNumbers.at(-1) ?? 0;
      return {
        rowNo: Number(region.sourceRowNo ?? index + 1),
        rawProductName: description,
        normalizedProductName: description,
        rawQuantity: Number(quantity ?? 0),
        quantity: Number(quantity ?? 0),
        rawUnit: /Box/i.test(unitText || region.text || "") ? "Box" : "kg",
        unit: /Box/i.test(unitText || region.text || "") ? "Box" : "kg",
        rawUnitPrice: Number(unitPrice ?? 0),
        unitPrice: Number(unitPrice ?? 0),
        rawAmount: amount,
        amount,
        confidence: clamp(Number(region.confidence ?? providerConfidence), 0, 100),
        reviewStatus: "PENDING"
      };
    })
    .filter(Boolean);
}

function extractOcrNumbers(value) {
  return (String(value ?? "").match(/\d[\d,.]*/g) ?? [])
    .map((token) => Number(token.replaceAll(",", "")))
    .filter((number) => Number.isFinite(number));
}

function normalizePaddleOcrResult(result, input = {}) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const normalizedItems = items
    .map((item, index) => ({
      index,
      text: String(item?.text ?? "").trim(),
      score: clamp(Number(item?.score ?? 0), 0, 100),
      poly: normalizePoly(item?.poly),
      bounds: polyBounds(item?.poly)
    }))
    .filter((item) => item.text);

  normalizedItems.sort((a, b) => {
    if (Math.abs(a.bounds.centerY - b.bounds.centerY) > Math.max(12, Math.min(a.bounds.height, b.bounds.height) * 0.75)) {
      return a.bounds.centerY - b.bounds.centerY;
    }
    return a.bounds.minX - b.bounds.minX;
  });

  const recognizedLines = collapseOcrItemsIntoLines(normalizedItems);
  const recognizedText = recognizedLines.map((line) => line.text).filter(Boolean).join("\n");
  const parsed = parseRecognizedTextV2(recognizedText, input);
  const providerConfidence = normalizedItems.length
    ? Math.round(normalizedItems.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / normalizedItems.length)
    : 0;
  const qualityScore = clamp(Number(input.qualityScore ?? providerConfidence), 0, 100);
  const qualityGradeValue = qualityGradeFromScore(qualityScore);
  const recaptureReasonCodes = [];
  if (!recognizedText) recaptureReasonCodes.push("NO_TEXT");
  if (!parsed.lineItems.length) recaptureReasonCodes.push("NO_LINE_ITEMS");
  const validation = validateOcrInvoiceData({ lineItems: parsed.lineItems, documentFields: parsed.documentFields });
  const meatosScore = validation.meatosScore;
  const tableStructure = reconstructOcrTable({ lines: recognizedLines, rawText: recognizedText });

  return {
    providerConfidence,
    rawJson: {
      provider: "paddleocr-js",
      items: normalizedItems,
      lines: recognizedLines,
      text: recognizedText,
      image: result?.image ?? {},
      metrics: result?.metrics ?? {},
      runtime: result?.runtime ?? {},
      tableStructure
    },
    documentFields: parsed.documentFields,
    lineItems: parsed.lineItems.map((item, index) => ({
      rowNo: Number(item.rowNo ?? index + 1),
      rawProductName: String(item.rawProductName ?? "").trim(),
      rawSpecification: String(item.rawSpecification ?? "").trim(),
      rawQuantity: Number(item.rawQuantity ?? 0),
      rawUnit: String(item.rawUnit ?? "kg").trim(),
      rawUnitPrice: Number(item.rawUnitPrice ?? 0),
      rawAmount: Number(item.rawAmount ?? 0),
      rawOrigin: String(item.rawOrigin ?? "").trim(),
      rawGrade: String(item.rawGrade ?? "").trim(),
      normalizedProductName: String(item.normalizedProductName ?? item.rawProductName ?? "").trim(),
      specification: String(item.specification ?? item.rawSpecification ?? "").trim(),
      quantity: Number(item.quantity ?? item.rawQuantity ?? 0),
      unit: String(item.unit ?? item.rawUnit ?? "kg").trim(),
      unitPrice: Number(item.unitPrice ?? item.rawUnitPrice ?? 0),
      amount: Number(item.amount ?? item.rawAmount ?? 0),
      origin: String(item.origin ?? item.rawOrigin ?? "").trim(),
      grade: String(item.grade ?? item.rawGrade ?? "").trim(),
      storageType: String(item.storageType ?? "").trim(),
      dictionaryCandidateId: String(item.dictionaryCandidateId ?? "").trim(),
      productMasterId: String(item.productMasterId ?? "").trim(),
      confidence: clamp(Number(item.confidence ?? providerConfidence), 0, 100),
      reviewStatus: String(item.reviewStatus ?? "PENDING").trim()
    })),
    parsedJson: {
      documentFields: parsed.documentFields,
      lineItems: parsed.lineItems,
      validation,
      meatosScore,
      recognizedText
    },
    qualityScore,
    qualityGrade: qualityGradeValue,
    recaptureRequired: Boolean(qualityScore < 70 || parsed.lineItems.length === 0),
    recaptureReasonCodes,
    reconstructedText: recognizedText,
    reconstructionConfidence: providerConfidence,
    reconstructionBasis: ["PADDLE_OCR", "LINE_GROUPING", "TEXT_PARSER"],
    status: parsed.lineItems.length > 0 && meatosScore >= 95 ? "APPROVED" : "REVIEW_REQUIRED",
    meatosScore,
    validation
  };
}

function parseRecognizedTextV2(rawText, context = {}) {
  const normalizedText = String(rawText ?? "").normalize("NFKC");
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => normalizeUnicodeWhitespace(line))
    .filter(Boolean);
  const filteredLines = lines.filter((line) => !isNoiseLineV2(line));

  const supplierName = normalizeUnicodeWhitespace(context.supplierName ?? "")
    || extractSupplierNameV2(lines)
    || "";
  const supplierBusinessNo = extractBusinessNoV2(normalizedText);
  const invoiceNo = extractInvoiceNoV2(normalizedText);
  const invoiceDate = extractDateV2(normalizedText);
  const supplyAmount = extractAmountByLabelV2(normalizedText, [
    "공급가액",
    "공급가",
    "합계금액",
    "청구금액"
  ]);
  const taxAmount = extractAmountByLabelV2(normalizedText, [
    "세액",
    "부가세",
    "부가세액"
  ]);
  const totalAmount = extractAmountByLabelV2(normalizedText, [
    "합계",
    "최종미수금액",
    "총액",
    "청구합계"
  ]);

  let lineItems = filteredLines
    .map((line, index) => parseLineItemV2(line, index))
    .filter(Boolean);

  if (!lineItems.length) {
    lineItems = fallbackParseLineItemsV2(filteredLines);
  }
  lineItems = attachTraceEvidenceToLineItems(lineItems, filteredLines);

  const normalizedFields = {
    supplierName,
    supplierBusinessNo,
    invoiceNo,
    invoiceDate,
    supplyAmount: supplyAmount || lineItems.reduce((sum, item) => sum + Number(item.rawAmount ?? 0), 0),
    taxAmount: taxAmount || 0,
    totalAmount: totalAmount || 0,
    livestockTraceNo: extractLivestockTraceNoV2(normalizedText),
    livestockTraceNos: extractLivestockTraceNosV2(normalizedText),
    slaughterCertificateReference: extractSlaughterCertificateReferenceV2(normalizedText)
  };
  if (!normalizedFields.totalAmount) {
    normalizedFields.totalAmount = Number(normalizedFields.supplyAmount || 0) + Number(normalizedFields.taxAmount || 0);
  }

  const validation = buildValidation(lineItems, normalizedFields);
  const meatosScore = computeMeatosScore({
    textScore: supplierName ? 90 : 64,
    tableScore: Math.min(100, 62 + lineItems.length * 6),
    calculationScore: validation.calculationOk ? 100 : 40,
    dictionaryScore: Math.min(100, 60 + lineItems.length * 5),
    supplierAliasScore: supplierName ? 88 : 52
  });

  return {
    documentFields: normalizedFields,
    lineItems: lineItems.map((item, index) => normalizeLineItemV2(item, index)),
    validation,
    meatosScore
  };
}

function attachTraceEvidenceToLineItems(lineItems = [], lines = []) {
  return lineItems.map((item, index) => {
    const currentLineIndex = Math.max(0, Number(item.rowNo ?? index + 1) - 1);
    const nextLineIndex = index + 1 < lineItems.length
      ? Math.max(currentLineIndex + 1, Number(lineItems[index + 1].rowNo ?? lines.length + 1) - 1)
      : lines.length;
    const evidenceText = lines.slice(currentLineIndex, nextLineIndex).join(" ");
    const domesticTrace = (evidenceText.match(/\bL\s*\d{12,15}\b/i)?.[0] ?? "").replace(/\s+/g, "").toUpperCase();
    const importTrace = domesticTrace
      ? ""
      : (evidenceText.match(/(?:이력번호\s*[:：]?\s*)?(\d{12})\b/i)?.[1] ?? "");
    const blNumber = evidenceText.match(/B\s*\/\s*L\s*[:：]?\s*([A-Z0-9-]{8,})/i)?.[1] ?? "";
    return {
      ...item,
      livestockTraceNo: domesticTrace,
      importTraceNo: importTrace,
      traceNumber: domesticTrace || importTrace,
      blNumber
    };
  });
}

function fallbackParseLineItemsV2(lines = []) {
  const compactLines = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const candidates = [];
  for (const line of compactLines) {
    const item = parseLineItemV2(line, candidates.length);
    if (item) candidates.push(item);
  }
  return candidates;
}

function normalizeLineItemV2(item, index) {
  return {
    rowNo: Number(item.rowNo ?? index + 1),
    rawProductName: String(item.rawProductName ?? "").trim(),
    rawSpecification: String(item.rawSpecification ?? "").trim(),
    rawQuantity: Number(item.rawQuantity ?? 0),
    rawUnit: String(item.rawUnit ?? "kg").trim(),
    rawUnitPrice: Number(item.rawUnitPrice ?? 0),
    rawAmount: Number(item.rawAmount ?? 0),
    rawOrigin: String(item.rawOrigin ?? "").trim(),
    rawGrade: String(item.rawGrade ?? "").trim(),
    normalizedProductName: String(item.normalizedProductName ?? item.rawProductName ?? "").trim(),
    specification: String(item.specification ?? item.rawSpecification ?? "").trim(),
    quantity: Number(item.quantity ?? item.rawQuantity ?? 0),
    unit: String(item.unit ?? item.rawUnit ?? "kg").trim(),
    unitPrice: Number(item.unitPrice ?? item.rawUnitPrice ?? 0),
    amount: Number(item.amount ?? item.rawAmount ?? 0),
    origin: String(item.origin ?? item.rawOrigin ?? "").trim(),
    grade: String(item.grade ?? item.rawGrade ?? "").trim(),
    storageType: String(item.storageType ?? "").trim(),
    livestockTraceNo: String(item.livestockTraceNo ?? "").trim(),
    importTraceNo: String(item.importTraceNo ?? "").trim(),
    traceNumber: String(item.traceNumber ?? item.livestockTraceNo ?? item.importTraceNo ?? "").trim(),
    blNumber: String(item.blNumber ?? "").trim(),
    dictionaryCandidateId: String(item.dictionaryCandidateId ?? "").trim(),
    productMasterId: String(item.productMasterId ?? "").trim(),
    confidence: clamp(Number(item.confidence ?? 0), 0, 100),
    reviewStatus: String(item.reviewStatus ?? "PENDING").trim()
  };
}

function parseLineItemV2(line, index) {
  const cleaned = normalizeUnicodeWhitespace(line);
  if (!cleaned || isNoiseLineV2(cleaned)) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;

  const numericIndexes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (isNumericToken(tokens[i])) numericIndexes.push(i);
  }
  if (numericIndexes.length < 3) return null;

  const amountIndex = numericIndexes[numericIndexes.length - 1];
  const unitPriceIndex = numericIndexes[numericIndexes.length - 2];
  const quantityIndex = numericIndexes[numericIndexes.length - 3];
  const rawAmount = parseMoney(tokens[amountIndex]);
  const rawUnitPrice = parseMoney(tokens[unitPriceIndex]);
  const rawQuantity = Number(parseFloat(tokens[quantityIndex].replace(/,/g, "")));
  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) return null;

  const nameTokens = tokens.slice(0, quantityIndex);
  if (!nameTokens.length) return null;

  const trailingUnitTokens = tokens.slice(quantityIndex + 1, unitPriceIndex);
  const rawUnit = trailingUnitTokens.find((token) => isUnitToken(token)) || "kg";
  const rawSpecification = trailingUnitTokens.find((token) => isNumericToken(token)) || "";
  const rawProductName = nameTokens.join(" ").trim();
  const normalizedProductName = normalizeProductNameV2(rawProductName);
  const rawOrigin = extractOriginV2(cleaned);
  const rawGrade = extractGradeV2(cleaned);
  const storageType = extractStorageTypeV2(rawProductName, cleaned);

  return {
    rowNo: index + 1,
    rawProductName,
    rawSpecification,
    rawQuantity,
    rawUnit,
    rawUnitPrice,
    rawAmount,
    rawOrigin,
    rawGrade,
    normalizedProductName,
    specification: rawSpecification,
    quantity: rawQuantity,
    unit: rawUnit,
    unitPrice: rawUnitPrice,
    amount: rawAmount,
    origin: rawOrigin,
    grade: rawGrade,
    storageType,
    dictionaryCandidateId: "",
    productMasterId: "",
    confidence: 88,
    reviewStatus: "PENDING"
  };
}

function normalizeProductNameV2(value) {
  return normalizeUnicodeWhitespace(value)
    .replace(/\b(?:\d+\+{0,2}|\d급|1등급|2등급|3등급)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSupplierNameV2(lines = []) {
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, "");
    const match = normalized.match(/(?:상호|업체명|공급사|거래처명)[:：]?(?<name>.+?)(?=(?:대표|주소|전화|팩스|업태|종목|등록번호|$))/);
    if (match?.groups?.name) {
      return normalizeUnicodeWhitespace(match.groups.name);
    }
  }
  const fallback = lines.find((line) => /(?:상호|공급사|업체명)/.test(line));
  return normalizeUnicodeWhitespace(fallback ?? "");
}

function extractBusinessNoV2(text) {
  const value = String(text ?? "").match(/\b\d{3}-\d{2}-\d{5}\b/);
  return value ? value[0] : "";
}

function extractInvoiceNoV2(text) {
  const compact = normalizeUnicodeWhitespace(text).replace(/\s+/g, " ");
  const match = compact.match(/(?:출고번호|전표번호|거래명세서번호|문서번호|세금계산서번호)[:：]?\s*([A-Z0-9-]+)/i);
  if (match?.[1]) return String(match[1]).trim();
  const fallback = compact.match(/\b[A-Z]{1,4}-?\d{3,}\b/i);
  return fallback ? fallback[0] : "";
}

function extractDateV2(text) {
  const compact = normalizeUnicodeWhitespace(text).replace(/\s+/g, " ");
  const ymdMatch = compact.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, "0")}-${String(ymdMatch[3]).padStart(2, "0")}`;
  }
  const labeled = compact.match(/(?:거래일자|작성일|출고일|전표일)[:：]?\s*(\d{4})\s*년?\s*(\d{1,2})\s*월?\s*(\d{1,2})\s*일?/);
  if (labeled) {
    return `${labeled[1]}-${String(labeled[2]).padStart(2, "0")}-${String(labeled[3]).padStart(2, "0")}`;
  }
  return "";
}

function extractAmountByLabelV2(text, labels = []) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => normalizeUnicodeWhitespace(line)).filter(Boolean);
  const compactLines = lines.map((line) => line.replace(/\s+/g, ""));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const compactLine = compactLines[index];
    for (const label of labels) {
      const compactLabel = normalizeUnicodeWhitespace(label).replace(/\s+/g, "");
      if (!compactLine.includes(compactLabel)) continue;
      const after = compactLine.slice(compactLine.indexOf(compactLabel) + compactLabel.length);
      const amountMatch = after.match(/(\d[\d,]*)/);
      if (amountMatch?.[1]) {
        return parseMoney(amountMatch[1]);
      }
      const labelMatch = line.match(new RegExp(`${escapeRegExp(label)}\\s*[:：]?\\s*([\\d,]+)`));
      if (labelMatch?.[1]) return parseMoney(labelMatch[1]);
    }
  }
  return 0;
}

function extractLivestockTraceNoV2(text) {
  return extractLivestockTraceNosV2(text)[0] ?? "";
}

function extractLivestockTraceNosV2(text) {
  const values = [];
  const pattern = /(?:이력번호|개체식별번호|대장번호)[:：]?\s*([A-Z]?\d(?:[\s-]?\d){11,14})/gi;
  for (const match of String(text ?? "").matchAll(pattern)) {
    const value = String(match[1] ?? "").replace(/[\s-]/g, "").toUpperCase();
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function extractSlaughterCertificateReferenceV2(text) {
  const match = String(text ?? "").match(/(?:도축증명서|도축확인서|도체번호|검사증명서)[:：]?\s*([A-Z0-9-]+)/i);
  return match?.[1] ? String(match[1]).trim() : "";
}

function extractOriginV2(text) {
  const value = normalizeUnicodeWhitespace(text);
  if (/\b국내산\b/.test(value)) return "국내산";
  if (/\b미국산\b/.test(value) || /\b미국\b/.test(value)) return "미국산";
  if (/\b호주산\b/.test(value) || /\b호주\b/.test(value)) return "호주산";
  if (/\b칠레산\b/.test(value) || /\b칠레\b/.test(value)) return "칠레산";
  if (/\b뉴질랜드\b/.test(value)) return "뉴질랜드산";
  if (/\b수입산\b/.test(value)) return "수입산";
  return "";
}

function extractGradeV2(text) {
  const value = normalizeUnicodeWhitespace(text).toUpperCase();
  const match = value.match(/\b(?:1\+\+|1\+|1급|1|2|3|A\+|A|B|C|PR|CAB|S|GF|SBA|AAA)\b/);
  return match?.[0] ? String(match[0]).trim() : "";
}

function extractStorageTypeV2(productName, text) {
  const value = `${normalizeUnicodeWhitespace(productName)} ${normalizeUnicodeWhitespace(text)}`;
  if (/\b냉동\b/.test(value)) return "frozen";
  if (/\b냉장\b/.test(value)) return "fresh";
  return "";
}

function isNoiseLineV2(line) {
  const normalized = normalizeUnicodeWhitespace(line);
  if (!normalized) return true;
  if (/^(?:합계|과세|면세|청구액|공급받는인수자|공급하는담당사원)/.test(normalized.replace(/\s+/g, ""))) {
    return true;
  }
  return /(?:거래명세서|출고번호|페이지|등록번호|전화|팩스|주소|업태|종목|현미수총액|최종미수금액|프로그램개발문의)/.test(normalized);
}

function normalizeUnicodeWhitespace(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function isNumericToken(token) {
  return /^\d[\d,]*(?:\.\d+)?$/.test(String(token ?? "").trim());
}

function isUnitToken(token) {
  return /^(?:Box|BOX|box|kg|KG|g|G|ea|EA|개|팩|봉|근|마리|set|SET)$/i.test(String(token ?? "").trim());
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRecognizedText(rawText, context = {}) {
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const filteredLines = lines.filter((line) => !isNoiseLine(line));
  const supplierName = normalizeWhitespace(context.supplierName ?? "") || extractSupplierName(lines) || "";
  const supplierBusinessNo = extractBusinessNo(rawText);
  const invoiceNo = extractInvoiceNo(rawText);
  const invoiceDate = extractDate(rawText);

  const lineItems = filteredLines
    .map((line, index) => parseLineItem(line, index))
    .filter(Boolean);

  if (!lineItems.length) {
    const fallback = parseMockProviderText(filteredLines.join("\n"), supplierName);
    return {
      documentFields: {
        ...fallback.documentFields,
        supplierName: fallback.documentFields.supplierName || supplierName,
        supplierBusinessNo: fallback.documentFields.supplierBusinessNo || supplierBusinessNo,
        invoiceNo: fallback.documentFields.invoiceNo || invoiceNo,
        invoiceDate: fallback.documentFields.invoiceDate || invoiceDate
      },
      lineItems: fallback.lineItems,
      validation: fallback.validation,
      meatosScore: fallback.meatosScore
    };
  }

  const lineAmountSum = lineItems.reduce((sum, item) => sum + Number(item.rawAmount ?? item.amount ?? 0), 0);
  const supplyAmount = extractAmountByLabel(rawText, ["공급가액", "과세", "합계금액", "청구액", "청구금액"]) || lineAmountSum;
  const taxAmount = extractAmountByLabel(rawText, ["세액"]) || Math.max(0, Math.round((supplyAmount || lineAmountSum) * 0.1));
  const totalAmount = extractAmountByLabel(rawText, ["청구액", "최종미수금액", "총액", "합계"]) || supplyAmount + taxAmount;

  const validation = buildValidation(lineItems, {
    supplierName,
    supplierBusinessNo,
    invoiceNo,
    invoiceDate,
    supplyAmount,
    taxAmount,
    totalAmount
  });
  const meatosScore = computeMeatosScore({
    textScore: supplierName ? 90 : 60,
    tableScore: Math.min(100, 65 + lineItems.length * 5),
    calculationScore: validation.calculationOk ? 100 : 40,
    dictionaryScore: Math.min(100, 60 + lineItems.length * 6),
    supplierAliasScore: supplierName ? 90 : 50
  });

  return {
    documentFields: {
      supplierName,
      supplierBusinessNo,
      invoiceNo,
      invoiceDate,
      supplyAmount,
      taxAmount,
      totalAmount,
      livestockTraceNo: extractLivestockTraceNo(rawText),
      slaughterCertificateReference: extractSlaughterCertificateReference(rawText)
    },
    lineItems,
    validation,
    meatosScore
  };
}

function parseLineItem(line, index) {
  const cleaned = normalizeWhitespace(line);
  if (!cleaned) return null;
  if (isNoiseLine(cleaned)) return null;

  const pattern = /^(?<name>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s*(?<unit>Box|BOX|box|kg|KG|g|G|개|EA|박스)?\s+(?<spec>\d+(?:\.\d+)?)\s+(?<unitPrice>[\d,]+)\s+(?<amount>[\d,]+)$/;
  const match = cleaned.match(pattern);
  if (!match?.groups) return null;

  const quantity = Number(match.groups.quantity);
  const unitPrice = parseMoney(match.groups.unitPrice);
  const amount = parseMoney(match.groups.amount);
  const rawProductName = normalizeWhitespace(match.groups.name);
  const rawSpecification = normalizeWhitespace(match.groups.spec);
  const unit = normalizeWhitespace(match.groups.unit || "kg");

  return {
    rowNo: index + 1,
    rawProductName,
    rawSpecification,
    rawQuantity: quantity,
    rawUnit: unit,
    rawUnitPrice: unitPrice,
    rawAmount: amount,
    rawOrigin: extractOrigin(cleaned),
    rawGrade: extractGrade(cleaned),
    normalizedProductName: rawProductName,
    specification: rawSpecification,
    quantity,
    unit,
    unitPrice,
    amount,
    origin: extractOrigin(cleaned),
    grade: extractGrade(cleaned),
    storageType: extractStorageType(rawProductName, cleaned),
    dictionaryCandidateId: "",
    productMasterId: "",
    confidence: 88,
    reviewStatus: "PENDING"
  };
}

function buildValidation(lineItems, documentFields = {}) {
  const issues = [];
  const lineErrors = lineItems.filter((item) => Math.round(Number(item.quantity ?? item.rawQuantity ?? 0) * Number(item.unitPrice ?? item.rawUnitPrice ?? 0)) !== Math.round(Number(item.amount ?? item.rawAmount ?? 0)));
  if (lineErrors.length) issues.push("LINE_ITEM_AMOUNT_MISMATCH");

  const lineSum = lineItems.reduce((sum, item) => sum + Number(item.amount ?? item.rawAmount ?? 0), 0);
  const supplyAmount = Number(documentFields.supplyAmount ?? 0);
  const taxAmount = Number(documentFields.taxAmount ?? 0);
  const totalAmount = Number(documentFields.totalAmount ?? 0);

  if (supplyAmount > 0 && lineSum > 0 && Math.round(lineSum) !== Math.round(supplyAmount)) {
    issues.push("SUPPLY_AMOUNT_MISMATCH");
  }
  if (totalAmount > 0 && supplyAmount > 0 && taxAmount >= 0 && Math.round(supplyAmount + taxAmount) !== Math.round(totalAmount)) {
    issues.push("TOTAL_AMOUNT_MISMATCH");
  }

  return {
    totalMatched: supplyAmount > 0 || totalAmount > 0,
    lineCount: lineItems.length,
    calculationOk: issues.length === 0,
    issues
  };
}

function collapseOcrItemsIntoLines(items) {
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.bounds.centerY - b.bounds.centerY) > Math.max(12, Math.min(a.bounds.height, b.bounds.height) * 0.75)) {
      return a.bounds.centerY - b.bounds.centerY;
    }
    return a.bounds.minX - b.bounds.minX;
  });

  const lines = [];
  let current = null;
  const threshold = Math.max(12, median(sorted.map((item) => item.bounds.height).filter(Boolean)) * 0.75 || 16);

  for (const item of sorted) {
    if (!current) {
      current = createLineBucket(item);
      lines.push(current);
      continue;
    }

    if (Math.abs(item.bounds.centerY - current.centerY) <= threshold) {
      current.items.push(item);
      current.centerY = average(current.items.map((entry) => entry.bounds.centerY));
      current.minX = Math.min(current.minX, item.bounds.minX);
      current.minY = Math.min(current.minY, item.bounds.minY);
      current.maxX = Math.max(current.maxX, item.bounds.maxX);
      current.maxY = Math.max(current.maxY, item.bounds.maxY);
      current.text = current.items
        .sort((left, right) => left.bounds.minX - right.bounds.minX)
        .map((entry) => entry.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      current.score = average(current.items.map((entry) => entry.score));
    } else {
      current = createLineBucket(item);
      lines.push(current);
    }
  }

  return lines.map((line, index) => ({
    rowNo: index + 1,
    text: line.text,
    score: Math.round(line.score),
    bounds: {
      minX: Math.round(line.minX),
      minY: Math.round(line.minY),
      maxX: Math.round(line.maxX),
      maxY: Math.round(line.maxY),
      width: Math.round(line.maxX - line.minX),
      height: Math.round(line.maxY - line.minY),
      centerY: Math.round(line.centerY)
    }
  }));
}

function createLineBucket(item) {
  return {
    items: [item],
    text: item.text,
    score: Number(item.score ?? 0),
    minX: item.bounds.minX,
    minY: item.bounds.minY,
    maxX: item.bounds.maxX,
    maxY: item.bounds.maxY,
    centerY: item.bounds.centerY
  };
}

function normalizePoly(poly) {
  if (!Array.isArray(poly)) return [];
  return poly.map((point) => {
    if (Array.isArray(point) && point.length >= 2) {
      return [Number(point[0] ?? 0), Number(point[1] ?? 0)];
    }
    if (point && typeof point === "object") {
      return [Number(point.x ?? 0), Number(point.y ?? 0)];
    }
    return [0, 0];
  });
}

function polyBounds(poly) {
  const points = normalizePoly(poly);
  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerY: minY + ((maxY - minY) / 2)
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function requestWithRetry(url, attempts, init) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || index === attempts - 1) {
        return response;
      }
      lastError = new Error(`OCR provider HTTP ${response.status}`);
      await delay(250);
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await delay(250);
      }
    }
  }
  throw lastError ?? new Error("OCR provider request failed");
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function createEasyOcrCacheKey(input = {}) {
  const imageHash = String(input.imageHash ?? "").trim();
  if (!imageHash) return "";
  const regions = (Array.isArray(input.regions) ? input.regions : []).map((region) => ({
    regionId: region.regionId,
    sourceRowNo: region.sourceRowNo,
    bounds: region.bounds
  }));
  return `${imageHash}:${JSON.stringify(regions)}`;
}

function trimEasyOcrCache(maxEntries) {
  while (EASY_OCR_RESULT_CACHE.size > maxEntries) {
    const oldestKey = EASY_OCR_RESULT_CACHE.keys().next().value;
    EASY_OCR_RESULT_CACHE.delete(oldestKey);
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMockProviderText(rawText, supplierName) {
  const lines = String(rawText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lineItems = lines.slice(1).map((line, index) => {
    const tokens = line.split(/\s+/);
    const rawProductName = tokens[0] ?? `ITEM-${index + 1}`;
    const quantity = Number(tokens.find((token) => /^\d+(\.\d+)?$/.test(token)) ?? 1);
    const unitPrice = Number([...tokens].reverse().find((token) => /^\d+(\.\d+)?$/.test(token)) ?? 0);
    return {
      rowNo: index + 1,
      rawProductName,
      normalizedProductName: rawProductName,
      rawSpecification: "",
      specification: "",
      rawQuantity: quantity,
      quantity,
      rawUnit: "kg",
      unit: "kg",
      rawUnitPrice: unitPrice,
      unitPrice,
      rawAmount: quantity * unitPrice,
      amount: quantity * unitPrice,
      rawOrigin: "",
      origin: "",
      rawGrade: "",
      grade: "",
      confidence: 78,
      reviewStatus: "PENDING"
    };
  });

  const total = lineItems.reduce((sum, item) => sum + Number(item.rawAmount ?? 0), 0);
  return {
    documentFields: {
      supplierName: supplierName || lines[0] || "",
      supplierBusinessNo: "",
      invoiceNo: "",
      invoiceDate: "",
      supplyAmount: total,
      taxAmount: Math.round(total * 0.1),
      totalAmount: Math.round(total * 1.1),
      livestockTraceNo: "",
      slaughterCertificateReference: ""
    },
    lineItems,
    validation: {
      totalMatched: total > 0,
      lineCount: lineItems.length,
      calculationOk: true,
      issues: []
    },
    meatosScore: Math.min(95, Math.max(60, 70 + lineItems.length * 3)),
    reconstructedText: rawText,
    reconstructionConfidence: 0,
    reconstructionBasis: []
  };
}

function normalizeDocumentFields(fields) {
  return {
    supplierName: String(fields.supplierName ?? fields.vendorName ?? "").trim(),
    supplierBusinessNo: String(fields.supplierBusinessNo ?? fields.businessNo ?? "").trim(),
    invoiceNo: String(fields.invoiceNo ?? fields.documentNo ?? "").trim(),
    invoiceDate: String(fields.invoiceDate ?? fields.date ?? "").trim(),
    supplyAmount: Number(fields.supplyAmount ?? fields.subtotal ?? 0),
    taxAmount: Number(fields.taxAmount ?? fields.vat ?? 0),
    totalAmount: Number(fields.totalAmount ?? fields.total ?? 0),
    livestockTraceNo: String(fields.livestockTraceNo ?? "").trim(),
    livestockTraceNos: Array.isArray(fields.livestockTraceNos)
      ? fields.livestockTraceNos.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    slaughterCertificateReference: String(fields.slaughterCertificateReference ?? "").trim()
  };
}

function normalizeLineItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    rowNo: Number(item.rowNo ?? index + 1),
    rawProductName: String(item.rawProductName ?? item.productName ?? "").trim(),
    rawSpecification: String(item.rawSpecification ?? item.specification ?? "").trim(),
    rawQuantity: Number(item.rawQuantity ?? item.quantity ?? 0),
    rawUnit: String(item.rawUnit ?? item.unit ?? "kg").trim(),
    rawUnitPrice: Number(item.rawUnitPrice ?? item.unitPrice ?? 0),
    rawAmount: Number(item.rawAmount ?? item.amount ?? 0),
    rawOrigin: String(item.rawOrigin ?? item.origin ?? "").trim(),
    rawGrade: String(item.rawGrade ?? item.grade ?? "").trim(),
    normalizedProductName: String(item.normalizedProductName ?? item.rawProductName ?? "").trim(),
    specification: String(item.specification ?? item.rawSpecification ?? "").trim(),
    quantity: Number(item.quantity ?? item.rawQuantity ?? 0),
    unit: String(item.unit ?? item.rawUnit ?? "kg").trim(),
    unitPrice: Number(item.unitPrice ?? item.rawUnitPrice ?? 0),
    amount: Number(item.amount ?? item.rawAmount ?? 0),
    origin: String(item.origin ?? item.rawOrigin ?? "").trim(),
    grade: String(item.grade ?? item.rawGrade ?? "").trim(),
    storageType: String(item.storageType ?? "").trim(),
    livestockTraceNo: String(item.livestockTraceNo ?? "").trim(),
    importTraceNo: String(item.importTraceNo ?? "").trim(),
    traceNumber: String(item.traceNumber ?? item.livestockTraceNo ?? item.importTraceNo ?? "").trim(),
    blNumber: String(item.blNumber ?? "").trim(),
    dictionaryCandidateId: String(item.dictionaryCandidateId ?? "").trim(),
    productMasterId: String(item.productMasterId ?? "").trim(),
    confidence: clamp(Number(item.confidence ?? 0), 0, 100),
    reviewStatus: String(item.reviewStatus ?? "PENDING").trim()
  }));
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const normalized = String(value ?? "").trim();
  return normalized ? [normalized] : [];
}

function analyzeTableStructure(lines = []) {
  const rowCount = Array.isArray(lines) ? lines.length : 0;
  const textLengths = lines.map((line) => String(line.text ?? "").length);
  const avgLength = textLengths.length ? Math.round(textLengths.reduce((sum, value) => sum + value, 0) / textLengths.length) : 0;
  return {
    rowCount,
    columnHints: rowCount ? ["상품명", "수량", "단가", "금액"] : [],
    rowBands: lines.map((line) => ({
      rowNo: line.rowNo,
      centerY: line.bounds?.centerY ?? 0,
      minX: line.bounds?.minX ?? 0,
      maxX: line.bounds?.maxX ?? 0
    })),
    averageTextLength: avgLength
  };
}

function extractSupplierName(lines) {
  for (const line of lines) {
    const match = line.match(/(?:상호|공급받는자|공급하는자)\s*[:：]?\s*(.+?)(?:\s+(?:대표|주소|등록번호|전화|팩스|업태|종목)|$)/);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  const candidates = lines.filter((line) => /[가-힣]/.test(line) && !/거래명세서|출고번호|등록번호|페이지|합계/.test(line));
  return normalizeWhitespace(candidates[0] ?? "");
}

function extractBusinessNo(text) {
  const value = String(text ?? "").match(/\d{3}-\d{2}-\d{5}/);
  return value ? value[0] : "";
}

function extractInvoiceNo(text) {
  const lineMatch = String(text ?? "").match(/출고번호\s*([A-Z0-9-]+)/i);
  if (lineMatch?.[1]) return lineMatch[1];
  const value = String(text ?? "").match(/[A-Z]{2,}-?\d{3,}/i);
  return value ? value[0] : "";
}

function extractDate(text) {
  const textValue = String(text ?? "");
  const ymdMatch = textValue.match(/(\d{4})\s*[년.-]\s*(\d{1,2})\s*[월.-]\s*(\d{1,2})\s*[일]?/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = String(ymdMatch[2]).padStart(2, "0");
    const day = String(ymdMatch[3]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const isoMatch = textValue.match(/\d{4}[.-]\d{2}[.-]\d{2}/);
  return isoMatch ? isoMatch[0].replaceAll(".", "-") : "";
}

function extractAmountByLabel(text, labels = []) {
  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    for (const label of labels) {
      if (!line.includes(label)) continue;
      const after = line.slice(line.indexOf(label) + label.length);
      const amountMatch = after.match(/([\d,]+)/);
      if (amountMatch?.[1]) {
        return parseMoney(amountMatch[1]);
      }
    }
  }
  return 0;
}

function extractLivestockTraceNo(text) {
  const value = String(text ?? "").match(/(?:이력번호|개체식별번호)\s*[:：]?\s*([A-Z0-9-]+)/i);
  return value?.[1] ? String(value[1]).trim() : "";
}

function extractSlaughterCertificateReference(text) {
  const value = String(text ?? "").match(/(?:도축증명서|도체증명서)\s*[:：]?\s*([A-Z0-9-]+)/i);
  return value?.[1] ? String(value[1]).trim() : "";
}

function extractOrigin(text) {
  const value = String(text ?? "");
  if (/(국내산|국내산')/.test(value)) return "국내산";
  if (/미국산|미국/.test(value)) return "미국산";
  if (/호주산|호주/.test(value)) return "호주산";
  if (/칠레산|칠래/.test(value)) return "칠레산";
  return "";
}

function extractGrade(text) {
  const value = String(text ?? "");
  const match = value.match(/\b(?:1\+\+|1\+|1|1급|PR|CAB|S|GF|SBA|AAA|A\+|A|B|C)\b/i);
  return match?.[0] ? match[0].toUpperCase() : "";
}

function extractStorageType(productName, text) {
  if (/냉동/.test(productName) || /냉동/.test(text)) return "frozen";
  if (/냉장/.test(productName) || /냉장/.test(text)) return "fresh";
  return "";
}

function isNoiseLine(line) {
  return /거래명세서|출고번호|페이지|등록번호|공급받는자|공급하는자|상호|대표|주소|전화|팩스|합계|청구액|과세|세액|면세|현재미수총액|최종미수금액|원산지 표시 의무/.test(line);
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseMoney(value) {
  const numeric = Number(String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function qualityGradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

function qualityGrade(score) {
  return qualityGradeFromScore(score);
}

function joinModelAssetUrl(baseUrl, fileName) {
  const base = normalizeModelAssetBaseUrl(baseUrl);
  return `${base}/${String(fileName ?? "").replace(/^\/+/, "")}`;
}

function normalizeModelAssetBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return OCR_RUNTIME_CONFIG.paddleModelBaseUrl;
  return trimmed.replace(/\/+$/, "");
}

function computeMeatosScore(signals = {}) {
  const textScore = clamp(signals.textScore, 0, 100);
  const tableScore = clamp(signals.tableScore, 0, 100);
  const calculationScore = clamp(signals.calculationScore, 0, 100);
  const dictionaryScore = clamp(signals.dictionaryScore, 0, 100);
  const supplierAliasScore = clamp(signals.supplierAliasScore, 0, 100);
  return Math.round(
    (textScore * 0.2)
      + (tableScore * 0.2)
      + (calculationScore * 0.25)
      + (dictionaryScore * 0.2)
      + (supplierAliasScore * 0.15)
  );
}

function median(values = []) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values = []) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + Number(value), 0) / filtered.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Number(value) : min));
}
