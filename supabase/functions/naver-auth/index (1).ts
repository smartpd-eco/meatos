// Naver custom OAuth for MEATOS.
// - Normal mode signs in with an existing linked identity first, then falls
//   back to the verified Naver email for legacy users.
// - Link mode requires a short-lived token created by an authenticated user.
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const CID = Deno.env.get("NAVER_CLIENT_ID") ?? "";
const CSECRET = Deno.env.get("NAVER_CLIENT_SECRET") ?? "";
const FN_URL = Deno.env.get("NAVER_REDIRECT")
  ?? "https://pkrsiqjzllyiafwpskll.functions.supabase.co/naver-auth";
const LOGIN_REDIRECT = Deno.env.get("APP_REDIRECT")
  ?? "https://meatos.vercel.app/login.html";
const LINK_REDIRECT = Deno.env.get("ACCOUNT_LINK_REDIRECT")
  ?? "https://meatos.vercel.app/account-link.html";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const COOKIE_PATH = "/";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function readCookies(req: Request) {
  return Object.fromEntries(
    (req.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => Boolean(key))
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function cookie(name: string, value: string, maxAge = 600) {
  return `${name}=${encodeURIComponent(value)}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location });
  cookies.forEach((value) => headers.append("set-cookie", value));
  return new Response(null, { status: 302, headers });
}

function fail(message: string, linkMode = false) {
  const target = linkMode ? LINK_REDIRECT : LOGIN_REDIRECT;
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px"><h3>네이버 계정 ${linkMode ? "연결" : "로그인"} 오류</h3><p>${escapeHtml(message)}</p><a href="${escapeHtml(target)}">정육비서로 돌아가기</a></body></html>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function authUserEmail(admin: SupabaseClient, authUserId: string) {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error || !data.user?.email) throw new Error("CANONICAL_ACCOUNT_NOT_FOUND");
  return data.user.email;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state") ?? "";
  const requestedMode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const requestedToken = url.searchParams.get("token") ?? "";
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookies = readCookies(req);
  const callbackMode = cookies.meatos_naver_mode === "link" ? "link" : "login";
  const linkMode = code ? callbackMode === "link" : requestedMode === "link";

  try {
    if (!CID || !CSECRET || !SUPA_URL || !SERVICE) {
      return fail("인증 설정을 확인해 주세요.", linkMode);
    }
    if (oauthError) return fail("네이버 본인 확인이 취소되었습니다.", linkMode);

    // Start OAuth. Link mode is accepted only with a server-verifiable,
    // one-time token generated for the currently signed-in account.
    if (!code) {
      if (linkMode && !/^[a-f0-9]{64}$/i.test(requestedToken)) {
        return fail("계정 연결 요청이 올바르지 않습니다.", true);
      }
      const state = crypto.randomUUID();
      const authUrl = "https://nid.naver.com/oauth2.0/authorize?response_type=code"
        + "&client_id=" + encodeURIComponent(CID)
        + "&redirect_uri=" + encodeURIComponent(FN_URL)
        + "&state=" + encodeURIComponent(state);
      const responseCookies = [
        cookie("meatos_naver_state", state),
        cookie("meatos_naver_mode", linkMode ? "link" : "login"),
      ];
      if (linkMode) responseCookies.push(cookie("meatos_naver_link_token", requestedToken));
      return redirect(authUrl, responseCookies);
    }

    if (!cookies.meatos_naver_state || cookies.meatos_naver_state !== returnedState) {
      return fail("인증 요청이 만료되었거나 일치하지 않습니다. 다시 시도해 주세요.", linkMode);
    }

    const tokenResponse = await fetch(
      "https://nid.naver.com/oauth2.0/token?grant_type=authorization_code"
        + "&client_id=" + encodeURIComponent(CID)
        + "&client_secret=" + encodeURIComponent(CSECRET)
        + "&code=" + encodeURIComponent(code)
        + "&state=" + encodeURIComponent(returnedState),
    );
    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) return fail("네이버 인증 토큰을 받지 못했습니다.", linkMode);

    const profileResponse = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const profilePayload = await profileResponse.json();
    const profile = profilePayload.response ?? {};
    const providerUserId = String(profile.id ?? "").trim();
    const providerEmail = String(profile.email ?? "").trim().toLowerCase();
    const name = String(profile.name || profile.nickname || "").trim();
    if (!providerUserId) return fail("네이버 회원 식별정보 제공 동의가 필요합니다.", linkMode);

    const admin = createClient(SUPA_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (linkMode) {
      const linkToken = cookies.meatos_naver_link_token ?? "";
      const { error } = await admin.rpc("complete_account_identity_link", {
        p_token: linkToken,
        p_provider: "naver",
        p_provider_user_id: providerUserId,
        p_provider_email: providerEmail || null,
      });
      if (error) {
        const text = error.message ?? "";
        if (text.includes("IDENTITY_ALREADY_LINKED")) {
          return fail("이 네이버 계정은 이미 다른 정육비서 계정에 연결되어 있습니다.", true);
        }
        if (text.includes("PROVIDER_ALREADY_LINKED")) {
          return fail("현재 정육비서 계정에는 다른 네이버 계정이 이미 연결되어 있습니다.", true);
        }
        return fail("계정 연결 요청이 만료되었습니다. 다시 시도해 주세요.", true);
      }
      return redirect(`${LINK_REDIRECT}?linked=naver`, [
        cookie("meatos_naver_state", "", 0),
        cookie("meatos_naver_mode", "", 0),
        cookie("meatos_naver_link_token", "", 0),
      ]);
    }

    // A linked provider identifier takes priority over the provider email.
    const { data: linkedIdentity } = await admin
      .from("account_linked_identity")
      .select("auth_user_id")
      .eq("provider", "naver")
      .eq("provider_user_id", providerUserId)
      .maybeSingle();

    let email = providerEmail;
    if (linkedIdentity?.auth_user_id) {
      email = await authUserEmail(admin, linkedIdentity.auth_user_id);
    } else {
      if (!email) return fail("네이버 계정의 이메일 제공 동의가 필요합니다.");
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name, provider: "naver" },
      }).catch(() => {});
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: LOGIN_REDIRECT },
    });
    if (error || !data?.properties?.action_link) {
      return fail("정육비서 로그인 세션을 만들지 못했습니다.");
    }
    return redirect(data.properties.action_link, [
      cookie("meatos_naver_state", "", 0),
      cookie("meatos_naver_mode", "", 0),
      cookie("meatos_naver_link_token", "", 0),
    ]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), linkMode);
  }
});
