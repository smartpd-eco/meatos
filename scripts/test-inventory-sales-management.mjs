import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [stock, sales, migration, build] = await Promise.all([
  readFile("stock.html", "utf8"),
  readFile("sales.html", "utf8"),
  readFile("supabase/migrations/202607290047_inventory_registration_sales_cancellation.sql", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8"),
]);

assert.match(stock, /재고 직접등록/);
assert.match(stock, /카메라 등록 준비중/);
assert.match(stock, /movement_type:"IN"/);
assert.match(stock, /supplier_name/);
assert.match(stock, /expiry_date/);
assert.match(stock, /WORKSPACE\.isBusiness/);
assert.match(stock, /resolveStockRegistrationName/);
assert.match(stock, /냉장·냉동은 서로 다른 재고로 관리됩니다/);
assert.match(stock, /classification\.storage === "보관미상"/);
assert.match(stock, /function storageBadge\(storage\)/);
assert.match(stock, /storage-state--unknown/);
assert.match(stock, /보관 확인/);
assert.match(stock, /replace\(\/\^\(냉장\|냉동\)/);
assert.match(stock, /function buildDocumentHints\(movements\)/);
assert.match(stock, /ocr_document_id/);
assert.match(stock, /documentHint\.category/);
assert.match(stock, /documentHint\.storage/);
assert.match(stock, /await PRODUCT_NAME_LEARNING_READY/);
assert.match(stock, /PRODUCT_NAMES\.suggest\(sourceName,context\)/);
assert.match(stock, /raw_product_name:resolvedName\.standardName/);
assert.match(stock, /AI 추천 품목/);
assert.match(stock, /입력명:/);

assert.match(sales, /판매취소/);
assert.match(sales, /rpc\/cancel_sales_record/);
assert.match(sales, /rpc\/record_manual_sale/);
assert.match(sales, /재고 차감 완료/);
assert.match(sales, /sale-products/);
assert.match(sales, /select=sale_date,amount,is_cancelled/);

assert.match(migration, /security definer/);
assert.match(migration, /company_membership_allowed/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /insert into public\.inventory_movement/);
assert.match(migration, /movement_type, raw_product_name/);
assert.match(migration, /'IN', target_sale\.item_name/);
assert.match(migration, /is_cancelled = true/);
assert.match(migration, /stock_reversed = should_restore/);
assert.match(migration, /status = 'REVERSED'/);
assert.match(migration, /grant execute on function public\.cancel_sales_record/);
assert.match(build, /stock\.html/);
assert.match(build, /sales\.html/);

console.log("Inventory direct registration and auditable sales cancellation tests passed.");
