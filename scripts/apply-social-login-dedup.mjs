import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const env = await loadEnv();
const connectionString = normalizeConnectionString(env.DATABASE_URL ?? "");
const dryRun = process.argv.includes("--dry-run");
if (!connectionString) throw new Error("Missing DATABASE_URL in .env");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const sql = await readFile(
    "supabase/migrations/202607310053_social_login_duplicate_prevention.sql",
    "utf8"
  );
  await client.query("begin");
  try {
    await client.query(sql);
    const { rows: duplicateStats } = await client.query(`
      with duplicate_groups as (
        select lower(trim(email)) email_key, count(*) account_count
          from public.account
         where nullif(trim(email), '') is not null
         group by lower(trim(email))
        having count(*) > 1
      )
      select
        (select count(*)::int from public.account) account_count,
        (select count(*)::int from duplicate_groups) duplicate_email_group_count,
        (select count(*)::int
           from public.account
          where signup_provider in ('google', 'kakao', 'naver', 'email', 'unknown')
        ) provider_tracked_count
    `);
    const { rows: indexRows } = await client.query(`
      select indexname
        from pg_indexes
       where schemaname = 'public'
         and tablename = 'account'
         and indexname = 'account_email_normalized_uidx'
    `);
    const { rows: functionRows } = await client.query(`
      select pg_get_functiondef(
        'public.signup_company_account(uuid,text,text,text)'::regprocedure
      ) function_definition
    `);
    const functionDefinition = functionRows[0]?.function_definition ?? "";
    if (indexRows.length !== 1) throw new Error("Normalized email unique index missing.");
    if (!functionDefinition.includes("ACCOUNT_ALREADY_REGISTERED")) {
      throw new Error("Duplicate-account guard missing.");
    }
    if (!functionDefinition.includes("AUTH_EMAIL_MISMATCH")) {
      throw new Error("Verified-email guard missing.");
    }
    const behavior = await verifyBehavior(client);
    await client.query(dryRun ? "rollback" : "commit");
    console.log(JSON.stringify({
      applied: !dryRun,
      dryRun,
      duplicateStats: duplicateStats[0],
      uniqueIndex: indexRows[0]?.indexname ?? null,
      duplicateGuard: true,
      verifiedEmailGuard: true,
      behavior
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
} finally {
  await client.end();
}

async function verifyBehavior(client) {
  const canonicalUserId = randomUUID();
  const duplicateUserId = randomUUID();
  const email = `dedup-${randomUUID()}@example.invalid`;
  const claims = (userId, provider) => JSON.stringify({
    sub: userId,
    email,
    role: "authenticated",
    user_metadata: { provider },
    app_metadata: { provider }
  });

  await client.query("savepoint social_login_dedup_fixture");
  try {
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [claims(canonicalUserId, "google")]
    );
    const { rows: createdRows } = await client.query(
      "select (public.signup_company_account($1, $2, $3, $4)).*",
      [canonicalUserId, email.toUpperCase(), "중복 방지 검증", "검증 전용 기업"]
    );
    if (createdRows.length !== 1 || createdRows[0].signup_provider !== "google") {
      throw new Error("Canonical social account creation verification failed.");
    }

    await client.query("savepoint duplicate_social_login_attempt");
    let duplicateBlocked = false;
    try {
      await client.query(
        "select set_config('request.jwt.claims', $1, true)",
        [claims(duplicateUserId, "kakao")]
      );
      await client.query(
        "select (public.signup_company_account($1, $2, $3, $4)).*",
        [duplicateUserId, ` ${email} `, "중복 시도", "생성되면 안 되는 기업"]
      );
    } catch (error) {
      duplicateBlocked = String(error?.message ?? "").includes(
        "ACCOUNT_ALREADY_REGISTERED|google"
      );
      await client.query("rollback to savepoint duplicate_social_login_attempt");
    }
    if (!duplicateBlocked) {
      throw new Error("Cross-provider duplicate account was not blocked.");
    }

    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [claims(canonicalUserId, "google")]
    );
    const { rows: reusedRows } = await client.query(
      "select (public.signup_company_account($1, $2, $3, $4)).*",
      [canonicalUserId, email, "기존 사용자", "기존 기업"]
    );
    if (reusedRows[0]?.id !== createdRows[0]?.id) {
      throw new Error("Existing canonical account was not reused.");
    }

    const { rows: countRows } = await client.query(
      "select count(*)::int count from public.account where lower(trim(email)) = lower($1)",
      [email]
    );
    if (countRows[0]?.count !== 1) {
      throw new Error("Duplicate fixture account count verification failed.");
    }

    return {
      canonicalCreated: true,
      sameIdentityReused: true,
      crossProviderDuplicateBlocked: true,
      normalizedEmailMatched: true
    };
  } finally {
    await client.query("rollback to savepoint social_login_dedup_fixture");
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
