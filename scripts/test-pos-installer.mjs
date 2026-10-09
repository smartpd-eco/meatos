import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [setup, hashes, connectHtml, sellHtml, agentSource, setupSource, migration] = await Promise.all([
  readFile("downloads/MEATOS-POS-Setup.exe"),
  readFile("downloads/MEATOS-POS-Setup.sha256", "utf8"),
  readFile("connect.html", "utf8"),
  readFile("sell.html", "utf8"),
  readFile("agent/windows/MeatosPosAgent.cs", "utf8"),
  readFile("agent/windows/MeatosPosSetup.cs", "utf8"),
  readFile("supabase/migrations/202607270040_pos_agent_sales.sql", "utf8")
]);

assert.equal(setup.subarray(0, 2).toString("ascii"), "MZ");
assert.ok(setup.length > 50000);
const setupHash = createHash("sha256").update(setup).digest("hex");
assert.match(hashes, new RegExp("^" + setupHash + "\\s+MEATOS-POS-Setup\\.exe", "m"));

const marker = Buffer.from("\nMEATOS_POS_CONFIG_V1\n", "utf8");
const fixture = {
  rpcUrl: "https://example.test/rest/v1/rpc/process_pos_sale_event",
  anonKey: "publishable-test",
  agentKey: "pos_test_key_never_send",
  device: "POS01",
  storeName: "테스트 매장"
};
const personalized = Buffer.concat([setup, marker, Buffer.from(JSON.stringify(fixture), "utf8")]);
const markerIndex = personalized.lastIndexOf(marker);
assert.ok(markerIndex > setup.length - 1);
assert.deepEqual(
  JSON.parse(personalized.subarray(markerIndex + marker.length).toString("utf8")),
  fixture
);

assert.match(connectHtml, /Windows 현장 검증 설치 프로그램/);
assert.match(connectHtml, /inventory_movement/);
assert.match(connectHtml, /product_barcode/);
assert.match(connectHtml, /issue_pos_agent_key/);
assert.match(connectHtml, /capture_pos_sale_observation_agent/);
assert.match(connectHtml, /MEATOS_POS_CONFIG_V1/);
assert.match(connectHtml, /판매 가능 재고/);
assert.match(connectHtml, /POS 바코드 매핑/);
assert.match(connectHtml, /saleableMaps/);
assert.match(sellHtml, /is_active=eq\.true/);
assert.match(sellHtml, /quantity>0/);

assert.match(agentSource, /WhKeyboardLl = 13/);
assert.match(agentSource, /CallNextHookEx/);
assert.match(agentSource, /Task\.Run/);
assert.match(agentSource, /WebRequest\.Create\(config\.RpcUrl\)/);
assert.match(agentSource, /payload\["p_agent_token"\]/);
assert.match(agentSource, /현장 관찰 완료/);
assert.doesNotMatch(agentSource, /Log\([^)]*AgentKey/);
assert.match(setupSource, /ProtectedData\.Protect/);
assert.match(setupSource, /Software\\Microsoft\\Windows\\CurrentVersion\\Run/);
assert.match(setupSource, /ScheduleSelfDelete/);
assert.match(setupSource, /del \/f \/q/);
assert.match(migration, /insert into public\.inventory_movement/);
assert.match(migration, /insert into public\.sales_record/);
assert.match(migration, /INSUFFICIENT_STOCK/);

console.log("POS installer packaging and keyboard-wedge safety tests passed.");
