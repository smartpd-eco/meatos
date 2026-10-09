import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, signalMigration, agent, setup, connect, page, buildScript, header, rollbackGuide] = await Promise.all([
  readFile("supabase/migrations/202607290045_delivery_auto_capture.sql", "utf8"),
  readFile("supabase/migrations/202607290046_delivery_label_signal_observation.sql", "utf8"),
  readFile("agent/windows/MeatosDeliveryAutoCapture.cs", "utf8"),
  readFile("agent/windows/MeatosPosSetup.cs", "utf8"),
  readFile("connect.html", "utf8"),
  readFile("delivery-sales.html", "utf8"),
  readFile("scripts/build-pos-installer.ps1", "utf8"),
  readFile("header.js", "utf8"),
  readFile("docs/DELIVERY_LABEL_SIGNAL_CHANGE_AND_ROLLBACK.md", "utf8"),
]);

assert.match(migration, /create table if not exists public\.delivery_capture_event/);
assert.match(migration, /unique \(credential_id, event_hash\)/);
assert.match(migration, /p_shadow_mode boolean default true/);
assert.match(migration, /target_order\.status <> 'OPEN'/);
assert.match(migration, /INVENTORY_CAPTURE_INCOMPLETE/);
assert.match(migration, /if not target_order\.shadow_mode then/);
assert.match(migration, /BARCODE_NOT_MAPPED/);
assert.match(migration, /company_membership_allowed/);
assert.match(signalMigration, /capture_delivery_label_signal_agent/);
assert.match(signalMigration, /raw_product_name/);
assert.match(signalMigration, /printed_weight/);
assert.match(signalMigration, /printed_unit_price/);
assert.match(signalMigration, /printed_amount/);
assert.match(signalMigration, /public\.capture_delivery_label_agent/);

assert.match(agent, /SerialPort/);
assert.match(agent, /Encoding\.GetEncoding\(949\)/);
assert.match(agent, /주문\\s\*번호/);
assert.match(agent, /DELIVERY_RECEIPT_REVIEW/);
assert.match(agent, /RAPID_DUPLICATE/);
assert.match(agent, /Hash\(raw\)/);
assert.match(agent, /TryParseLabelSignal/);
assert.match(agent, /ProductNameRegex/);
assert.match(agent, /WeightRegex/);
assert.match(agent, /capture_delivery_label_signal_agent/);
assert.doesNotMatch(agent, /log\([^)]*\+\s*text/);
assert.doesNotMatch(agent, /log\([^)]*\+\s*raw/);

assert.match(setup, /DeliveryShadowMode=true/);
assert.match(connect, /설치기사용/);
assert.match(connect, /deliveryShadowMode:true/);
assert.match(connect, /deliveryAutoCaptureEnabled:Boolean\(receiptPort\)/);
assert.match(connect, /3번 해결하기 · 재고 상품 바코드 연결/);
assert.match(connect, /const button=document\.getElementById\("install"\),ok=READY\.company/);
assert.match(page, /추가 입력 0회/);
assert.match(page, /그림자 검증 모드/);
assert.match(page, /!autoOrders\.length\|\|autoOrders\.some/);
assert.match(page, /LABEL_PRINT/);
assert.match(page, /raw_product_name,printed_weight,printed_unit_price,printed_amount/);
assert.doesNotMatch(page, /쿠팡 주문번호<input/);
assert.match(buildScript, /MeatosDeliveryAutoCapture\.cs/);
assert.match(header, /id='mtCompanyName'/);
assert.match(header, /companyNameNode\.textContent = activeUser\.company_name/);
assert.match(rollbackGuide, /DeliveryAutoCaptureEnabled=false/);
assert.match(rollbackGuide, /dpl_5GQQmrb1LjCKL3Ebq3cNdPAQry9F/);

console.log("Zero-touch Coupang Eats capture safety tests passed.");
