import { readFile } from "node:fs/promises";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
const dryRun = process.argv.includes("--dry-run");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const sql = await readFile(
    "supabase/migrations/202608020055_explicit_login_provider_policy.sql",
    "utf8",
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const verification = await verifySchema(client);
    const behavior = await verifyBehavior(client);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({ applied: !dryRun, dryRun, verification, behavior }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
} finally {
  await client.end();
}

async function verifySchema(db) {
  const { rows } = await db.query(`
    select
      to_regclass('public.account_login_provider')::text provider_table,
      to_regprocedure('public.set_account_login_provider_enabled(text,boolean)')::text set_function,
      to_regprocedure('public.is_account_login_provider_enabled(text)')::text check_function
  `);
  if (Object.values(rows[0] ?? {}).some((value) => !value)) {
    throw new Error("Explicit login provider schema verification failed.");
  }
  return rows[0];
}

async function verifyBehavior(db) {
  const { rows } = await db.query(`
    select a.id, a.auth_user_id, a.signup_provider
      from public.account a
     where a.auth_user_id is not null
       and a.signup_provider in ('email','google','kakao','naver')
     order by a.created_at
     limit 1
  `);
  if (!rows[0]) return { skipped: true, reason: "NO_PRIMARY_PROVIDER_FIXTURE" };
  const account = rows[0];
  const claims = JSON.stringify({ sub: account.auth_user_id, role: "authenticated" });
  await db.query("savepoint explicit_login_provider_fixture");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const { rows: allowedRows } = await db.query(
      "select public.is_account_login_provider_enabled($1) allowed",
      [account.signup_provider],
    );
    if (!allowedRows[0]?.allowed) throw new Error("Primary login provider was not enabled.");

    let primaryDisableBlocked = false;
    await db.query("savepoint primary_provider_disable");
    try {
      await db.query(
        "select public.set_account_login_provider_enabled($1, false)",
        [account.signup_provider],
      );
    } catch (error) {
      primaryDisableBlocked = String(error?.message ?? "").includes("PRIMARY_PROVIDER_CANNOT_BE_DISABLED");
      await db.query("rollback to savepoint primary_provider_disable");
    }
    if (!primaryDisableBlocked) throw new Error("Primary provider disable was not blocked.");

    const { rows: secondaryRows } = await db.query(`
      select ai.provider
        from auth.identities ai
       where ai.user_id = $1
         and ai.provider in ('google','kakao')
         and ai.provider <> $2
       order by ai.created_at
       limit 1
    `, [account.auth_user_id, account.signup_provider]);
    let secondaryProviderToggle = "SKIPPED";
    if (secondaryRows[0]?.provider) {
      await db.query(
        "select public.set_account_login_provider_enabled($1, true)",
        [secondaryRows[0].provider],
      );
      const { rows: secondaryAllowed } = await db.query(
        "select public.is_account_login_provider_enabled($1) allowed",
        [secondaryRows[0].provider],
      );
      if (!secondaryAllowed[0]?.allowed) throw new Error("Secondary provider enable failed.");
      secondaryProviderToggle = "PASSED_AND_ROLLED_BACK";
    }
    return {
      primaryProviderEnabled: true,
      primaryDisableBlocked: true,
      secondaryProviderToggle,
      fixtureRolledBack: true,
    };
  } finally {
    await db.query("rollback to savepoint explicit_login_provider_fixture");
  }
}

async function loadEnv() {
  const raw = await readFile(".env", "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt < 0) continue;
    result[trimmed.slice(0, splitAt).trim()] = trimmed
      .slice(splitAt + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
