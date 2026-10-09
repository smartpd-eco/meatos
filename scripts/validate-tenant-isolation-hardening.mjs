import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const apply = process.argv.includes("--apply");
const DEMO_TENANT = "881f6cc1-b552-468c-b9b4-152edb464e61";
const ids = {
  companyA: "61000000-0000-4000-8000-000000000001",
  companyB: "61000000-0000-4000-8000-000000000002",
  unlinkedUser: "62000000-0000-4000-8000-000000000001",
  linkedUser: "62000000-0000-4000-8000-000000000002"
};

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }));
}

const env = parseEnv(await readFile(".env", "utf8"));
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const migration = await readFile(
  "supabase/migrations/202608050062_strict_company_tenant_isolation.sql",
  "utf8"
);
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function setAuthenticatedUser(userId) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" })
  ]);
}

async function membership(tenantId) {
  const { rows } = await client.query(
    "select public.tenant_membership_allowed($1::uuid) as allowed",
    [tenantId]
  );
  return rows[0]?.allowed === true;
}

try {
  await client.connect();
  await client.query("begin");
  await client.query(migration);
  await client.query("savepoint isolation_probe");

  await client.query(`
    insert into public.company (id, name) values
      ($1, 'Isolation Probe A'), ($2, 'Isolation Probe B')
  `, [ids.companyA, ids.companyB]);
  await client.query(`
    insert into public.tenant_master (id, tenant_code, tenant_name) values
      ($1, 'ISOLATION_PROBE_A', 'Isolation Probe A'),
      ($2, 'ISOLATION_PROBE_B', 'Isolation Probe B')
  `, [ids.companyA, ids.companyB]);
  await client.query(`
    insert into public.account (
      auth_user_id, company_id, email, name, role, status, member_status
    ) values
      ($1, $3, 'unlinked-probe@example.invalid', 'Unlinked Probe', 'OWNER', 'active', 'SOCIAL_VERIFIED'),
      ($2, $4, 'linked-probe@example.invalid', 'Linked Probe', 'OWNER', 'active', 'APPROVED')
  `, [ids.unlinkedUser, ids.linkedUser, ids.companyA, ids.companyB]);

  await setAuthenticatedUser(ids.unlinkedUser);
  const unlinkedOwn = await membership(ids.companyA);
  const unlinkedDemo = await membership(DEMO_TENANT);
  await client.query("reset role");

  await setAuthenticatedUser(ids.linkedUser);
  const linkedOwn = await membership(ids.companyB);
  const linkedOther = await membership(ids.companyA);
  const linkedDemo = await membership(DEMO_TENANT);
  await client.query("reset role");

  if (unlinkedOwn || unlinkedDemo) throw new Error("Unlinked account gained database tenant access");
  if (!linkedOwn || linkedOther || linkedDemo) throw new Error("Linked account tenant boundary failed");

  await client.query("rollback to savepoint isolation_probe");
  const { rows: invalidMembershipRows } = await client.query(`
    select count(*)::int as count
      from public.tenant_user tu
      left join public.account a on a.auth_user_id = tu.user_id
     where tu.status = 'ACTIVE' and tu.is_active
       and (tu.tenant_id = $1::uuid
         or a.auth_user_id is null
         or a.member_status <> 'APPROVED'
         or lower(a.status) <> 'active'
         or a.company_id is distinct from tu.tenant_id)
  `, [DEMO_TENANT]);
  const { rows: unprotectedRows } = await client.query(`
    select count(*)::int as count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col
        on col.table_schema = n.nspname
       and col.table_name = c.relname
       and col.column_name = 'tenant_id'
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  `);
  const { rows: unprotectedCompanyRows } = await client.query(`
    select count(*)::int as count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col
        on col.table_schema = n.nspname
       and col.table_name = c.relname
       and col.column_name = 'company_id'
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  `);
  if (invalidMembershipRows[0].count !== 0) throw new Error("Stale or unapproved active tenant memberships remain");
  if (unprotectedRows[0].count !== 0) throw new Error("A tenant_id table does not have RLS enabled");
  if (unprotectedCompanyRows[0].count !== 0) throw new Error("A company_id table does not have RLS enabled");

  if (apply) await client.query("commit");
  else await client.query("rollback");

  console.log(JSON.stringify({
    mode: apply ? "applied" : "rollback-validation",
    unlinkedDatabaseAccess: "BLOCKED",
    linkedOwnCompanyAccess: "PASS",
    linkedOtherCompanyAccess: "BLOCKED",
    sharedDemoDatabaseAccess: "BLOCKED",
    invalidActiveMemberships: invalidMembershipRows[0].count,
    tenantTablesWithoutRls: unprotectedRows[0].count,
    companyTablesWithoutRls: unprotectedCompanyRows[0].count
  }, null, 2));
} catch (error) {
  try { await client.query("rollback"); } catch { /* connection may be closed */ }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
