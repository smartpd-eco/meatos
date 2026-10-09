// recover-from-live.mjs
// 목적: 현재 라이브(Aug 19 롤백본, https://meatos.vercel.app)에서 "배포된 파일"을 그대로 회수해
//       로컬을 Aug 19 기준으로 복원한다. (git restore 로 되돌려진 파일 교정 + 없어진 새 페이지 생성)
// 실행: C:\MEATOS 에서  ->  node recover-from-live.mjs
// 안전: 읽기(fetch) + 쓰기만. git/배포 안 함. 배포 안 되는 파일(app.js 등)은 건드리지 않음.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://meatos.vercel.app";
const root = process.cwd();

// 라이브에서 서빙되는(=배포된) 파일 목록. 이게 곧 Aug 19의 정답본이다.
const FILES = [
  // 페이지
  "index.html", "scan.html", "records.html", "stock.html", "sales.html", "purchases.html",
  "settings.html", "login.html", "sell.html", "connect.html", "business-verify.html",
  "delivery-sales.html", "delivery-connect.html", "account-link.html", "settlement.html",
  "safety-stock.html", "auto-order.html", "sanitation.html", "sanitation-list.html",
  "policy.html", "alerts.html", "fresh-stock-settings.html",
  // 공통 스크립트/스타일
  "header.js", "styles.css", "runtime-config.js", "sw.js", "manifest.webmanifest",
  "fresh-stock.css", "fresh-stock-page.js", "fresh-stock-settings.js",
  // src/data (배포에 포함되는 것들)
  "src/data/ocr-image-pipeline.js",
  "src/data/ocr-image-preprocessor.js",
  "src/data/ocr-intake-policy.js",
];

const results = [];
for (const rel of FILES) {
  const url = `${BASE}/${rel}`;
  let ok = false, size = 0, err = "";
  for (let i = 0; i < 4 && !ok; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { err = `HTTP ${r.status}`; if (r.status === 404) break; await sleep(700); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const dest = path.join(root, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok = true; size = buf.length;
    } catch (e) { err = e.message || String(e); await sleep(900); }
  }
  results.push({ rel, ok, size, err: ok ? "" : err });
  console.log(`${ok ? "OK  " : "FAIL"}  ${rel}${ok ? `  (${size}B)` : `  <${err}>`}`);
}

const fail = results.filter(r => !r.ok);
console.log(`\n=== 회수 완료: ${results.length - fail.length}/${results.length} ===`);
if (fail.length) {
  console.log("실패(개별 확인 필요):");
  for (const f of fail) console.log(`  - ${f.rel}  <${f.err}>`);
  console.log("\n※ connect.html 이 실패하면 보안/방화벽이 exe-임베드 페이지 응답을 리셋한 것일 수 있음 → 별도 처리.");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
