import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: stores } = await client.query(`
    with stock as (
      select company_id, store_id, raw_product_name, coalesce(unit, 'kg') as unit,
             sum(case when movement_type = 'OUT' then -quantity else quantity end) as available
        from public.inventory_movement
       where is_active
       group by company_id, store_id, raw_product_name, coalesce(unit, 'kg')
      having sum(case when movement_type = 'OUT' then -quantity else quantity end) > 0
    )
    select c.name as company_name,
           s.name as store_name,
           s.is_default,
           count(distinct (stock.raw_product_name, stock.unit))::integer as saleable_products,
           count(distinct b.id)::integer as mapped_barcodes,
           count(distinct b.id) filter (
             where stock.raw_product_name is not null
           )::integer as saleable_mapped_barcodes,
           count(distinct a.id) filter (where a.is_active)::integer as active_agents
      from public.company c
      join public.store s on s.company_id = c.id and s.is_active
      left join stock on stock.company_id = c.id and stock.store_id = s.id
      left join public.product_barcode b
        on b.tenant_id = c.id
       and (b.store_id = s.id or b.store_id is null)
       and b.raw_product_name = stock.raw_product_name
       and coalesce(b.unit, 'kg') = stock.unit
      left join public.pos_agent_credential a
        on a.company_id = c.id and a.store_id = s.id
     group by c.name, s.name, s.is_default
     order by c.name, s.is_default desc, s.name
  `);

  const { rows: functions } = await client.query(`
    select p.proname as name,
           p.prosecdef as security_definer,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('issue_pos_agent_key', 'process_pos_sale_event')
     order by p.proname
  `);

  console.log(JSON.stringify({ stores, functions }, null, 2));
  if (functions.length !== 2 || functions.some((fn) => !fn.security_definer)) process.exitCode = 1;
} finally {
  await client.end();
}

async function loadEnv() {
  const text = await readFile(new URL("../.env", import.meta.url), "utf8");
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      })
  );
}

function normalizeConnectionString(value) {
  return String(value).replace(/[?&]sslmode=[^&]+/i, "");
}
