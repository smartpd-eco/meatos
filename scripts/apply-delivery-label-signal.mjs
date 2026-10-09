import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = String(env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");
const sql = await readFile(
  new URL("../supabase/migrations/202607290046_delivery_label_signal_observation.sql", import.meta.url),
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
        to_regprocedure(
          'public.capture_delivery_label_signal_agent(text,uuid,text,text,timestamptz,text,numeric,numeric,numeric,text,text)'
        )::text as signal_rpc,
        count(*) filter (where column_name in (
          'raw_product_name','printed_weight','printed_unit_price',
          'printed_amount','raw_format_hash','parser_version'
        ))::int as observation_columns
      from information_schema.columns
      where table_schema = 'public' and table_name = 'delivery_capture_event'
      group by 1
    `);
    if (!rows[0]?.signal_rpc || rows[0].observation_columns !== 6) {
      throw new Error("Label signal observation verification failed before commit.");
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
