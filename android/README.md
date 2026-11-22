# 정육비서 안드로이드 앱 (kr.meatos.app)

웹(https://meatos.vercel.app)을 앱 안에서 여는 WebView 앱입니다. 웹을 고치면 앱도 바로 바뀌므로,
앱 파일은 **앱 자체를 고칠 때만** 다시 만들면 됩니다.

## 앱에 들어간 기능
- 첫 화면(스플래시), 뒤로가기(웹 페이지 뒤로 → 더 없으면 닫기), 당겨서 새로고침, 오프라인 안내·다시 시도
- 사진 올리기: 거래명세서 촬영·라벨 사진에서 "카메라로 찍기 / 사진 고르기"
- 전화·문자·카카오톡 등 외부 링크는 해당 앱으로 연결
- 구글 로그인: 구글 정책상 앱 내부에서 막혀 있어 외부 브라우저로 로그인 후 앱으로 돌아옴
  (Supabase → Authentication → URL Configuration → Redirect URLs 에 `kr.meatos.app://**` 등록 필요)
- Android 16(API 36) 대상, Android 7.0 이상 설치 가능

## 빌드 방법 (GitHub에서 자동)
1. 최초 1회: 저장소 Settings → Secrets and variables → Actions 에 2개 등록
   - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` (값: `android/keystore/GitHub_Secrets_등록값.txt`)
2. `android/` 폴더를 고쳐 push 하면 자동 빌드. 또는 GitHub → Actions → Android build → Run workflow
3. 끝나면 실행 화면 맨 아래 Artifacts 에서 `meatos-android-번호` 내려받기
   - `app-release.aab` : 구글 플레이 업로드용
   - `app-release.apk` : 휴대폰 직접 설치(테스트)용

## 서명 키 (중요)
- `android/keystore/` 폴더는 깃에 올라가지 않습니다. **USB·개인 클라우드에 따로 백업**하세요.
- 구글 플레이에서는 "Play 앱 서명"을 사용합니다(기본값). 이 키는 업로드용이라 잃어버려도 재설정 요청이 가능합니다.

## PC에서 직접 빌드하고 싶을 때 (선택)
안드로이드 스튜디오 설치 → `android` 폴더 열기 → Build → Generate Signed App Bundle.
`keystore/keystore.properties` 가 있으면 명령줄 `gradlew bundleRelease` 도 자동 서명됩니다.
