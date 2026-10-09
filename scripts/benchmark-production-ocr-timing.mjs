import { readFile } from "node:fs/promises";

const imagePath = process.argv[2];
const runs = Math.max(1, Number(process.argv[3] || 5));
if (!imagePath) throw new Error("Usage: node scripts/benchmark-production-ocr-timing.mjs <image-path> [runs]");

const scanHtml = await readFile(new URL("../scan.html", import.meta.url), "utf8");
const anonKey = scanHtml.match(/const ANON_KEY = "([^"]+)"/)?.[1];
if (!anonKey) throw new Error("ANON_KEY_NOT_FOUND");

const imageBytes = await readFile(imagePath);
const imageDataUrl = `data:image/jpeg;base64,${imageBytes.toString("base64")}`;
const endpoint = "https://pkrsiqjzllyiafwpskll.functions.supabase.co/analyze-invoice";
const tenantId = "881f6cc1-b552-468c-b9b4-152edb464e61";
const samples = [];

for (let run = 1; run <= runs; run += 1) {
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      origin: "https://meatos.vercel.app",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      providerId: "gemini-2.5-flash",
      imageDataUrl,
      documentId: `production-timing-${Date.now()}-${run}`,
      tenantId,
      supplierName: "",
      localOcrText: "",
      unresolvedFields: [],
      imageQuality: { sourceType: "production-benchmark" }
    }),
    signal: AbortSignal.timeout(90000)
  });
  const body = await response.json();
  const wallMs = Math.round(performance.now() - startedAt);
  const serverMs = Math.max(0, Number(body.processingMs || body.result?.processingMs || 0));
  const sample = {
    run,
    ok: response.ok && body.ok !== false,
    status: response.status,
    wallMs,
    serverMs,
    networkMs: Math.max(0, wallMs - serverMs),
    modelUsed: body.modelUsed || body.result?.providerVersion || null,
    attempts: body.analysisAttempts || body.result?.analysisAttempts || null,
    inputTokens: Number(body.result?.usage?.inputTokens || 0),
    outputTokens: Number(body.result?.usage?.outputTokens || 0),
    rows: Array.isArray(body.result?.lineItems) ? body.result.lineItems.length : 0,
    firstProduct: body.result?.lineItems?.[0]?.rawProductName || null,
    message: body.message || null
  };
  samples.push(sample);
  console.log(JSON.stringify(sample));
}

const successful = samples.filter((sample) => sample.ok);
const values = (key) => successful.map((sample) => sample[key]);
const average = (numbers) => numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
const summary = {
  runs,
  successful: successful.length,
  wallMs: {
    average: average(values("wallMs")),
    min: successful.length ? Math.min(...values("wallMs")) : 0,
    max: successful.length ? Math.max(...values("wallMs")) : 0
  },
  serverMs: {
    average: average(values("serverMs")),
    min: successful.length ? Math.min(...values("serverMs")) : 0,
    max: successful.length ? Math.max(...values("serverMs")) : 0
  },
  networkMs: {
    average: average(values("networkMs")),
    min: successful.length ? Math.min(...values("networkMs")) : 0,
    max: successful.length ? Math.max(...values("networkMs")) : 0
  },
  models: [...new Set(successful.map((sample) => sample.modelUsed))],
  rowCounts: [...new Set(successful.map((sample) => sample.rows))],
  firstProducts: [...new Set(successful.map((sample) => sample.firstProduct))]
};

console.log(`SUMMARY ${JSON.stringify(summary)}`);
