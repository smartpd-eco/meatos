import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile(new URL("../header.js", import.meta.url), "utf8");
const scan = await readFile(new URL("../scan.html", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/data/tenant-repository-helper.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202608050062_strict_company_tenant_isolation.sql", import.meta.url), "utf8");
const validator = await readFile(new URL("./validate-tenant-isolation-hardening.mjs", import.meta.url), "utf8");

assert.match(header, /var isDemoWorkspace = !isBusinessWorkspace/);
assert.match(header, /window\.MEATOS_DEMO_MODE = isDemoWorkspace/);
assert.match(header, /window\.MEATOS_CAN_PERSIST = isBusinessWorkspace/);
assert.match(header, /if \(isDemoWorkspace && !window\.__MEATOS_DEMO_FETCH_INSTALLED__\)/);
assert.match(header, /isBusinessActivation/);
assert.match(header, /code:"DEMO_READ_ONLY"/);
assert.match(header, /if \(!isBusinessWorkspace\) return;/);
assert.match(scan, /if \(!IS_BUSINESS_WORKSPACE\)/);
assert.match(scan, /headers: \{ \.\.\.ANALYSIS_HEADERS/);
assert.match(helper, /if \(!tenantId\) return \[\]/);
assert.match(helper, /if \(!rowTenantId\) return false/);
assert.match(migration, /a\.member_status = 'APPROVED'/);
assert.match(migration, /a\.company_id = target_tenant_id/);
assert.match(migration, /target_tenant_id <> '881f6cc1-b552-468c-b9b4-152edb464e61'/);
assert.match(migration, /new\.member_status <> 'APPROVED'/);
assert.match(migration, /is_active = false/);
assert.match(validator, /companyTablesWithoutRls/);

console.log("Strict tenant isolation validation passed.");
