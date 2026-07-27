import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const apply = process.argv.includes("--apply");

function parseEnv(text) {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const env = parseEnv(await readFile(".env", "utf8"));
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const migration = await readFile(
  "supabase/migrations/202607260038_auth_tenant_rls.sql",
  "utf8"
);
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ids = {
  tenantA: "10000000-0000-4000-8000-000000000001",
  tenantB: "10000000-0000-4000-8000-000000000002",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002"
};

try {
  await client.connect();
  await client.query("begin");
  await client.query(migration);

  const rls = await client.query(`
    select count(*)::int as protected_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  `);
  const policies = await client.query(`
    select count(*)::int as policy_count
    from pg_policies
    where schemaname = 'public'
  `);

  await client.query(`
    insert into public.tenant_master (id, tenant_code, tenant_name)
    values
      ($1, 'RLS_TEST_A', 'RLS Test A'),
      ($2, 'RLS_TEST_B', 'RLS Test B')
  `, [ids.tenantA, ids.tenantB]);
  await client.query(`
    insert into public.tenant_user (tenant_id, user_id, role_code, status, is_default, is_active)
    values
      ($1, $3, 'OWNER', 'ACTIVE', true, true),
      ($2, $4, 'OWNER', 'ACTIVE', true, true)
  `, [ids.tenantA, ids.tenantB, ids.userA, ids.userB]);
  await client.query(`
    insert into public.supplier_master (tenant_id, supplier_code, supplier_name)
    values
      ($1, 'RLS_TEST_A', 'Tenant A Supplier'),
      ($2, 'RLS_TEST_B', 'Tenant B Supplier')
  `, [ids.tenantA, ids.tenantB]);

  await client.query("set local role authenticated");
  await client.query(
    "select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: ids.userA, role: "authenticated" })]
  );
  const visible = await client.query(`
    select tenant_id, supplier_code
    from public.supplier_master
    where supplier_code like 'RLS_TEST_%'
    order by supplier_code
  `);
  if (visible.rowCount !== 1 || visible.rows[0].tenant_id !== ids.tenantA) {
    throw new Error("Cross-tenant SELECT isolation failed");
  }

  await client.query("savepoint denied_write");
  let denied = false;
  try {
    await client.query(`
      insert into public.supplier_master (tenant_id, supplier_code, supplier_name)
      values ($1, 'RLS_TEST_DENIED', 'Denied Supplier')
    `, [ids.tenantB]);
  } catch {
    denied = true;
    await client.query("rollback to savepoint denied_write");
  }
  if (!denied) throw new Error("Cross-tenant INSERT isolation failed");

  await client.query("reset role");
  await client.query(`
    delete from public.supplier_master
    where supplier_code in ('RLS_TEST_A', 'RLS_TEST_B', 'RLS_TEST_DENIED')
  `);
  await client.query(
    "delete from public.tenant_user where user_id in ($1, $2)",
    [ids.userA, ids.userB]
  );
  await client.query(
    "delete from public.tenant_master where id in ($1, $2)",
    [ids.tenantA, ids.tenantB]
  );

  if (apply) {
    await client.query("commit");
  } else {
    await client.query("rollback");
  }

  console.log(JSON.stringify({
    mode: apply ? "applied" : "rollback-validation",
    migration: "202607260038_auth_tenant_rls.sql",
    rlsProtectedTables: rls.rows[0].protected_count,
    policies: policies.rows[0].policy_count,
    sameTenantRead: "PASS",
    crossTenantRead: "BLOCKED",
    crossTenantWrite: "BLOCKED"
  }, null, 2));
} catch (error) {
  try { await client.query("rollback"); } catch { /* connection may already be closed */ }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
