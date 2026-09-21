// scripts/build-vercel-static.mjs
// Aug 19 정적 배포 재현 빌드. dist 를 만들어 라이브(Aug 19)와 동일한 정적 사이트 +
// 최신 POS 설치본(downloads/)을 담는다.
// 레거시 브라우저 OCR(paddle/tesseract/onnx)과 app.js 는 배포에서 제외한다.
// 실행: npm run build:vercel  (vercel.json 의 buildCommand)

import { cp, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const exists = async (rel) => {
  try { await access(path.join(root, rel)); return true; } catch { return false; }
};
const copy = async (rel) => {
  if (!(await exists(rel))) { console.log("skip(없음): " + rel); return; }
  const dest = path.join(dist, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(path.join(root, rel), dest, { recursive: true });
  console.log("copied : " + rel);
};

// 페이지 (app.js 를 부르는 페이지는 없음 → app.js 제외)
const pages = [
  "index.html", "scan.html", "records.html", "stock.html", "sales.html", "purchases.html",
  "settings.html", "login.html", "sell.html", "connect.html", "business-verify.html",
  "delivery-sales.html", "delivery-connect.html", "account-link.html", "settlement.html",
  "safety-stock.html", "auto-order.html", "sanitation.html", "sanitation-list.html",
  "policy.html", "alerts.html", "fresh-stock-settings.html",
];
// 공통 자원 (app.js 제외)
const assets = [
  "header.js", "styles.css", "runtime-config.js", "sw.js", "manifest.webmanifest",
  "fresh-stock.css", "fresh-stock-page.js", "fresh-stock-settings.js",
];
// 디렉터리 (페이지들이 참조하는 스크립트/아이콘 + POS 설치본)
const dirs = ["src", "services/product", "icons", "downloads"];

for (const rel of [...pages, ...assets, ...dirs]) await copy(rel);

console.log("\n=== dist 생성 완료: Aug 19 정적본 + 최신 POS 설치본 ===");
