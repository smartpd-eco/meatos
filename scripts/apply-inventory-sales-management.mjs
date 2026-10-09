import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = String(env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const sql = await readFile(
  new URL("../supabase/migrations/202607290047_inventory_registration_sales_cancellation.sql", import.meta.url),
  "utf8",
);
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select
        to_regprocedure('public.record_manual_sale(text,numeric,numeric,numeric,date,text,text)')::text as manual_sale_rpc,
        to_regprocedure('public.cancel_sales_record(uuid,text)')::text as cancel_sale_rpc,
        count(*) filter (where column_name in (
          'inventory_movement_id','reversal_movement_id','cancelled_at',
          'cancelled_by','cancel_reason','stock_reversed'
        ))::int as cancellation_columns
      from information_schema.columns
      where table_schema = 'public' and table_name = 'sales_record'
      group by 1,2
    `);
    if (!rows[0]?.manual_sale_rpc || !rows[0]?.cancel_sale_rpc || rows[0].cancellation_columns !== 6) {
      throw new Error("Inventory and sales cancellation schema verification failed.");
    }
    await client.query("commit");
    console.log(JSON.stringify({ applied: true, schema: rows[0] }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
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
