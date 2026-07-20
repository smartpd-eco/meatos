type VisionProviderId = "gemini-2.5-flash" | "gpt-4.1";

type AnalyzeInvoiceRequest = {
  providerId?: VisionProviderId;
  imageDataUrl?: string;
  documentId?: string;
  tenantId?: string;
  supplierName?: string;
  localOcrText?: string;
  unresolvedFields?: string[];
};

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rawText: { type: "string" },
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
        supplyAmount: nullableNumber(),
        taxAmount: nullableNumber(),
        totalAmount: nullableNumber()
      },
      required: ["supplierName", "supplierBusinessNo", "invoiceNo", "invoiceDate", "supplyAmount", "taxAmount", "totalAmount"]
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
          evidenceText: { type: "string" }
        },
        required: ["rowNo", "rawProductName", "species", "part", "grade", "condition", "origin", "unit", "quantity", "unitPrice", "supplyAmount", "taxAmount", "totalAmount", "traceOrImportNo", "confidence", "evidenceText"]
      }
    }
  },
  required: ["rawText", "providerConfidence", "reviewRequired", "documentFields", "lineItems"]
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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  if (request.method === "GET") {
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
    const providerId = normalizeProviderId(payload.providerId);
    if (!isProviderConfigured(providerId)) {
      return jsonResponse({ ok: false, providerId, message: "VISION_PROVIDER_NOT_CONFIGURED" }, 503);
    }
    const image = parseImageDataUrl(payload.imageDataUrl ?? "");
    if (!image) return jsonResponse({ ok: false, providerId, message: "IMAGE_REQUIRED" }, 400);

    const startedAt = Date.now();
    const providerResult = providerId === "gemini-2.5-flash"
      ? await callGemini(payload, image)
      : await callOpenAi(payload, image);
    return jsonResponse({
      ok: true,
      providerId,
      providerName: providerName(providerId),
      providerVersion: providerModel(providerId),
      processingMs: Date.now() - startedAt,
      result: {
        ...providerResult.result,
        providerId,
        providerName: providerName(providerId),
        providerVersion: providerModel(providerId),
        processingMs: Date.now() - startedAt,
        usage: providerResult.usage
      }
    });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "VISION_PROVIDER_ERROR" }, 500);
  }
});

let cachedGeminiModel = "";

// Model names change and get retired (e.g. gemini-2.5-flash returns 404
// "no longer available"). Discover a currently-available flash model that
// supports generateContent instead of hard-coding one. GEMINI_VISION_MODEL
// env var overrides this if set.
async function resolveGeminiModel(apiKey: string): Promise<string> {
  const override = Deno.env.get("GEMINI_VISION_MODEL");
  if (override) return override;
  if (cachedGeminiModel) return cachedGeminiModel;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey }
    });
    const data = await res.json();
    const models: Array<{ name?: string; supportedGenerationMethods?: string[] }> =
      Array.isArray(data?.models) ? data.models : [];
    const usable = models
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter((name) => /flash/i.test(name)
        && !/(vision|thinking|image|tts|audio|live|embedding|exp|lite)/i.test(name));
    const score = (name: string) => {
      const v = name.match(/gemini-(\d+(?:\.\d+)?)/);
      let s = v ? parseFloat(v[1]) * 100 : 0;
      if (/preview|latest/i.test(name)) s -= 5;
      return s;
    };
    usable.sort((a, b) => score(b) - score(a));
    cachedGeminiModel = usable[0] ?? "gemini-flash-latest";
    return cachedGeminiModel;
  } catch {
    return "gemini-flash-latest";
  }
}

async function callGemini(payload: AnalyzeInvoiceRequest, image: ImagePayload) {
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const model = await resolveGeminiModel(apiKey);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(payload) }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }] }],
      // thinkingBudget:0 disables the model's internal reasoning pass, which
      // otherwise makes flash vision latency swing wildly (9-30s+) and blow the
      // client timeout. Structured invoice extraction does not need it.
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: GEMINI_INVOICE_SCHEMA, thinkingConfig: { thinkingBudget: 0 } }
    })
  });
  const body = await response.json();
  if (!response.ok) {
    const detail = body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : "";
    throw new Error(`GEMINI_HTTP_${response.status}${detail}`);
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  return { result: parseStructuredResult(text), usage: normalizeGeminiUsage(body?.usageMetadata) };
}

async function callOpenAi(payload: AnalyzeInvoiceRequest, image: ImagePayload) {
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
  if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
  return { result: parseStructuredResult(body?.choices?.[0]?.message?.content ?? ""), usage: normalizeOpenAiUsage(body?.usage) };
}

function buildPrompt(payload: AnalyzeInvoiceRequest) {
  const unresolved = (payload.unresolvedFields ?? []).join(", ") || "all fields";
  return [
    "You extract Korean livestock invoice evidence into the supplied JSON schema.",
    "Never guess, repair, or invent unreadable text or numbers. Use null when the image does not prove a value.",
    "Preserve the printed raw product name. Do not standardize aliases in this step.",
    "Do not use receivable balances, previous balances, handwritten notes, or dates as line amounts.",
    "A line item must be supported by a visible product row. Keep quantity, unit price, supply, tax, total, and trace/import number separate.",
    "Set reviewRequired=true for any null, conflict, damaged area, arithmetic mismatch, or uncertain row boundary.",
    `Fields needing comparison: ${unresolved}.`,
    payload.supplierName ? `Supplier hint only: ${payload.supplierName}.` : "",
    payload.localOcrText ? `Local OCR candidate text (not ground truth):\n${payload.localOcrText}` : ""
  ].filter(Boolean).join("\n");
}

function parseStructuredResult(value: string) {
  const parsed = JSON.parse(String(value ?? "{}").replace(/^```json\s*|\s*```$/g, ""));
  return {
    rawText: String(parsed.rawText ?? ""),
    providerConfidence: clamp(parsed.providerConfidence),
    reviewRequired: parsed.reviewRequired !== false,
    documentFields: parsed.documentFields ?? {},
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    evidence: { source: "VISION_COMPARISON", noGuessing: true }
  };
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
    : Deno.env.get("GEMINI_VISION_MODEL") ?? "gemini-2.5-flash";
}

function isProviderConfigured(id: VisionProviderId) {
  return id === "gpt-4.1" ? Boolean(Deno.env.get("OPENAI_API_KEY")) : Boolean(Deno.env.get("GEMINI_API_KEY"));
}

function parseImageDataUrl(value: string): ImagePayload | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(value ?? "").trim());
  return match ? { mimeType: match[1], base64: match[2] } : null;
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
