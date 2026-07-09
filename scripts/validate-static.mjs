import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon.svg"
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

const htmlChecks = [
  "AI 축산물 유통 SCM 플랫폼",
  "app.js",
  "manifest.webmanifest",
  "mobile-tabbar"
];

for (const check of htmlChecks) {
  if (!html.includes(check)) {
    throw new Error(`index.html missing ${check}`);
  }
}

const jsChecks = [
  "renderDashboard",
  "renderAlias",
  "renderPos",
  "renderInventory",
  "renderSales",
  "renderOrders",
  "renderAnalytics",
  "serviceWorker"
];

for (const check of jsChecks) {
  if (!js.includes(check)) {
    throw new Error(`app.js missing ${check}`);
  }
}

if (manifest.display !== "standalone") {
  throw new Error("manifest must use standalone display");
}

console.log("Static PWA validation passed.");
