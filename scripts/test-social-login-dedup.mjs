import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [login, migration, applyScript, guide] = await Promise.all([
  readFile("login.html", "utf8"),
  readFile("supabase/migrations/202607310053_social_login_duplicate_prevention.sql", "utf8"),
  readFile("scripts/apply-social-login-dedup.mjs", "utf8"),
  readFile("docs/SOCIAL_LOGIN_DUPLICATE_PREVENTION.md", "utf8")
]);

for (const required of [
  "account_email_normalized_uidx",
  "pg_advisory_xact_lock",
  "ACCOUNT_ALREADY_REGISTERED",
  "AUTH_EMAIL_REQUIRED",
  "AUTH_EMAIL_MISMATCH",
  "signup_provider",
  "verified_email"
]) {
  assert.ok(migration.includes(required), `migration missing ${required}`);
}

for (const required of [
  "handleAccountSetupError",
  "ACCOUNT_ALREADY_REGISTERED",
  "providerLabel",
  "sb.auth.signOut",
  "처음 가입한"
]) {
  assert.ok(login.includes(required), `login duplicate UX missing ${required}`);
}

assert.ok(applyScript.includes("--dry-run"));
assert.ok(applyScript.includes("duplicate_email_group_count"));
assert.ok(applyScript.includes("verifyBehavior"));
assert.ok(applyScript.includes("crossProviderDuplicateBlocked"));
assert.ok(guide.includes("Google"));
assert.ok(guide.includes("카카오"));
assert.ok(guide.includes("네이버"));
assert.ok(guide.includes("같은 이메일"));

const canonicalEmail = (value) => String(value ?? "").trim().toLowerCase();
const shouldBlock = (existing, incoming) =>
  existing.authUserId !== incoming.authUserId
  && canonicalEmail(existing.email) === canonicalEmail(incoming.email);

assert.equal(shouldBlock(
  { authUserId:"user-1", email:"owner@example.com" },
  { authUserId:"user-1", email:"owner@example.com" }
), false);
assert.equal(shouldBlock(
  { authUserId:"google-user", email:" Owner@Example.com " },
  { authUserId:"kakao-user", email:"owner@example.com" }
), true);
assert.equal(shouldBlock(
  { authUserId:"google-user", email:"owner@example.com" },
  { authUserId:"naver-user", email:"other@example.com" }
), false);

console.log("Social-login duplicate account prevention tests passed.");
