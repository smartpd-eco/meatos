import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile(new URL("../header.js", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const delivery = await readFile(new URL("../delivery-sales.html", import.meta.url), "utf8");
const analyzeInvoice = await readFile(new URL("../supabase/functions/analyze-invoice/index.ts", import.meta.url), "utf8");

assert.doesNotMatch(
  header,
  /location\.replace\(["']login\.html\?next=/,
  "게스트 메뉴 화면이 로그인 페이지로 강제 이동하면 안 됩니다."
);
assert.match(header, /window\.MEATOS_GUEST_MODE\s*=\s*!isAuthenticated/);
assert.match(header, /window\.MEATOS_DEMO_MODE\s*=\s*isDemoWorkspace/);
assert.match(header, /X-MEATOS-Demo/);
assert.match(header, /method !== "GET" && method !== "HEAD"/);
assert.match(header, /status:403/);
assert.match(header, /사업장 연동 전에는 샘플 데이터만 조회할 수 있습니다/);
assert.match(header, /table === "inventory_movement"/);
assert.match(header, /table === "sales_record"/);
assert.match(header, /table === "ocr_document"/);
assert.match(header, /table === "delivery_order"/);
assert.doesNotMatch(
  index,
  /async function loadDashboardData\(\)\s*\{\s*if \(!IS_AUTHENTICATED\) return;/,
  "메인 대시보드는 게스트 샘플 데이터를 불러와야 합니다."
);
assert.match(delivery, /window\.MEATOS_GUEST_MODE/);
assert.match(analyzeInvoice, /tenantId === DEMO_TENANT_ID/);
assert.match(analyzeInvoice, /DEMO_ORIGINS\.has\(origin\)/);
assert.match(analyzeInvoice, /apiKey\.startsWith\("sb_publishable_"\)/);
assert.match(analyzeInvoice, /authorization === `Bearer \$\{apiKey\}`/);
assert.match(analyzeInvoice, /requireTenantMembership\(request, tenantId\)/);

console.log("Guest demo mode validation passed.");
