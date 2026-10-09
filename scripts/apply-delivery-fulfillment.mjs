import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const sql = await readFile(
  new URL("../supabase/migrations/202607290044_delivery_fulfillment.sql", import.meta.url),
  "utf8"
);
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select
        to_regclass('public.delivery_order')::text as delivery_order,
        to_regclass('public.delivery_order_line')::text as delivery_order_line,
        to_regprocedure('public.process_delivery_fulfillment(uuid,text,text,numeric,jsonb,timestamptz)')::text as process_rpc,
        to_regprocedure('public.cancel_delivery_fulfillment(uuid,text)')::text as cancel_rpc
    `);
    if (Object.values(rows[0] ?? {}).some((value) => !value)) {
      throw new Error("Delivery schema verification failed before commit.");
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
      })
  );
}

function normalizeConnectionString(value) {
  return String(value).replace(/[?&]sslmode=[^&]+/i, "");
}
