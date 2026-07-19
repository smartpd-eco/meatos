# MEATOS - CLOVA OCR 연결 설정 가이드

**저장 위치**

`C:\MEATOS\docs\09_INFRASTRUCTURE\TASK_ORDER_012_CLOVA_OCR_SETUP.md`

---

## 목적

MEATOS OCR Pipeline을 실제 NAVER CLOVA OCR과 연결한다.

구성은 아래 흐름을 따른다.

```text
Browser
  -> Supabase Edge Function
  -> CLOVA OCR API
  -> OCR JSON
  -> Parser
  -> Dictionary
  -> Review Queue
```

브라우저에서는 Secret을 사용하지 않는다.

---

## 1. CLOVA OCR 준비

NAVER Cloud Platform에서 다음을 준비한다.

- AI Services
- CLOVA OCR
- General OCR

발급 정보

- OCR Invoke URL
- OCR Secret Key

---

## 2. Supabase Secret 등록

Supabase Dashboard의 Project Settings > Edge Functions > Secrets에 등록한다.

```env
CLOVA_OCR_API_URL=https://xxxxx.apigw.ntruss.com/...
CLOVA_OCR_SECRET_KEY=발급받은 Secret
CLOVA_OCR_PROVIDER=clova
```

Git 저장소에는 커밋하지 않는다.

---

## 3. 브라우저 / 서버 분리

브라우저는 아래 값만 읽는다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CLOVA_OCR_FUNCTION_URL`

서버 경로 또는 Edge Function만 아래 Secret을 읽는다.

- `CLOVA_OCR_API_URL`
- `CLOVA_OCR_SECRET_KEY`
- `CLOVA_OCR_PROVIDER`

---

## 4. Edge Function

Edge Function 이름은 `analyze-ocr`를 사용한다.

환경변수 예시:

```ts
const apiUrl = Deno.env.get("CLOVA_OCR_API_URL");
const secret = Deno.env.get("CLOVA_OCR_SECRET_KEY");
```

브라우저에서 Secret 접근은 금지한다.

---

## 5. 요청 흐름

```text
이미지 업로드
  -> Edge Function
  -> CLOVA OCR
  -> Raw JSON 저장
  -> Parser
  -> Dictionary
  -> Review Queue
```

---

## 6. Health Check

관리자 화면에서 확인할 항목:

- Provider
- Secret 상태
- 마지막 호출
- 평균 응답시간
- 성공률
- 실패건수

---

## 7. Fallback

Secret이 없으면 Mock OCR로 자동 전환한다.

API 실패 시에는 Retry 후 Review Queue로 보낸다.

Provider 장애가 나면 Mock Provider를 유지한다.

---

## 8. 검증

다음 항목을 확인한다.

- Secret 정상
- OCR 호출 성공
- Raw JSON 저장
- 품목 추출
- Dictionary 후보 생성
- Review Queue 생성
- Failure Learning 저장

---

## PM 체크리스트

- Secret 브라우저 노출 없음
- Git Commit 없음
- Edge Function 경유
- Mock 자동 전환
- OCR 결과 저장
- Parser 정상
- Dictionary 정상
- Review Queue 생성
- Failure Learning 생성

---

## 완료 기준

실제 거래명세서 1장을 촬영하여

```text
OCR -> Parser -> Dictionary -> Review
```

까지 자동으로 연결되면 Sprint 통과다.
