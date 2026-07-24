# MEATOS 간편로그인 설정 가이드 (Google · Kakao · Naver)

기준: Supabase Auth. 목표 = 가입/로그인 최대한 쉽게, company_id는 파티션용으로 자동 발급(심사 없음).

## 공통값 (미리 복사)
- **Supabase 콜백(Redirect) URL**: `https://pkrsiqjzllyiafwpskll.supabase.co/auth/v1/callback`
- **앱 복귀 URL(redirectTo)**: `https://meatos.vercel.app/login.html`
- 설정 위치: Supabase 대시보드 → **Authentication → Providers**
- 각 provider 켠 뒤, `login.html` 의 `PROVIDERS_ENABLED` 에서 해당 항목을 `true` 로 바꾸면 버튼이 작동합니다.

---

## 1) Google (Supabase 기본 지원 · 가장 쉬움)

1. **Google Cloud Console**(console.cloud.google.com) → 프로젝트 생성/선택.
2. **API 및 서비스 → OAuth 동의 화면** → 외부(External) → 앱이름/이메일 입력 → 저장.
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 유형 **웹 애플리케이션**.
   - 승인된 리디렉션 URI에 **공통 콜백 URL** 붙여넣기.
4. 발급된 **클라이언트 ID / 클라이언트 보안 비밀** 복사.
5. Supabase → Authentication → Providers → **Google** 켜기 → ID/Secret 붙여넣기 → 저장.
6. `login.html`에서 `PROVIDERS_ENABLED.google = true`.

## 2) Kakao (Supabase 기본 지원 · 국내 필수)

1. **Kakao Developers**(developers.kakao.com) → 내 애플리케이션 → 애플리케이션 추가.
2. **앱 키**의 **REST API 키** 확인. **카카오 로그인** 활성화 ON.
3. **Redirect URI** 등록 → **공통 콜백 URL** 붙여넣기.
4. **보안 → Client Secret** 생성(사용 ON).
5. **동의항목**: 닉네임(profile_nickname)·계정 이메일(account_email) 등 최소 항목 설정.
6. Supabase → Providers → **Kakao** 켜기 → REST API 키(=Client ID) / Client Secret 붙여넣기 → 저장.
7. `login.html`에서 `PROVIDERS_ENABLED.kakao = true`.

## 3) Naver (Supabase 기본 미지원 · 커스텀 필요)

> 네이버는 Supabase 내장 provider가 아니라 바로 켤 수 없습니다. 두 가지 길:
- **권장(단기)**: 네이버는 나중에 붙이고 **Google·Kakao 먼저 오픈**(국내 정육점은 카카오면 충분).
- **정식(후속)**: 네이버 OAuth를 처리하는 **Edge Function**(로그인 시작/콜백)을 만들어 자체 세션 발급, 또는 Supabase의 커스텀 OIDC 연동. 별도 개발 필요 → Phase 2.
1. (준비) **Naver Developers**(developers.naver.com) → 애플리케이션 등록 → 네이버 아이디로 로그인 사용.
2. Callback URL은 우리 Edge Function 주소로 지정(후속 구축 시 안내).
3. 구축 완료 후 `login.html`에서 `PROVIDERS_ENABLED.naver = true`.

---

## 로그인 후 동작 (이미 구현됨 · 심사 없음)
1. 소셜 로그인 성공 → Supabase 세션 생성.
2. `login.html` 이 `account` 조회 → 없으면 **자동 생성**(`signup_company_account`): 회사(company_id=파티션키)+기본매장+계정.
3. 캐시 저장 후 홈으로 → **바로 사용**. 어떤 승인/심사도 없음.

## 체크
- [ ] Supabase에 Google/Kakao Provider 켬 + ID/Secret 입력
- [ ] 각 콘솔에 콜백 URL 등록
- [ ] `login.html` PROVIDERS_ENABLED 해당 항목 true + git push
- [ ] 테스트: 소셜 버튼 → 로그인 → 홈에 "🏪 회사명" 표시되면 성공
