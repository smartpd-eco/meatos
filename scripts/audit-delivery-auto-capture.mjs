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
     where n.nspname = 'public' and c.relname = 'delivery_capture_event'
  `);
  const { rows: functions } = await client.query(`
    select p.proname as function_name, p.prosecdef as security_definer,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'capture_delivery_order_agent',
         'capture_delivery_label_agent',
         'capture_delivery_label_signal_agent',
         'finalize_delivery_order_agent'
       )
     order by p.proname
  `);
  const { rows: defaults } = await client.query(`
    select column_name, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'delivery_order'
       and column_name in ('capture_mode', 'shadow_mode')
     order by column_name
  `);
  const { rows: observationColumns } = await client.query(`
    select column_name
      from information_schema.columns
     where table_schema = 'public' and table_name = 'delivery_capture_event'
       and column_name in (
         'raw_product_name','printed_weight','printed_unit_price',
         'printed_amount','raw_format_hash','parser_version'
       )
     order by column_name
  `);
  const result = { tables, functions, defaults, observationColumns };
  console.log(JSON.stringify(result, null, 2));
  if (
    tables.length !== 1 || !tables[0].rls_enabled
    || functions.length !== 4
    || functions.some((fn) => !fn.security_definer || !fn.authenticated_execute || !fn.anon_execute)
    || defaults.length !== 2
    || observationColumns.length !== 6
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
      }),
  );
}
