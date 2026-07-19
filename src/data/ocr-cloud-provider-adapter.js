const DEFAULT_TIMEOUT_MS = 8000;

export function createCloudOcrProvider(providerId, config = {}) {
  const id = String(providerId ?? "").trim().toLowerCase();
  if (id === "upstage-document-parse" || id === "upstage") {
    return new ServerOcrProvider({
      providerId: "upstage-document-parse",
      providerName: "Upstage Document Parse",
      normalizer: normalizeUpstageDocumentResponse,
      ...config
    });
  }
  if (id === "google-vision-document-text" || id === "google-vision") {
    return new ServerOcrProvider({
      providerId: "google-vision-document-text",
      providerName: "Google Vision Document Text",
      normalizer: normalizeGoogleVisionResponse,
      ...config
    });
  }
  if (id === "gemini-2.5-flash" || id === "gemini-vision" || id === "gemini") {
    return new ServerOcrProvider({
      providerId: "gemini-2.5-flash",
      providerName: "Gemini 2.5 Flash Vision",
      normalizer: normalizeMeatosVisionResponse,
      ...config
    });
  }
  if (id === "gpt-4.1" || id === "openai-vision" || id === "gpt") {
    return new ServerOcrProvider({
      providerId: "gpt-4.1",
      providerName: "OpenAI GPT-4.1 Vision",
      normalizer: normalizeMeatosVisionResponse,
      ...config
    });
  }
  throw new Error(`Unsupported cloud OCR provider: ${providerId}`);
}

class ServerOcrProvider {
  constructor(config) {
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    this.functionUrl = String(config.functionUrl ?? "").trim();
    this.timeoutMs = Number(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.normalizer = config.normalizer;
  }

  async healthCheck() {
    if (!this.functionUrl) return healthResult(this, false, 0, "SERVER_FUNCTION_URL_MISSING");
    const startedAt = performance.now();
    try {
      const healthUrl = new URL(this.functionUrl, globalThis.location?.href ?? "http://localhost");
      healthUrl.searchParams.set("providerId", this.providerId);
      const response = await fetch(healthUrl, { method: "GET", signal: AbortSignal.timeout(this.timeoutMs) });
      return healthResult(this, response.ok, performance.now() - startedAt, response.ok ? "READY" : `HTTP_${response.status}`);
    } catch (error) {
      return healthResult(this, false, performance.now() - startedAt, error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR");
    }
  }

  async recognizeDocument(input = {}) {
    if (!this.functionUrl) throw new Error(`${this.providerName} server function URL is missing`);
    if (!input.imageDataUrl && !input.storagePath) throw new Error("Cloud OCR requires imageDataUrl or storagePath");
    const startedAt = performance.now();
    const response = await fetch(this.functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        providerId: this.providerId,
        imageDataUrl: input.imageDataUrl ?? "",
        storagePath: input.storagePath ?? "",
        documentId: input.documentId ?? "",
        tenantId: input.tenantId ?? "",
        supplierName: input.supplierName ?? "",
        localOcrText: input.localOcrText ?? input.rawText ?? "",
        unresolvedFields: Array.isArray(input.unresolvedFields) ? input.unresolvedFields : []
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message ?? `${this.providerName} HTTP ${response.status}`);
    return this.normalizer(payload, { processingMs: Math.round(performance.now() - startedAt) });
  }
}

export function normalizeMeatosVisionResponse(payload = {}, runtime = {}) {
  const result = payload.result ?? payload;
  const words = (Array.isArray(result.words) ? result.words : []).map((word) => normalizeWord(
    word.text,
    word.confidence,
    word.bounds?.vertices ?? word.bounds ?? word.boundingBox
  ));
  const providerId = String(result.providerId ?? payload.providerId ?? "vision-llm");
  const providerName = String(result.providerName ?? payload.providerName ?? providerId);
  const normalized = buildNormalizedResult({
    providerId,
    providerName,
    providerVersion: String(result.providerVersion ?? payload.providerVersion ?? providerId),
    rawText: String(result.rawText ?? ""),
    words,
    elements: Array.isArray(result.elements) ? result.elements : [],
    tables: Array.isArray(result.tables) ? result.tables : [],
    processingMs: runtime.processingMs ?? result.processingMs ?? payload.processingMs ?? 0,
    rawJson: payload
  });
  return {
    ...normalized,
    providerConfidence: Number(result.providerConfidence ?? normalized.providerConfidence ?? 0),
    documentFields: result.documentFields ?? {},
    lineItems: Array.isArray(result.lineItems) ? result.lineItems : [],
    evidence: result.evidence ?? {},
    usage: result.usage ?? payload.usage ?? {},
    reviewRequired: result.reviewRequired !== false
  };
}

export function normalizeGoogleVisionResponse(payload = {}, runtime = {}) {
  const response = payload.responses?.[0] ?? payload;
  const annotation = response.fullTextAnnotation ?? {};
  const words = [];
  for (const page of annotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("");
          words.push(normalizeWord(text, word.confidence, word.boundingBox?.vertices ?? word.boundingBox?.normalizedVertices));
        }
      }
    }
  }
  return buildNormalizedResult({
    providerId: "google-vision-document-text",
    providerName: "Google Vision Document Text",
    providerVersion: String(payload.providerVersion ?? "document-text-detection"),
    rawText: String(annotation.text ?? response.textAnnotations?.[0]?.description ?? ""),
    words,
    elements: words.map((word) => ({ type: "word", ...word })),
    tables: [],
    processingMs: runtime.processingMs ?? payload.processingMs ?? 0,
    rawJson: payload
  });
}

export function normalizeUpstageDocumentResponse(payload = {}, runtime = {}) {
  const pages = payload.pages ?? payload.content?.pages ?? [];
  const elements = (payload.elements ?? pages.flatMap((page) => page.elements ?? [])).map((element, index) => ({
    id: String(element.id ?? `element-${index + 1}`),
    type: normalizeElementType(element.category ?? element.type ?? "text"),
    text: String(element.content?.text ?? element.text ?? element.content ?? "").trim(),
    html: String(element.content?.html ?? element.html ?? "").trim(),
    confidence: normalizeConfidence(element.confidence ?? element.score),
    bounds: normalizeBounds(element.coordinates ?? element.boundingBox ?? element.bbox)
  }));
  const pageWords = pages.flatMap((page) => page.words ?? []).map((word) => normalizeWord(word.text, word.confidence, word.boundingBox?.vertices ?? word.boundingBox));
  const words = pageWords.length ? pageWords : elements.filter((element) => element.type === "text").map((element) => ({ text: element.text, confidence: element.confidence, bounds: element.bounds }));
  return buildNormalizedResult({
    providerId: "upstage-document-parse",
    providerName: "Upstage Document Parse",
    providerVersion: String(payload.modelVersion ?? payload.apiVersion ?? "document-parse"),
    rawText: String(payload.text ?? pages.map((page) => page.text ?? "").join("\n") ?? ""),
    words,
    elements,
    tables: elements.filter((element) => element.type === "table"),
    processingMs: runtime.processingMs ?? payload.processingMs ?? 0,
    rawJson: payload
  });
}

function buildNormalizedResult(input) {
  const confidences = input.words.map((word) => Number(word.confidence ?? 0)).filter((value) => value > 0);
  return {
    schemaVersion: "MEATOS_OCR_PROVIDER_V1",
    providerId: input.providerId,
    providerName: input.providerName,
    providerVersion: input.providerVersion,
    providerConfidence: confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : 0,
    rawText: input.rawText,
    words: input.words,
    elements: input.elements,
    tables: input.tables,
    layoutSignals: deriveLayoutSignals(input.words, input.tables),
    processingMs: Number(input.processingMs ?? 0),
    rawJson: input.rawJson
  };
}

function deriveLayoutSignals(words, tables) {
  const yAnchors = [...new Set(words.map((word) => Math.round(word.bounds.centerY / 10) * 10))];
  const xAnchors = [...new Set(words.map((word) => Math.round(word.bounds.minX / 10) * 10))];
  return {
    wordCount: words.length,
    rowAnchorCount: yAnchors.length,
    columnAnchorCount: xAnchors.length,
    tableCount: tables.length,
    hasExplicitTable: tables.length > 0
  };
}

function normalizeWord(text, confidence, vertices) {
  return { text: String(text ?? "").trim(), confidence: normalizeConfidence(confidence), bounds: normalizeBounds(vertices) };
}

function normalizeConfidence(value) {
  const numeric = Number(value ?? 0);
  return Math.round((numeric <= 1 ? numeric * 100 : numeric) * 100) / 100;
}

function normalizeBounds(value) {
  const vertices = Array.isArray(value) ? value : value?.vertices ?? value?.points ?? [];
  const points = vertices.map((point) => ({ x: Number(point.x ?? point[0] ?? 0), y: Number(point.y ?? point[1] ?? 0) }));
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, centerX: minX + (maxX - minX) / 2, centerY: minY + (maxY - minY) / 2 };
}

function normalizeElementType(value) {
  const type = String(value ?? "").toLowerCase();
  if (type.includes("table")) return "table";
  if (type.includes("figure") || type.includes("image")) return "figure";
  if (type.includes("header")) return "header";
  return "text";
}

function healthResult(provider, ok, latencyMs, status) {
  return { ok, providerId: provider.providerId, providerName: provider.providerName, latencyMs: Math.round(latencyMs), status, checkedAt: new Date().toISOString() };
}
