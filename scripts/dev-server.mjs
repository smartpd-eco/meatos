import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = process.cwd();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".wasm": "application/wasm"
};

const runtimeConfig = loadRuntimeConfig();

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.pathname === "/runtime-config.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(`window.__MEATOS_SUPABASE__ = ${JSON.stringify(runtimeConfig)};`);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`MEATOS AI SCM running at http://localhost:${port}`);
});

function loadRuntimeConfig() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return {
      url: "https://pkrsiqjzllyiafwpskll.supabase.co",
      anonKey: "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh",
      schema: "public"
    };
  }

  const raw = readFileSync(envPath, "utf8");
  const pairs = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=", 2));
  const env = Object.fromEntries(pairs);

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL || "https://pkrsiqjzllyiafwpskll.supabase.co",
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh",
    schema: "public",
    paddleModelBaseUrl: env.PADDLE_OCR_MODEL_BASE_URL || "/ocr-models/paddle",
    easyOcrServiceUrl: env.EASYOCR_SERVICE_URL || "http://127.0.0.1:8765",
    tesseractWorkerPath: env.TESSERACT_WORKER_PATH || "/node_modules/tesseract.js/dist/worker.min.js",
    tesseractCorePath: env.TESSERACT_CORE_PATH || "/node_modules/tesseract.js-core",
    tesseractLangPath: env.TESSERACT_LANG_PATH || "/ocr-models/tesseract/lang-data",
    tesseractLanguages: (env.TESSERACT_LANGS || "kor,eng").split(",").map((value) => value.trim()).filter(Boolean),
    ocrFunctionUrl: env.CLOVA_OCR_FUNCTION_URL || buildEdgeFunctionUrl(env.NEXT_PUBLIC_SUPABASE_URL || "https://pkrsiqjzllyiafwpskll.supabase.co", "analyze-ocr")
  };
}

function buildEdgeFunctionUrl(supabaseUrl, functionName) {
  try {
    const url = new URL(supabaseUrl);
    return `https://${url.hostname.split(".")[0]}.functions.supabase.co/${functionName}`;
  } catch {
    return "";
  }
}
