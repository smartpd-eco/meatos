import fs from "node:fs";
import pg from "pg";

function readEnv(path = ".env") {
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

const env = readEnv();
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const tables = await client.query(`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      exists (
        select 1
        from information_schema.columns x
        where x.table_schema = 'public'
          and x.table_name = c.relname
          and x.column_name = 'tenant_id'
      ) as has_tenant_id,
      exists (
        select 1
        from information_schema.columns x
        where x.table_schema = 'public'
          and x.table_name = c.relname
          and x.column_name = 'company_id'
      ) as has_company_id
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  `);

  const accountColumns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account'
  `);
  const accountColumnNames = new Set(accountColumns.rows.map((row) => row.column_name));
  const approvedExpression = accountColumnNames.has("member_status")
    ? "count(*) filter (where member_status = 'APPROVED')::int"
    : "null::int";
  const accounts = await client.query(`
    select
      count(*)::int as total,
      count(*) filter (where auth_user_id is not null)::int as with_auth,
      ${approvedExpression} as approved
    from public.account
  `);

  const memberships = await client.query(`
    select
      count(*)::int as total,
      count(*) filter (where user_id is null)::int as null_users
    from public.tenant_user
  `);

  const policies = await client.query(`
    select schemaname, tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);

  console.log(JSON.stringify({
    tables: tables.rows,
    accountColumns: [...accountColumnNames].sort(),
    accounts: accounts.rows[0],
    tenantUsers: memberships.rows[0],
    policies: policies.rows
  }, null, 2));
} finally {
  await client.end();
}
