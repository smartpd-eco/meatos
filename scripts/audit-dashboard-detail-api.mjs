import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const base = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base.startsWith("https://") || !serviceRoleKey) throw new Error("Supabase audit configuration is missing.");

const client = new Client({
  connectionString: normalizeConnectionString(env.DATABASE_URL || ""),
  ssl: { rejectUnauthorized: false }
});
await client.connect();
let tenants;
try {
  ({ rows: tenants } = await client.query(`
    select tenant.id, tenant.tenant_name,
           count(distinct movement.id)::integer as movement_count,
           count(distinct document.id)::integer as document_count
      from public.tenant_master tenant
      left join public.inventory_movement movement on movement.tenant_id = tenant.id
      left join public.ocr_document document on document.tenant_id = tenant.id
     group by tenant.id, tenant.tenant_name
    having count(distinct movement.id) > 0 or count(distinct document.id) > 0
     order by count(distinct movement.id) desc
  `));
} finally {
  await client.end();
}

const checks = tenants.flatMap((tenant) => [
  [
    tenant.tenant_name + ":purchases",
    "/ocr_document?tenant_id=eq." + tenant.id
      + "&document_status=eq.POSTED&select=id,invoice_date,total_amount,parsed_json,created_at"
      + "&order=created_at.desc&limit=500"
  ],
  [
    tenant.tenant_name + ":stock",
    "/inventory_movement?tenant_id=eq." + tenant.id
      + "&select=raw_product_name,origin,unit,quantity,unit_price,amount,movement_type,movement_date,supplier_name,slaughter_date,expiry_date,memo,created_at"
      + "&limit=5000"
  ],
  [
    tenant.tenant_name + ":alerts",
    "/inventory_movement?tenant_id=eq." + tenant.id
      + "&expiry_date=not.is.null&select=raw_product_name,quantity,unit,movement_date,slaughter_date,expiry_date,supplier_name,trace_no"
      + "&order=expiry_date.asc&limit=1000"
  ]
]);

const results = [];
for (const [name, path] of checks) {
  const startedAt = performance.now();
  const response = await fetch(base + path, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey
    },
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.text();
  let rows = [];
  try { rows = JSON.parse(body); } catch {}
  results.push({
    name,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt),
    rows: Array.isArray(rows) ? rows.length : 0,
    responseBytes: Buffer.byteLength(body)
  });
}

console.log(JSON.stringify({ tenants, results }, null, 2));
if (results.some((result) => result.status !== 200)) process.exitCode = 1;

async function loadEnv() {
  const text = await readFile(new URL("../.env", import.meta.url), "utf8");
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

function normalizeConnectionString(value) {
  return String(value).replace(/[?&]sslmode=[^&]+/i, "");
}
