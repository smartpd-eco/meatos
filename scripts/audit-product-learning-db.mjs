import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const tenantId = "881f6cc1-b552-468c-b9b4-152edb464e61";
  const [tenant, suppliers, counts, columns] = await Promise.all([
    client.query(
      "select id, tenant_code, tenant_name, status from public.tenant_master where id = $1",
      [tenantId]
    ),
    client.query(
      `select id, supplier_code, supplier_name, is_active
       from public.supplier_master
       where tenant_id = $1 and supplier_name ilike any($2::text[])
       order by supplier_name`,
      [tenantId, ["%대산%", "%DAESAN%"]]
    ),
    client.query(
      `select
         (select count(*)::int from public.ocr_pattern_learning where tenant_id = $1 and pattern_type = 'PRODUCT_NAME_SUBSTITUTION') as ocr_patterns,
         (select count(*)::int from public.supplier_alias where tenant_id = $1) as supplier_aliases,
         (select count(*)::int from public.learning_history where tenant_id = $1) as learning_history,
         (select count(*)::int from public.product_dictionary where is_active = true) as dictionaries`,
      [tenantId]
    ),
    client.query(
      `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name = any($1::text[])
       order by table_name, ordinal_position`,
      [["ocr_pattern_learning", "supplier_alias", "learning_history", "product_dictionary", "supplier_master"]]
    )
  ]);

  console.log(JSON.stringify({
    tenant: tenant.rows,
    matchingSuppliers: suppliers.rows,
    counts: counts.rows[0],
    columns: columns.rows
  }, null, 2));
} finally {
  await client.end();
}

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
