import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon.svg",
  "IMPLEMENTATION_DIRECTION_V1.md",
  "src/core/product-engine.js",
  "src/core/inventory-engine.js",
  "src/core/event-engine.js",
  "src/core/ai-engine.js",
  "src/plugins/pos-adapter.js",
  "src/data/mock-data.js"
];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (!content.trim()) {
    throw new Error(`${file} is empty`);
  }
}

const html = await readFile("index.html", "utf8");
const js = await readFile("app.js", "utf8");
const manifest = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
const direction = await readFile("IMPLEMENTATION_DIRECTION_V1.md", "utf8");

const htmlChecks = [
  "Core Engine 기반 AI 축산물 Universal SCM Platform",
  "Core Engine",
  "manifest.webmanifest",
  "mobile-tabbar"
];

for (const check of htmlChecks) {
  if (!html.includes(check)) {
    throw new Error(`index.html missing ${check}`);
  }
}

const jsChecks = [
  "ProductEngine",
  "InventoryEngine",
  "EventEngine",
  "AiEngine",
  "PosAdapterPlugin",
  "renderDashboard",
  "renderEngines",
  "renderProducts",
  "renderInventory",
  "renderEvents",
  "renderPos",
  "renderAi",
  "serviceWorker"
];

for (const check of jsChecks) {
  if (!js.includes(check)) {
    throw new Error(`app.js missing ${check}`);
  }
}

const directionChecks = [
  "Product Engine",
  "Universal Inventory Engine",
  "Event Engine",
  "AI Engine",
  "POS는 Core가 아니다. Plugin이다."
];

for (const check of directionChecks) {
  if (!direction.includes(check)) {
    throw new Error(`IMPLEMENTATION_DIRECTION_V1.md missing ${check}`);
  }
}

if (manifest.display !== "standalone") {
  throw new Error("manifest must use standalone display");
}

console.log("Static PWA validation passed.");
