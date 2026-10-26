// 저울 라벨 사진 → 바코드·품명·단가·중량·금액 (Rev 1.2 "품목 한 번에 등록")
//
// 사장님이 저울에서 뽑은 라벨(한 장 또는 여러 장)을 찍으면, 라벨에 인쇄된 정보를 읽어
// "바코드 품목코드 ↔ 품목명·단가" 짝을 돌려준다. 저장은 하지 않는다(화면에서 확인 후 저장).
//
// 읽은 값은 그대로 믿지 않는다. 바코드 체크숫자와 "바코드 안 금액 = 라벨 금액"을 서버에서 검증해
// 함께 돌려주고, 맞지 않는 줄은 화면에서 확인 필요로 표시한다.
//
// 비밀값: GEMINI_API_KEY (analyze-invoice와 같은 키). 선택: GEMINI_VISION_MODEL, OPENAI_API_KEY.
import { requireTenantMembership } from "../_shared/tenant-auth.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type AnalyzeLabelRequest = { tenantId?: string; imageDataUrl?: string };
type ImagePayload = { mimeType: string; base64: string };
type RawLabel = {
  barcode?: string | null;
  productName?: string | null;
  unitPrice?: number | null;
  unitBasis?: string | null;
  weightKg?: number | null;
  amount?: number | null;
  confidence?: number;
  evidenceText?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          barcode: { type: "string", nullable: true },
          productName: { type: "string", nullable: true },
          unitPrice: { type: "number", nullable: true },
          unitBasis: { type: "string", nullable: true, description: "one of 100g, 1kg, 600g, each" },
          weightKg: { type: "number", nullable: true },
          amount: { type: "number", nullable: true },
          confidence: { type: "number" },
          evidenceText: { type: "string" }
        },
        required: ["barcode", "productName", "unitPrice", "unitBasis", "weightKg", "amount", "confidence", "evidenceText"]
      }
    }
  },
  required: ["labels"]
};

const PROMPT = [
  "This photo shows one or more price labels printed by a Korean butcher-shop scale.",
  "Return one entry per label in the supplied JSON schema.",
  "barcode: the digits printed under the barcode, digits only (usually 13 digits starting with 2). null if not readable.",
  "productName: the printed product name exactly as printed (e.g. '한돈 삼겹살'). Do not translate or standardize.",
  "unitPrice: the printed unit price in won (단가). unitBasis: what the unit price is per — '100g', '1kg', '600g' (1근), or 'each'.",
  "weightKg: the printed net weight converted to kg (e.g. 452g -> 0.452). amount: the printed total price in won (판매가/금액).",
  "Never guess. Use null for any value that is not clearly printed. Ignore dates, store names, origin, and trace numbers.",
  "confidence: 0-100 for the whole label. evidenceText: the raw text you read from that label."
].join("\n");

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") return jsonResponse({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const payload = await request.json() as AnalyzeLabelRequest;
    const auth = await requireTenantMembership(request, String(payload.tenantId ?? ""));
    if (auth.ok === false) return jsonResponse({ ok: false, message: auth.message }, auth.status);

    const image = parseImageDataUrl(payload.imageDataUrl ?? "");
    if (!image) return jsonResponse({ ok: false, message: "IMAGE_REQUIRED" }, 400);
    if (image.base64.length * 0.75 > MAX_IMAGE_BYTES) return jsonResponse({ ok: false, message: "IMAGE_TOO_LARGE" }, 413);

    const useGemini = Boolean(Deno.env.get("GEMINI_API_KEY"));
    if (!useGemini && !Deno.env.get("OPENAI_API_KEY")) {
      return jsonResponse({ ok: false, message: "VISION_PROVIDER_NOT_CONFIGURED" }, 503);
    }

    const startedAt = Date.now();
    const raw = useGemini ? await callGemini(image) : await callOpenAi(image);
    const labels = raw.labels.map(normalizeLabel);
    return jsonResponse({ ok: true, model: raw.model, processingMs: Date.now() - startedAt, labels });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "VISION_PROVIDER_ERROR" }, 500);
  }
});

// ── 검증·정규화 ──────────────────────────────────────────────────────
export function ean13CheckOk(digits: string): boolean {
  if (!/^[0-9]{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeLabel(label: RawLabel) {
  const barcode = String(label.barcode ?? "").replace(/\D/g, "") || null;
  const isScaleLabel = Boolean(barcode && /^2[0-9]{12}$/.test(barcode));
  const itemKey = isScaleLabel ? barcode!.slice(1, 7) : null;
  const embeddedValue = isScaleLabel ? Number(barcode!.slice(7, 12)) : null;
  const amount = toNumber(label.amount);
  const weightKg = toNumber(label.weightKg);
  const unitPrice = toNumber(label.unitPrice);
  const basis = ["100g", "1kg", "600g", "each"].includes(String(label.unitBasis)) ? String(label.unitBasis) : null;

  // 원/kg 단가: 인쇄 단가가 있으면 그것을, 없으면 금액 ÷ 중량
  let pricePerKg: number | null = null;
  if (unitPrice && basis === "100g") pricePerKg = unitPrice * 10;
  else if (unitPrice && basis === "1kg") pricePerKg = unitPrice;
  else if (unitPrice && basis === "600g") pricePerKg = Math.round(unitPrice / 0.6);
  else if (amount && weightKg && weightKg > 0) pricePerKg = Math.round(amount / weightKg);

  // 바코드 안 값이 금액인지(대부분) 중량(g)인지
  let embeds: "PRICE" | "WEIGHT" | null = null;
  if (embeddedValue !== null && amount !== null && embeddedValue === Math.round(amount)) embeds = "PRICE";
  else if (embeddedValue !== null && weightKg !== null && embeddedValue === Math.round(weightKg * 1000)) embeds = "WEIGHT";

  // 품목 5자리 + 금액 6자리 형식 저울(10만원 이상 라벨용)인지: 현재 판매 기록은 품목 6자리 + 금액 5자리 기준
  const price6Format = Boolean(isScaleLabel && amount !== null && embeds === null
    && Number(barcode!.slice(6, 12)) === Math.round(amount));

  const checks = {
    scaleLabel: isScaleLabel,
    price6Format,
    checkDigitOk: barcode ? ean13CheckOk(barcode) : false,
    embeddedMatches: embeds !== null,
    hasName: Boolean(String(label.productName ?? "").trim())
  };
  return {
    barcode,
    itemKey,
    embeddedValue,
    embeds,
    productName: String(label.productName ?? "").trim() || null,
    unitPrice,
    unitBasis: basis,
    weightKg,
    amount,
    pricePerKg,
    confidence: Math.max(0, Math.min(100, Number(label.confidence ?? 0))),
    evidenceText: String(label.evidenceText ?? "").slice(0, 400),
    checks,
    reviewRequired: !(checks.scaleLabel && checks.embeddedMatches && checks.hasName)
  };
}

// ── 비전 모델 호출 (analyze-invoice와 같은 방식) ───────────────────────
let cachedGeminiModel = "";

async function resolveGeminiModel(apiKey: string): Promise<string> {
  const override = Deno.env.get("GEMINI_VISION_MODEL");
  if (override) return override;
  if (cachedGeminiModel) return cachedGeminiModel;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": apiKey } });
    const data = await res.json();
    const models: Array<{ name?: string; supportedGenerationMethods?: string[] }> = Array.isArray(data?.models) ? data.models : [];
    const usable = models
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter((name) => /flash/i.test(name) && !/(vision|thinking|image|tts|audio|live|embedding|exp)/i.test(name));
    const score = (name: string) => {
      const v = name.match(/gemini-(\d+(?:\.\d+)?)/);
      let s = v ? parseFloat(v[1]) : 0;
      if (/lite/i.test(name)) s += 1000;
      if (/preview|latest/i.test(name)) s -= 0.5;
      return s;
    };
    usable.sort((a, b) => score(b) - score(a));
    cachedGeminiModel = usable[0] ?? "gemini-flash-latest";
    return cachedGeminiModel;
  } catch {
    return "gemini-flash-latest";
  }
}

async function callGemini(image: ImagePayload): Promise<{ labels: RawLabel[]; model: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const model = await resolveGeminiModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts = [{ text: PROMPT }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }];
  const configs: Record<string, unknown>[] = [
    { temperature: 0, responseMimeType: "application/json", responseSchema: LABEL_SCHEMA, thinkingConfig: { thinkingBudget: 0 } },
    { temperature: 0, responseMimeType: "application/json", responseSchema: LABEL_SCHEMA },
    { temperature: 0, responseMimeType: "application/json" }
  ];
  let lastError = "GEMINI_UNKNOWN";
  for (const generationConfig of configs) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig })
    });
    const body = await response.json();
    if (response.ok) {
      const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
      return { labels: parseLabels(text), model };
    }
    const detail = body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : "";
    lastError = `GEMINI_HTTP_${response.status}${detail}`;
    if (response.status !== 400) break;
  }
  throw new Error(lastError);
}

async function callOpenAi(image: ImagePayload): Promise<{ labels: RawLabel[]; model: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4.1-2025-04-14";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT + "\nRespond with a JSON object: {\"labels\":[...]}" },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" } }
      ] }],
      response_format: { type: "json_object" }
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
  return { labels: parseLabels(body?.choices?.[0]?.message?.content ?? ""), model };
}

export function parseLabels(text: string): RawLabel[] {
  const parsed = JSON.parse(String(text ?? "{}").replace(/^```json\s*|\s*```$/g, "") || "{}");
  const list = Array.isArray(parsed) ? parsed : parsed?.labels;
  return Array.isArray(list) ? list.slice(0, 50) : [];
}

function parseImageDataUrl(value: string): ImagePayload | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(value ?? "").trim());
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info"
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "content-type": "application/json" } });
}
