import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = String(env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const sql = await readFile(
  new URL("../supabase/migrations/202607290050_product_name_confirmation_learning.sql", import.meta.url),
  "utf8",
);
const dryRun = process.argv.includes("--dry-run");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select
        to_regprocedure(
          'public.confirm_product_name_learning(uuid,uuid,text,text,text,text,text,text,text,text,numeric)'
        )::text as confirmation_rpc,
        has_function_privilege(
          'authenticated',
          'public.confirm_product_name_learning(uuid,uuid,text,text,text,text,text,text,text,text,numeric)',
          'EXECUTE'
        ) as authenticated_execute,
        has_function_privilege(
          'anon',
          'public.confirm_product_name_learning(uuid,uuid,text,text,text,text,text,text,text,text,numeric)',
          'EXECUTE'
        ) as anon_execute
    `);
    if (
      !rows[0]?.confirmation_rpc
      || !rows[0]?.authenticated_execute
      || rows[0]?.anon_execute
    ) {
      throw new Error("Product-name confirmation learning RPC verification failed.");
    }
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({ applied: !dryRun, dryRun, schema: rows[0] }, null, 2));
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

