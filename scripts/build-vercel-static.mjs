import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

process.env.MEATOS_DEPLOY_BUILD = "1";
await import("./validate-static.mjs");

const root = process.cwd();
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const copy = async (source, target = source) => {
  await mkdir(path.dirname(path.join(dist, target)), { recursive: true });
  await cp(path.join(root, source), path.join(dist, target), { recursive: true });
};

for (const file of [
  "index.html", "scan.html", "records.html", "stock.html", "alerts.html", "policy.html", "sanitation.html", "sanitation-list.html", "sales.html", "purchases.html", "settings.html", "header.js", "app.js", "styles.css", "runtime-config.js", "manifest.webmanifest", "sw.js",
]) await copy(file);

for (const directory of [
  "src",
  "services/product",
  "icons",
  "ocr-models/paddle",
  "ocr-models/tesseract/lang-data",
]) {
  await copy(directory);
}

for (const asset of [
  "node_modules/@paddleocr/paddleocr-js/dist/index.mjs",
  "node_modules/@paddleocr/paddleocr-js/dist/viz.mjs",
  "node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js",
  "node_modules/js-yaml/dist/js-yaml.mjs",
  "node_modules/onnxruntime-web/dist/ort.min.mjs",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs",
  "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm",
  "node_modules/tesseract.js/dist/tesseract.esm.min.js",
  "node_modules/tesseract.js/dist/worker.min.js",
  "node_modules/tesseract.js-core",
  "node_modules/@techstark/opencv-js/dist",
  "node_modules/clipper-lib/clipper.js",
]) await copy(asset);

console.log("Created Vercel static output with browser OCR runtime assets.");
