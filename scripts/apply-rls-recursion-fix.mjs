import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const client = new Client({
  connectionString: normalizeConnectionString(env.DATABASE_URL || ""),
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const sql = await readFile(
    new URL("../supabase/migrations/202607280043_fix_tenant_membership_rls_recursion.sql", import.meta.url),
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select p.prosecdef as security_definer,
             pg_get_userbyid(p.proowner) as owner_name
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'tenant_membership_allowed'
         and pg_get_function_identity_arguments(p.oid) = 'target_tenant_id uuid'
    `);
    if (!rows[0]?.security_definer || rows[0]?.owner_name !== "postgres") {
      throw new Error("tenant_membership_allowed security mode verification failed");
    }
    await client.query("commit");
    console.log(JSON.stringify({ applied: true, ...rows[0] }, null, 2));
  } catch (error) {
    await client.query("rollback");
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
