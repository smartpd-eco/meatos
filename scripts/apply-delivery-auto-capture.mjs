import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = String(env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");
const sql = await readFile(
  new URL("../supabase/migrations/202607290045_delivery_auto_capture.sql", import.meta.url),
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
        to_regclass('public.delivery_capture_event')::text as capture_event,
        to_regprocedure('public.capture_delivery_order_agent(text,text,numeric,text,timestamptz,boolean)')::text as order_rpc,
        to_regprocedure('public.capture_delivery_label_agent(text,uuid,text,text,timestamptz)')::text as label_rpc,
        to_regprocedure('public.finalize_delivery_order_agent(text,uuid,text,timestamptz)')::text as finalize_rpc
    `);
    if (Object.values(rows[0] || {}).some((value) => !value)) {
      throw new Error("Delivery auto-capture verification failed before commit.");
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
