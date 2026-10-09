import { readFile } from "node:fs/promises";
import { Client } from "pg";

const migrationPath = "supabase/migrations/202608030061_fresh_stock_engine.sql";
const env = {};
for (const line of (await readFile(".env", "utf8")).split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const separator = trimmed.indexOf("=");
  if (separator < 0) continue;
  env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
}
if (!env.DATABASE_URL) throw new Error("Missing DATABASE_URL in .env");
const url = new URL(env.DATABASE_URL);
url.searchParams.delete("sslmode");
const client = new Client({ connectionString:url.toString(), ssl:{ rejectUnauthorized:false } });
await client.connect();
try {
  const sql = await readFile(migrationPath, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
  const { rows } = await client.query(`
    select to_regclass('public.fresh_stock_policy')::text as policy,
           to_regclass('public.fresh_yield_profile')::text as yield_profile,
           to_regclass('public.fresh_yield_event')::text as yield_event,
           to_regclass('public.fresh_replenishment_recommendation')::text as recommendation,
           to_regprocedure('public.record_fresh_yield_observation(text,text,text,text,numeric,numeric,numeric,numeric,text,date)')::text as yield_rpc
  `);
  const verification = rows[0] || {};
  if (Object.values(verification).some((value) => !value)) throw new Error("Fresh Stock schema verification failed");
  console.log(JSON.stringify({ applied:migrationPath, verification }, null, 2));
} finally {
  await client.end();
}
