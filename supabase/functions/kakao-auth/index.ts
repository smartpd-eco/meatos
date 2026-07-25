// 카카오 간편로그인 — Supabase 우회 커스텀 OAuth (이메일 요청 안 함 → KOE205 회피)
// 흐름: 클릭 → 이 함수 → 카카오 인증(scope=profile_nickname) → 이 함수(code) →
//       토큰·프로필 → Supabase 사용자 생성/조회 → 매직링크 발급 → 앱으로 복귀(세션)
// 배포: verify_jwt = false. 시크릿: KAKAO_CLIENT_ID(REST API키), (선택)KAKAO_CLIENT_SECRET,
//       (선택)KAKAO_REDIRECT, APP_REDIRECT. SUPABASE_URL/SERVICE_ROLE 은 기본 제공.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CID = Deno.env.get("KAKAO_CLIENT_ID") ?? "";
const CSECRET = Deno.env.get("KAKAO_CLIENT_SECRET") ?? "";
const FN_URL = Deno.env.get("KAKAO_REDIRECT") ?? "https://pkrsiqjzllyiafwpskll.functions.supabase.co/kakao-auth";
const APP_REDIRECT = Deno.env.get("APP_REDIRECT") ?? "https://meatos.vercel.app/login.html";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function fail(msg: string) {
  return new Response(
    `<!doctype html><meta charset=utf-8><body style="font-family:system-ui;padding:24px">
     <h3>카카오 로그인 오류</h3><p>${msg}</p><a href="${APP_REDIRECT}">로그인으로 돌아가기</a></body>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    // 1) 시작: 코드 없으면 카카오 인증으로 (이메일 스코프 요청 안 함)
    if (!code) {
      const auth = "https://kauth.kakao.com/oauth/authorize?response_type=code"
        + "&client_id=" + encodeURIComponent(CID)
        + "&redirect_uri=" + encodeURIComponent(FN_URL)
        + "&scope=profile_nickname";
      return Response.redirect(auth, 302);
    }

    // 2) 토큰 교환
    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("client_id", CID);
    if (CSECRET) form.set("client_secret", CSECRET);
    form.set("redirect_uri", FN_URL);
    form.set("code", code);
    const tRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: form.toString(),
    });
    const tok = await tRes.json();
    if (!tok.access_token) return fail("토큰 교환 실패: " + JSON.stringify(tok).slice(0, 200));

    // 3) 프로필 조회
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: "Bearer " + tok.access_token },
    });
    const me = await meRes.json();
    const kakaoId = me.id;
    const acct = me.kakao_account ?? {};
    const nickname = acct.profile?.nickname || ("카카오" + String(kakaoId ?? "").slice(-4));
    // 이메일 없으면 합성(계정은 auth_user_id 로 식별하므로 무방)
    const email = acct.email || ("kakao_" + kakaoId + "@kakao.meatos.local");
    if (!kakaoId) return fail("카카오 프로필 조회 실패");

    // 4) Supabase 사용자 생성(있으면 무시) → 매직링크
    const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
    await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { name: nickname, provider: "kakao", kakao_id: kakaoId },
    }).catch(() => {});

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: APP_REDIRECT },
    });
    if (error || !data?.properties?.action_link) return fail("세션 발급 실패");

    return Response.redirect(data.properties.action_link, 302);
  } catch (e) {
    return fail(String(e));
  }
});
