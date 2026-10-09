import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,connect,guide]=await Promise.all([
  readFile("supabase/migrations/202608020056_pos_field_observation.sql","utf8"),
  readFile("connect.html","utf8"),
  readFile("docs/FIELD_SALES_TEST_RUNBOOK.md","utf8")
]);
assert.match(migration,/capture_pos_sale_observation_agent/);
assert.match(migration,/'OBSERVED'/);
assert.match(migration,/pos-field-observation/);
assert.doesNotMatch(migration,/insert into public\.sales_record/i);
assert.doesNotMatch(migration,/insert into public\.inventory_movement/i);
assert.match(connect,/capture_pos_sale_observation_agent/);
assert.match(connect,/현장 검증 모드/);
assert.match(connect,/결제 전 취소/);
assert.match(guide,/POS 합계와 정육비서 관찰 합계/);
assert.match(guide,/쿠팡 전표 수신/);
console.log("POS field observation and runbook tests passed.");
