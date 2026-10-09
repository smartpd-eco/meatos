import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = String(env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: tables } = await client.query(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('delivery_order', 'delivery_order_line')
       order by c.relname
    `);
  const { rows: functions } = await client.query(`
      select p.proname as function_name, p.prosecdef as security_definer,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('process_delivery_fulfillment', 'cancel_delivery_fulfillment')
       order by p.proname
    `);
  const { rows: counts } = await client.query(`
      select
        (select count(*)::int from public.delivery_order) as orders,
        (select count(*)::int from public.delivery_order_line) as lines
    `);
  const result = { tables, functions, counts: counts[0] };
  console.log(JSON.stringify(result, null, 2));
  if (
    tables.length !== 2 || tables.some((table) => !table.rls_enabled)
    || functions.length !== 2
    || functions.some((fn) => !fn.security_definer || !fn.authenticated_execute || fn.anon_execute)
  ) process.exitCode = 1;
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
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}
