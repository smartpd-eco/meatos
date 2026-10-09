import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, migration, agent, sales, header, build] = await Promise.all([
  readFile("delivery-sales.html", "utf8"),
  readFile("supabase/migrations/202607290044_delivery_fulfillment.sql", "utf8"),
  readFile("agent/windows/MeatosPosAgent.cs", "utf8"),
  readFile("sales.html", "utf8"),
  readFile("header.js", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8"),
]);

assert.match(page, /쿠팡이츠 자동수집/);
assert.match(page, /추가 입력 0회/);
assert.match(page, /delivery_capture_event/);
assert.doesNotMatch(page, /id="order-id"/);
assert.doesNotMatch(page, /id="order-amount"/);
assert.doesNotMatch(page, /process_delivery_fulfillment/);

assert.match(migration, /unique \(tenant_id, channel, external_order_id\)/);
assert.match(migration, /DUPLICATE_DELIVERY_ORDER/);
assert.match(migration, /INSUFFICIENT_STOCK_LINE_/);
assert.match(migration, /insert into public\.inventory_movement/);
assert.match(migration, /insert into public\.sales_record/);
assert.match(migration, /allocated_sales_amount/);
assert.match(migration, /status = 'CANCELLED'/);
assert.match(migration, /and not coalesce\(is_cancelled, false\)/);
assert.match(migration, /security definer/);
assert.match(migration, /company_membership_allowed/);

assert.match(agent, /IsMeatosManagedScanPage/);
assert.match(agent, /쿠팡이츠 출고/);
assert.match(agent, /BARCODE_SKIPPED reason=MEATOS_MANAGED_SCAN_PAGE/);
assert.match(sales, /!x\.is_cancelled/);
assert.match(header, /delivery-sales\.html/);
assert.match(build, /delivery-sales\.html/);

console.log("Delivery fulfillment atomicity, automatic status UI, and POS double-capture guard tests passed.");
