import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const client = new Client({
  connectionString: normalizeConnectionString(env.DATABASE_URL || ""),
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const { rows } = await client.query(`
    select n.nspname as schema_name, c.relname as object_name,
           pg_get_userbyid(c.relowner) as owner_name,
           c.relrowsecurity, c.relforcerowsecurity, null::boolean as security_definer,
           'table' as object_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('tenant_user', 'inventory_movement')
    union all
    select n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           pg_get_userbyid(p.proowner),
           null, null, p.prosecdef, 'function'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('tenant_membership_allowed', 'company_membership_allowed')
     order by object_type, object_name
  `);
  console.log(JSON.stringify(rows, null, 2));
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
