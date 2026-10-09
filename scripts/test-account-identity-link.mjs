import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, migration, naver, header, build, guide] = await Promise.all([
  readFile("account-link.html", "utf8"),
  readFile("supabase/migrations/202607310054_account_identity_link_management.sql", "utf8"),
  readFile("supabase/functions/naver-auth/index.ts", "utf8"),
  readFile("header.js", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8"),
  readFile("docs/ACCOUNT_IDENTITY_LINK_MANAGEMENT.md", "utf8"),
]);

for (const required of [
  "linkIdentity",
  "getUserIdentities",
  "setProviderEnabled",
  "set_account_login_provider_enabled",
  "begin_account_identity_link",
  "이미 다른 정육비서 계정",
  "회사·재고·매출 데이터",
]) {
  assert.ok(page.includes(required), `account-link page missing ${required}`);
}

for (const required of [
  "account_linked_identity",
  "account_identity_link_request",
  "extensions.gen_random_bytes",
  "extensions.digest",
  "interval '10 minutes'",
  "IDENTITY_ALREADY_LINKED",
  "PROVIDER_ALREADY_LINKED",
  "service_role",
  "auth.uid()",
]) {
  assert.ok(migration.includes(required), `identity-link migration missing ${required}`);
}

for (const required of [
  "complete_account_identity_link",
  "provider_user_id",
  "meatos_naver_state",
  "HttpOnly",
  "SameSite=Lax",
  "getUserById",
  "account_linked_identity",
]) {
  assert.ok(naver.includes(required), `naver link flow missing ${required}`);
}

assert.ok(header.includes('["🔐 계정 연결 관리", "account-link.html"]'));
assert.ok(build.includes('"account-link.html"'));
assert.ok(guide.includes("Enable Manual Linking"));
assert.ok(guide.includes("자동 병합"));

const existing = new Map();
const connect = (accountId, provider, providerUserId) => {
  const key = `${provider}:${providerUserId}`;
  const owner = existing.get(key);
  if (owner && owner !== accountId) return "IDENTITY_ALREADY_LINKED";
  existing.set(key, accountId);
  return "LINKED";
};

assert.equal(connect("account-a", "naver", "naver-1"), "LINKED");
assert.equal(connect("account-a", "naver", "naver-1"), "LINKED");
assert.equal(connect("account-b", "naver", "naver-1"), "IDENTITY_ALREADY_LINKED");

console.log("Account identity link management tests passed.");
