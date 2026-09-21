import { requireAuthenticatedUser, requireTenantMembership } from "../_shared/tenant-auth.ts";
import { detectRowAlignmentIssues, repairShiftedRowAlignment } from "../_shared/invoice-row-validator.ts";
import { clovaConfigured, callClovaInvoice } from "../_shared/clova-ocr.ts";

type VisionProviderId = "gemini-2.5-flash" | "gpt-4.1";

type AnalyzeInvoiceRequest = {
  mode?: "invoice" | "smart_zoom" | "orient";
  providerId?: VisionProviderId;
  imageDataUrl?: string;
  documentId?: string;
  tenantId?: string;
  supplierName?: string;
  localOcrText?: string;
  unresolvedFields?: string[];
  firstPassProductName?: string;
  rowNo?: number;
  imageQuality?: {
    qualityScore?: number;
    qualityLevel?: string;
    warnings?: string[];
    preprocessingSteps?: string[];
  };
};

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    providerConfidence: { type: "number" },
    reviewRequired: { type: "boolean" },
    documentFields: {
      type: "object",
      additionalProperties: false,
      properties: {
        supplierName: nullableString(),
        supplierBusinessNo: nullableString(),
        invoiceNo: nullableString(),
        invoiceDate: nullableString(),
        printedLineCount: nullableNumber(),
        supplyAmount: nullableNumber(),
        taxAmount: nullableNumber(),
        totalAmount: nullableNumber()
      },
      required: ["supplierName", "supplierBusinessNo", "invoiceNo", "invoiceDate", "printedLineCount", "supplyAmount", "taxAmount", "totalAmount"]
    },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rowNo: { type: "integer" },
          rawProductName: nullableString(),
          species: nullableString(),
          part: nullableString(),
          grade: nullableString(),
          condition: nullableString(),
          origin: nullableString(),
          unit: nullableString(),
          quantity: nullableNumber(),
          unitPrice: nullableNumber(),
          supplyAmount: nullableNumber(),
          taxAmount: nullableNumber(),
          totalAmount: nullableNumber(),
          traceOrImportNo: nullableString(),
          confidence: { type: "number" },
          readConfidence: { type: "number" },
          readStatus: { type: "string", enum: ["READABLE", "PARTIAL", "UNREADABLE"] },
          uncertainFields: { type: "array", items: { type: "string" } }
        },
        required: ["rowNo", "rawProductName", "species", "part", "grade", "condition", "origin", "unit", "quantity", "unitPrice", "supplyAmount", "taxAmount", "totalAmount", "traceOrImportNo", "confidence", "readConfidence", "readStatus", "uncertainFields"]
      }
    }
  },
  required: ["providerConfidence", "reviewRequired", "documentFields", "lineItems"]
};

const SMART_ZOOM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rawProductName: nullableString(),
    readConfidence: { type: "number" },
    uncertainCharacters: { type: "array", items: { type: "string" } },
    readStatus: { type: "string", enum: ["READABLE", "PARTIAL", "UNREADABLE"] }
  },
  required: ["rawProductName", "readConfidence", "uncertainCharacters", "readStatus"]
};

// Gemini's responseSchema is an OpenAPI 3.0 subset: it rejects `additionalProperties`
// and array-style `type: ["string","null"]`. Convert to the supported form
// (drop additionalProperties, use `nullable: true`). OpenAI keeps the original schema.
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (value.includes("null")) out.nullable = true;
      continue;
    }
    out[key] = toGeminiSchema(value);
  }
  return out;
}

const GEMINI_INVOICE_SCHEMA = toGeminiSchema(INVOICE_SCHEMA);
const GEMINI_SMART_ZOOM_SCHEMA = toGeminiSchema(SMART_ZOOM_SCHEMA);
const SMART_ZOOM_PROMPT_VERSION = "meatos-smart-zoom-v1";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEMO_TENANT_ID = "881f6cc1-b552-468c-b9b4-152edb464e61";
const DEMO_ORIGINS = new Set(["https://meatos.vercel.app"]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  if (request.method === "GET") {
    const auth = await requireAuthenticatedUser(request);
    if (auth.ok === false) return jsonResponse({ ok: false, message: auth.message }, auth.status);
    const providerId = normalizeProviderId(new URL(request.url).searchParams.get("providerId"));
    const configured = isProviderConfigured(providerId);
    return jsonResponse({
      ok: configured,
      providerId,
      providerName: providerName(providerId),
      providerVersion: providerModel(providerId),
      configured,
      secretConnected: configured
    }, configured ? 200 : 503);
  }

  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const payload = await request.json() as AnalyzeInvoiceRequest;
    const tenantId = String(payload.tenantId ?? "");
    if (!isDemoAnalysisRequest(request, tenantId)) {
      const auth = await requireTenantMembership(request, tenantId);
      if (auth.ok === false) return jsonResponse({ ok: false, message: auth.message }, auth.status);
    }
    const providerId = normalizeProviderId(payload.providerId);
    if (!isProviderConfigured(providerId)) {
      return jsonResponse({ ok: false, providerId, message: "VISION_PROVIDER_NOT_CONFIGURED" }, 503);
    }
    const image = parseImageDataUrl(payload.imageDataUrl ?? "");
    if (!image) return jsonResponse({ ok: false, providerId, message: "IMAGE_REQUIRED" }, 400);

    // 방향 감지 전용(빠름): CLOVA만 호출해 글자박스 가로비율+유효토큰 점수를 돌려준다. Gemini 미호출.
    if (payload.mode === "orient") {
      if (!clovaConfigured()) return jsonResponse({ ok: true, orient: { landscape: 0, tokenScore: 0, configured: false } });
      try {
        const clova = await callClovaInvoice(image);
        const d = (clova.debug || {}) as Record<string, unknown>;
        return jsonResponse({ ok: true, orient: { landscape: Number(d.boxLandscapeRatio) || 0, tokenScore: Number(d.tokenScore) || 0, fieldCount: Number(d.fieldCount) || 0 } });
      } catch (_e) {
        return jsonResponse({ ok: true, orient: { landscape: 0, tokenScore: 0 } });
      }
    }

    if (payload.mode === "smart_zoom") {
      if (providerId !== "gemini-2.5-flash") {
        return jsonResponse({ ok: false, providerId, message: "SMART_ZOOM_REQUIRES_GEMINI" }, 400);
      }
      const startedAt = Date.now();
      try {
        const zoom = await callGeminiSmartZoom(payload, image);
        return jsonResponse({
          ok: true,
          mode: "smart_zoom",
          providerId,
          providerName: providerName(providerId),
          providerVersion: providerModel(providerId),
          modelUsed: zoom.model,
          promptVersion: SMART_ZOOM_PROMPT_VERSION,
          analysisAttempts: 1,
          processingMs: Date.now() - startedAt,
          result: zoom.result,
          usage: zoom.usage
        });
      } catch (error) {
        if (isTransientProviderError(error)) return temporaryBusyResponse(providerId, 1);
        throw error;
      }
    }

    const startedAt = Date.now();
    let analysisAttempts = 1;
    let effectiveProviderId = providerId;
    let fallbackFrom: VisionProviderId | null = null;
    let providerResult: Awaited<ReturnType<typeof callGemini>> | null = null;
    let clovaDiag: unknown = null;
    // 1차: CLOVA OCR(표 기반, 회전 자동 처리). 실패·빈결과면 Gemini로 폴백해 기존 동작을 보존한다.
    if (clovaConfigured()) {
      try {
        const clova = await callClovaInvoice(image);
        clovaDiag = clova.debug ?? null;
        if (Array.isArray(clova.result?.lineItems) && clova.result.lineItems.length) {
          providerResult = clova as unknown as Awaited<ReturnType<typeof callGemini>>;
        }
      } catch (clovaError) {
        clovaDiag = { ok: false, reason: clovaError instanceof Error ? clovaError.message : "CLOVA_ERROR" };
        providerResult = null;
      }
    }
    if (!providerResult) try {
      providerResult = providerId === "gemini-2.5-flash"
        ? await callGemini(payload, image)
        : await callOpenAi(payload, image);
      analysisAttempts = providerResult.attempts ?? 1;
    } catch (error) {
      const failedAttempts = error instanceof VisionProviderError ? error.attempts : 1;
      if (
        providerId === "gemini-2.5-flash"
        && isTransientProviderError(error)
        && isProviderConfigured("gpt-4.1")
      ) {
        try {
          providerResult = await callOpenAi(payload, image);
          analysisAttempts = failedAttempts + (providerResult.attempts ?? 1);
          effectiveProviderId = "gpt-4.1";
          fallbackFrom = providerId;
        } catch (fallbackError) {
          if (isTransientProviderError(fallbackError)) {
            const fallbackAttempts = fallbackError instanceof VisionProviderError ? fallbackError.attempts : 1;
            return temporaryBusyResponse(providerId, failedAttempts + fallbackAttempts);
          }
          throw fallbackError;
        }
      } else if (isTransientProviderError(error)) {
        return temporaryBusyResponse(providerId, failedAttempts);
      } else {
        throw error;
      }
    }
    if (!providerResult) throw new Error("VISION_PROVIDER_ERROR");
    providerResult = { ...providerResult, result: repairShiftedRowAlignment(providerResult.result) };
    const remainingIssues = detectRowAlignmentIssues(providerResult.result);
    const lineItems = Array.isArray(providerResult.result.lineItems) ? providerResult.result.lineItems : [];
    if (!lineItems.length) {
      return jsonResponse({
        ok: false,
        message: "IMAGE_RECAPTURE_REQUIRED",
        reviewRequired: true,
        analysisAttempts,
        issues: remainingIssues
      }, 422);
    }
    const lowConfidenceRows = lineItems
      .filter((item) => Number((item as Record<string, unknown>).confidence ?? 0) < 85)
      .map((item) => Number((item as Record<string, unknown>).rowNo ?? 0))
      .filter((rowNo) => rowNo > 0);
    const reviewRequired = Boolean(
      (providerResult.result as Record<string, unknown>).reviewRequired
      || remainingIssues.length
      || lowConfidenceRows.length
    );
    return jsonResponse({
      ok: true,
      providerId: effectiveProviderId,
      providerName: providerName(effectiveProviderId),
      providerVersion: providerModel(effectiveProviderId),
      modelUsed: (providerResult as { model?: string }).model ?? providerModel(effectiveProviderId),
      fallbackFrom,
      analysisAttempts,
      processingMs: Date.now() - startedAt,
      result: {
        ...providerResult.result,
        reviewRequired,
        reviewIssues: remainingIssues,
        lowConfidenceRows,
        providerId: effectiveProviderId,
        providerName: providerName(effectiveProviderId),
        providerVersion: providerModel(effectiveProviderId),
        fallbackFrom,
        analysisAttempts,
        processingMs: Date.now() - startedAt,
        usage: providerResult.usage,
        clovaDiag
      }
    });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "VISION_PROVIDER_ERROR" }, 500);
  }
});

async function callGemini(
  payload: AnalyzeInvoiceRequest,
  image: ImagePayload
) {
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const parts = [{ text: buildPrompt(payload) }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }];
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: GEMINI_INVOICE_SCHEMA,
    thinkingConfig: { thinkingLevel: "minimal" },
    maxOutputTokens: 8192
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new VisionProviderError(`GEMINI_HTTP_${response.status}`, response.status, isTransientHttpStatus(response.status), 1);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  return {
    result: parseStructuredResult(text),
    usage: normalizeGeminiUsage(body?.usageMetadata),
    model: GEMINI_MODEL,
    attempts: 1
  };
}

async function callGeminiSmartZoom(
  payload: AnalyzeInvoiceRequest,
  image: ImagePayload
) {
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: buildSmartZoomPrompt(payload) },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } }
      ] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_SMART_ZOOM_SCHEMA
      }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new VisionProviderError(`GEMINI_HTTP_${response.status}`, response.status, isTransientHttpStatus(response.status), 1);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  const parsed = JSON.parse(String(text).replace(/^```json\s*|\s*```$/g, ""));
  const status = ["READABLE", "PARTIAL", "UNREADABLE"].includes(String(parsed.readStatus).toUpperCase())
    ? String(parsed.readStatus).toUpperCase()
    : "UNREADABLE";
  return {
    model: GEMINI_MODEL,
    usage: normalizeGeminiUsage(body?.usageMetadata),
    result: {
      rawProductName: typeof parsed.rawProductName === "string" ? parsed.rawProductName.trim() : null,
      readConfidence: clampRatio(parsed.readConfidence),
      uncertainCharacters: Array.isArray(parsed.uncertainCharacters) ? parsed.uncertainCharacters.map(String) : [],
      readStatus: status
    }
  };
}

async function callOpenAi(
  payload: AnalyzeInvoiceRequest,
  image: ImagePayload
) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const model = providerModel("gpt-4.1");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: [
        { type: "text", text: buildPrompt(payload) },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" } }
      ] }],
      response_format: { type: "json_schema", json_schema: { name: "meatos_invoice", strict: true, schema: INVOICE_SCHEMA } }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new VisionProviderError(`OPENAI_HTTP_${response.status}`, response.status, isTransientHttpStatus(response.status), 1);
  }
  return { result: parseStructuredResult(body?.choices?.[0]?.message?.content ?? ""), usage: normalizeOpenAiUsage(body?.usage), model, attempts: 1 };
}

class VisionProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly attempts: number
  ) {
    super(message);
    this.name = "VisionProviderError";
  }
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isTransientProviderError(error: unknown) {
  return error instanceof VisionProviderError && error.retryable;
}

function temporaryBusyResponse(providerId: VisionProviderId, analysisAttempts: number) {
  return jsonResponse({
    ok: false,
    providerId,
    message: "OCR_TEMPORARILY_BUSY",
    userMessage: "OCR 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.",
    retryable: true,
    analysisAttempts
  }, 503);
}

function buildPrompt(payload: AnalyzeInvoiceRequest) {
  const unresolved = (payload.unresolvedFields ?? []).join(", ") || "all fields";
  return [
    "You extract Korean livestock invoice evidence into the supplied JSON schema.",
    "Never guess, repair, or invent unreadable text or numbers. Use null when the image does not prove a value.",
    "Preserve every visible character in the printed product-name cell exactly, including a 냉장/냉동 prefix when it is printed in that same cell. Do not standardize aliases in this step.",
    "Inspect rotated invoices at 0, 90, 180, and 270 degrees before deciding Korean product characters.",
    "First locate the printed No column and count its visible numbered cells. Store that count in documentFields.printedLineCount.",
    "Output exactly one line item for each visible printed No cell. Never create a row without a visible printed row number.",
    "Bind product name, origin, unit, weight, unit price, amount, and trace number only from the same horizontal row band. Never shift a product name onto the next row's numbers.",
    "Before returning JSON, verify rowNo values are unique and contiguous from 1 through printedLineCount.",
    "If two adjacent output rows repeat the same weight, unit price, amount, and trace number, re-check the printed No column and row boundary; do not duplicate one printed row.",
    "For rear-leg names, distinguish 후지, 미후지, and an uncertain OCR-like 미우지 by checking the initial 미 and the middle ㅎ stroke against the source image; never replace one using a product dictionary.",
    "If the first character of a rear-leg name could be 미, 마, or 하 because a red grid line hides its strokes, preserve the visible raw reading, set that row confidence to at most 80, and set reviewRequired=true.",
    "rawProductName must contain only the exact text from the product-name cell. Also copy 냉장/냉동 to condition when visible, but never remove that prefix from rawProductName. Put 국내산/수입산 in origin; do not append origin to rawProductName.",
    "For every line item, return readConfidence from 0 to 1 and readStatus READABLE, PARTIAL, or UNREADABLE for rawProductName.",
    "When red grid lines, shadow, blur, or perspective hide a character stroke, preserve only the visible raw text, lower that row confidence, and set reviewRequired=true.",
    "Do not use receivable balances, previous balances, handwritten notes, or dates as line amounts.",
    "A line item must be supported by a visible product row. Keep quantity, unit price, supply, tax, total, and trace/import number separate.",
    "supplyAmount = quantity x unitPrice. Choose `quantity` as the value that makes this equation hold. Korean meat is usually priced per kg, so `quantity` is the WEIGHT in kg (e.g. 43.60), NOT the box/carton count.",
    "If a row shows BOTH a box/carton count and a weight (e.g. '3 Box 43.60'), put the weight (43.60) in `quantity` and put the box count in `unit` as text (e.g. '3 Box').",
    "Set reviewRequired=true for any null, conflict, damaged area, arithmetic mismatch, or uncertain row boundary.",
    "For each row, list only unreadable or conflicting property names in uncertainFields; use an empty array when every returned field is visibly proven.",
    "This is a single extraction pass. Do not manufacture a complete-looking table when a shaded or blurred cell is unreadable; keep that field null and lower only that row confidence.",
    `Fields needing comparison: ${unresolved}.`,
    payload.imageQuality ? `Client image quality evidence (not invoice content): ${JSON.stringify(payload.imageQuality)}.` : "",
    payload.supplierName ? `Supplier hint only: ${payload.supplierName}.` : "",
    payload.localOcrText ? `Local OCR candidate text (not ground truth):\n${payload.localOcrText}` : ""
  ].filter(Boolean).join("\n");
}

function buildSmartZoomPrompt(payload: AnalyzeInvoiceRequest) {
  return [
    "You are performing a second-pass transcription of exactly one cropped Korean invoice product-name cell.",
    "Output only the JSON required by the supplied schema.",
    "Read only visible printed characters in this crop. Preserve spacing, parentheses, 냉장/냉동 prefixes, and every character exactly as printed.",
    "Do not standardize, normalize, complete, infer, repair, or guess a product name. Do not use a product dictionary.",
    "The first-pass text is context about what may be wrong, never ground truth.",
    "Use READABLE only when the entire cell is visibly proven. Use PARTIAL when some characters are visible but uncertain, and UNREADABLE when reliable transcription is impossible.",
    "readConfidence must be from 0 to 1. List only genuinely uncertain character fragments in uncertainCharacters.",
    payload.rowNo ? `Invoice row number: ${payload.rowNo}.` : "",
    payload.firstPassProductName ? `First-pass candidate: ${JSON.stringify(payload.firstPassProductName)}.` : ""
  ].filter(Boolean).join("\n");
}

function parseStructuredResult(value: string) {
  const parsed = JSON.parse(String(value ?? "{}").replace(/^```json\s*|\s*```$/g, ""));
  const lineItems = Array.isArray(parsed.lineItems)
    ? parsed.lineItems.map(stripDuplicatedOriginFromProductName)
    : [];
  return {
    rawText: String(parsed.rawText ?? ""),
    providerConfidence: clamp(parsed.providerConfidence),
    reviewRequired: parsed.reviewRequired !== false,
    documentFields: parsed.documentFields ?? {},
    lineItems,
    evidence: { source: "VISION_COMPARISON", noGuessing: true }
  };
}

function stripDuplicatedOriginFromProductName(item: Record<string, unknown>) {
  const origin = String(item.origin ?? "").trim();
  const productName = String(item.rawProductName ?? "").trim();
  if (!origin || !productName.endsWith(origin)) return item;
  const rawProductName = productName.slice(0, -origin.length).replace(/[\s,·/()\-]+$/g, "").trim();
  return rawProductName ? { ...item, rawProductName } : item;
}

function normalizeProviderId(value: unknown): VisionProviderId {
  return String(value ?? "gemini-2.5-flash").toLowerCase().includes("gpt") ? "gpt-4.1" : "gemini-2.5-flash";
}

function providerName(id: VisionProviderId) {
  return id === "gpt-4.1" ? "OpenAI GPT-4.1 Vision" : "Gemini 2.5 Flash Vision";
}

function providerModel(id: VisionProviderId) {
  return id === "gpt-4.1"
    ? Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4.1-2025-04-14"
    : GEMINI_MODEL;
}

function isProviderConfigured(id: VisionProviderId) {
  return id === "gpt-4.1" ? Boolean(Deno.env.get("OPENAI_API_KEY")) : Boolean(Deno.env.get("GEMINI_API_KEY"));
}

function parseImageDataUrl(value: string): ImagePayload | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(value ?? "").trim());
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

function isDemoAnalysisRequest(request: Request, tenantId: string): boolean {
  const origin = request.headers.get("origin") ?? "";
  const apiKey = request.headers.get("apikey") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  return tenantId === DEMO_TENANT_ID
    && DEMO_ORIGINS.has(origin)
    && apiKey.startsWith("sb_publishable_")
    && authorization === `Bearer ${apiKey}`;
}

function normalizeGeminiUsage(usage: Record<string, unknown> = {}) {
  return { inputTokens: Number(usage.promptTokenCount ?? 0), outputTokens: Number(usage.candidatesTokenCount ?? 0) };
}

function normalizeOpenAiUsage(usage: Record<string, unknown> = {}) {
  return { inputTokens: Number(usage.prompt_tokens ?? 0), outputTokens: Number(usage.completion_tokens ?? 0) };
}

function nullableString() { return { type: ["string", "null"] }; }
function nullableNumber() { return { type: ["number", "null"] }; }
function clamp(value: unknown) { return Math.max(0, Math.min(100, Number(value ?? 0))); }
function clampRatio(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}
type ImagePayload = { mimeType: string; base64: string };

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info"
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "content-type": "application/json" } });
}
