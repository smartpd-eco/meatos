import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [login, accountLink, migration] = await Promise.all([
  readFile("login.html", "utf8"),
  readFile("account-link.html", "utf8"),
  readFile("supabase/migrations/202608020055_explicit_login_provider_policy.sql", "utf8"),
]);

for (const required of [
  "SOCIAL_INTENT_KEY",
  "SOCIAL_ACCOUNT_NOT_REGISTERED",
  "SOCIAL_PROVIDER_NOT_ALLOWED",
  "is_account_login_provider_enabled",
  "userHasProvider(user, provider)",
  "signup_company_account",
  "requiresLinkedProviderApproval(acct, intent)",
]) assert.ok(login.includes(required), `login policy missing ${required}`);

assert.ok(!login.includes('intent.mode !== "signup"'), "new social users must not be blocked on the login tab");
assert.match(login, /return attemptedProvider !== signupProvider/);

const approvalFunctionSource = login.match(/function requiresLinkedProviderApproval\([\s\S]*?\n\}/)?.[0];
assert.ok(approvalFunctionSource, "provider approval helper missing");
const requiresLinkedProviderApproval = Function(`${approvalFunctionSource}; return requiresLinkedProviderApproval;`)();
assert.equal(requiresLinkedProviderApproval(
  { signup_provider:"google" },
  { mode:"login", provider:"google" }
), false, "the primary Google signup provider must always be allowed");
assert.equal(requiresLinkedProviderApproval(
  { signup_provider:"google" },
  { mode:"login", provider:"kakao" }
), true, "a secondary Kakao provider still requires explicit approval");
assert.equal(requiresLinkedProviderApproval(
  { signup_provider:"google" },
  { mode:"signup", provider:"kakao" }
), false, "signup must not be treated as a linked-provider login");

for (const required of [
  "account_login_provider",
  "PRIMARY_PROVIDER_CANNOT_BE_DISABLED",
  "PROVIDER_IDENTITY_NOT_LINKED",
  "set_account_login_provider_enabled",
  "auth.identities",
]) assert.ok(migration.includes(required), `provider policy migration missing ${required}`);

for (const required of [
  "기본 로그인",
  "로그인 허용",
  "사용 중지",
  "set_account_login_provider_enabled",
]) assert.ok(accountLink.includes(required), `account-link policy UX missing ${required}`);

const allowed = new Set(["google"]);
assert.equal(allowed.has("google"), true);
assert.equal(allowed.has("kakao"), false);
allowed.add("kakao");
assert.equal(allowed.has("kakao"), true);

console.log("Explicit login provider policy tests passed.");
