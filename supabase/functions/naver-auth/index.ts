// 네이버 간편로그인 — Supabase 커스텀 OAuth (브라우저 리다이렉트 기반)
// 흐름: 클릭 → 이 함수(코드없음) → 네이버 인증 → 이 함수(code) → 토큰·프로필 →
//       Supabase 사용자 생성/조회 → 매직링크 발급 → 앱으로 리다이렉트(세션 설정)
// 배포: verify_jwt = false (브라우저가 직접 호출). 시크릿 필요:
//       NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, (선택) NAVER_REDIRECT, APP_REDIRECT
//       SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임 기본 제공.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CID = Deno.env.get("NAVER_CLIENT_ID") ?? "";
const CSECRET = Deno.env.get("NAVER_CLIENT_SECRET") ?? "";
const FN_URL = Deno.env.get("NAVER_REDIRECT") ?? "https://pkrsiqjzllyiafwpskll.functions.supabase.co/naver-auth";
const APP_REDIRECT = Deno.env.get("APP_REDIRECT") ?? "https://meatos.vercel.app/login.html";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function fail(msg: string) {
  const html = `<!doctype html><meta charset=utf-8><body style="font-family:system-ui;padding:24px">
  <h3>네이버 로그인 오류</h3><p>${msg}</p><a href="${APP_REDIRECT}">로그인으로 돌아가기</a></body>`;
  return new Response(html, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // 1) 시작: 코드가 없으면 네이버 인증 페이지로
    if (!code) {
      const s = crypto.randomUUID();
      const auth = "https://nid.naver.com/oauth2.0/authorize?response_type=code"
        + "&client_id=" + encodeURIComponent(CID)
        + "&redirect_uri=" + encodeURIComponent(FN_URL)
        + "&state=" + s;
      return Response.redirect(auth, 302);
    }

    // 2) 콜백: 토큰 교환
    const tRes = await fetch("https://nid.naver.com/oauth2.0/token?grant_type=authorization_code"
      + "&client_id=" + encodeURIComponent(CID)
      + "&client_secret=" + encodeURIComponent(CSECRET)
      + "&code=" + encodeURIComponent(code)
      + "&state=" + encodeURIComponent(state ?? ""));
    const tok = await tRes.json();
    if (!tok.access_token) return fail("토큰 교환 실패");

    // 3) 프로필 조회
    const meRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: "Bearer " + tok.access_token },
    });
    const me = await meRes.json();
    const p = me.response ?? {};
    const email = p.email;
    const name = p.name || p.nickname || "";
    if (!email) return fail("네이버 계정 이메일 제공 동의가 필요합니다.");

    // 4) Supabase 사용자 생성(있으면 무시) → 매직링크 발급
    const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
    await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { name, provider: "naver" },
    }).catch(() => {});

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: APP_REDIRECT },
    });
    if (error || !data?.properties?.action_link) return fail("세션 발급 실패");

    // 5) 매직링크로 리다이렉트 → Supabase가 세션 설정 후 앱(login.html)으로 복귀
    return Response.redirect(data.properties.action_link, 302);
  } catch (e) {
    return fail(String(e));
  }
});
