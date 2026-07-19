const DEFAULT_PROVIDER_HEADER = "X-OCR-SECRET";

type AnalyzeOcrRequest = {
  providerId?: string;
  providerName?: string;
  imageDataUrl?: string;
  imageName?: string;
  imageFormat?: string;
  requestId?: string;
  timestamp?: number;
  version?: string;
  lang?: string;
  enableTableDetection?: boolean;
  supplierName?: string;
  templateProfile?: Record<string, unknown>;
  qualityScore?: number;
  rawText?: string;
  documentId?: string;
  tenantId?: string;
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    // A 204 response must not include a body. Deno throws before sending the
    // CORS headers when an empty string is supplied here.
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  if (request.method === "GET") {
    const providerUrl = Deno.env.get("CLOVA_OCR_API_URL") ?? "";
    const providerSecret = Deno.env.get("CLOVA_OCR_SECRET_KEY") ?? "";
    const providerMode = Deno.env.get("CLOVA_OCR_PROVIDER") ?? "clova";
    const secretFingerprint = providerSecret ? await fingerprintSecret(providerSecret) : "";
    return jsonResponse({
      ok: Boolean(providerUrl && providerSecret),
      providerMode,
      providerName: "NAVER CLOVA OCR General",
      providerVersion: "clova-general",
      secretConnected: Boolean(providerUrl && providerSecret),
      configured: Boolean(providerUrl && providerSecret),
      secretFingerprint
    }, providerUrl && providerSecret ? 200 : 503);
  }

  try {
    const payload = (await request.json()) as AnalyzeOcrRequest;
    const providerUrl = Deno.env.get("CLOVA_OCR_API_URL") ?? "";
    const providerSecret = Deno.env.get("CLOVA_OCR_SECRET_KEY") ?? "";
    const providerMode = Deno.env.get("CLOVA_OCR_PROVIDER") ?? "clova";

    if (!providerUrl || !providerSecret) {
      return jsonResponse({
        ok: false,
        providerMode,
        message: "OCR provider environment variables are not configured"
      }, 503);
    }

    const providerRequest = buildClovaRequest(payload);
    const providerResponse = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DEFAULT_PROVIDER_HEADER]: providerSecret
      },
      body: JSON.stringify(providerRequest)
    });

    const text = await providerResponse.text();
    return new Response(text || "{}", {
      status: providerResponse.status,
      headers: {
        ...corsHeaders(),
        "content-type": providerResponse.headers.get("content-type") ?? "application/json"
      }
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown OCR failure"
    }, 500);
  }
});

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info, x-ocr-secret"
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json"
    }
  });
}

function buildClovaRequest(payload: AnalyzeOcrRequest) {
  const image = parseImageDataUrl(payload.imageDataUrl ?? "");
  return {
    version: String(payload.version ?? "V2"),
    requestId: String(payload.requestId ?? crypto.randomUUID()),
    timestamp: Number(payload.timestamp ?? Date.now()),
    lang: String(payload.lang ?? "ko"),
    enableTableDetection: payload.enableTableDetection ?? true,
    images: image ? [
      {
        format: String(payload.imageFormat ?? image.format),
        name: String(payload.imageName ?? payload.documentId ?? "meatos-ocr"),
        data: image.base64
      }
    ] : [],
    source: {
      providerId: String(payload.providerId ?? "clova-general"),
      providerName: String(payload.providerName ?? "NAVER CLOVA OCR General"),
      supplierName: String(payload.supplierName ?? ""),
      qualityScore: Number(payload.qualityScore ?? 0),
      rawText: String(payload.rawText ?? ""),
      documentId: String(payload.documentId ?? ""),
      tenantId: String(payload.tenantId ?? ""),
      templateProfile: payload.templateProfile ?? {}
    }
  };
}

function parseImageDataUrl(imageDataUrl: string) {
  const value = String(imageDataUrl ?? "").trim();
  if (!value) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) {
    return {
      format: "jpg",
      base64: value
    };
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const format = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  return {
    format,
    base64
  };
}

async function fingerprintSecret(secret: string) {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
