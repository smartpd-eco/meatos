import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
const dryRun = process.argv.includes("--dry-run");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const sql = await readFile(
    "supabase/migrations/202607310054_account_identity_link_management.sql",
    "utf8",
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const verification = await verifySchema(client);
    const behavior = await verifyBehavior(client);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({
      applied: !dryRun,
      dryRun,
      verification,
      behavior,
    }, null, 2));
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
      to_regclass('public.account_linked_identity')::text linked_identity_table,
      to_regclass('public.account_identity_link_request')::text link_request_table,
      to_regprocedure('public.begin_account_identity_link(text)')::text begin_function,
      to_regprocedure('public.complete_account_identity_link(text,text,text,text)')::text complete_function,
      to_regprocedure('public.unlink_account_external_identity(text)')::text unlink_function
  `);
  const result = rows[0] ?? {};
  if (Object.values(result).some((value) => !value)) {
    throw new Error("Account identity link schema verification failed.");
  }
  return result;
}

async function verifyBehavior(db) {
  const { rows: accounts } = await db.query(`
    select id, auth_user_id
      from public.account
     where auth_user_id is not null
     order by created_at
     limit 1
  `);
  if (!accounts[0]) return { skipped: true, reason: "NO_ACCOUNT_FIXTURE" };

  await db.query("savepoint account_identity_link_fixture");
  try {
    const account = accounts[0];
    const claims = JSON.stringify({
      sub: account.auth_user_id,
      role: "authenticated",
      email: "identity-link-check@example.invalid",
    });
    await db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const { rows: tokenRows } = await db.query(
      "select public.begin_account_identity_link('naver') token",
    );
    const token = tokenRows[0]?.token ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("One-time token verification failed.");

    const providerUserId = `verify-${randomUUID()}`;
    const { rows: completed } = await db.query(
      "select * from public.complete_account_identity_link($1, 'naver', $2, $3)",
      [token, providerUserId, "verify@example.invalid"],
    );
    if (completed[0]?.account_id !== account.id
      || completed[0]?.auth_user_id !== account.auth_user_id) {
      throw new Error("Canonical account mapping verification failed.");
    }

    let tokenReuseBlocked = false;
    await db.query("savepoint account_identity_link_reuse");
    try {
      await db.query(
        "select * from public.complete_account_identity_link($1, 'naver', $2, $3)",
        [token, providerUserId, "verify@example.invalid"],
      );
    } catch (error) {
      tokenReuseBlocked = String(error?.message ?? "").includes("LINK_REQUEST_EXPIRED");
      await db.query("rollback to savepoint account_identity_link_reuse");
    }
    if (!tokenReuseBlocked) throw new Error("One-time token reuse was not blocked.");

    return {
      oneTimeTokenIssued: true,
      canonicalAccountMapped: true,
      tokenReuseBlocked: true,
      fixtureRolledBack: true,
    };
  } finally {
    await db.query("rollback to savepoint account_identity_link_fixture");
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
      .slice(splitAt + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function normalizeConnectionString(value) {
  if (!value) return "";
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
