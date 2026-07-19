# MEATOS OCR AI 최종 인수인계서
**파일명:** `OCR_FINAL_HANDOFF_PADDLE_GEMINI25_FLASH_VERCEL.md`  
**버전:** v2.1  
**작성일:** 2026-07-19  
**작성자:** Peter (PM)  
**인수 대상:** Dex / Gemini / Codex / 후속 개발 담당자  

---

## 1. 문서 목적

본 문서는 MEATOS 거래명세서 OCR 기능의 최종 아키텍처, 지금까지의 테스트 결과, Supabase Edge Function 및 Gemini 연동 상태, Vercel 모바일 배포 상태와 미해결 문제를 후속 담당자에게 인계하기 위한 문서다.

Dex 작업 토큰 소진으로 기존 테스트가 중단되었으므로, 이후 작업은 Codex 또는 Gemini 개발 환경에서 본 문서를 기준으로 이어간다.

---

## 2. 프로젝트 구분 원칙

MEATOS와 MEATMALL은 서로 다른 프로젝트다.

| 구분 | MEATOS | MEATMALL |
|---|---|---|
| 목적 | 정육점용 AI OCR·재고·매입 ERP | 축산물 판매·주문·벤더 쇼핑몰 |
| 운영 주소 | `https://meatos.vercel.app/` | MEATMALL 별도 운영 주소 |
| Supabase 프로젝트 | SmartPD Labs / MEATOS | 별도 프로젝트 |
| OCR 기능 | 포함 | 기본 범위 아님 |
| 작업 폴더 | `C:\MEATOS` | MEATOS 폴더 안에 혼합 금지 |

후속 담당자는 MEATOS 작업 중 MEATMALL 저장소, 장바구니, 벤더 기능 또는 배포 구성을 수정하지 않는다.

---

## 3. MEATOS OCR 목표

정육점 거래명세서를 휴대폰으로 촬영하여 다음 데이터를 자동 추출한다.

- 거래일자
- 공급자 및 공급받는 자
- 품목명
- 원산지
- Box 수량
- 중량(kg)
- 단가
- 공급가액
- 세액
- 총금액
- 이력번호
- 부위명칭
- 등급 및 도축장 정보

최종 목적은 단순 문서 보존을 넘어 다음 업무로 연결하는 것이다.

```text
거래명세서 촬영
→ OCR 인식
→ AI 보정
→ 사용자 검토
→ 표준 품목 치환
→ 매입 등록
→ 재고 반영
→ ERP 저장
```

---

## 4. OCR 아키텍처 변경 이력

### 4.1 1차 구조

```text
OpenCV
→ CLOVA OCR
→ Parser
→ ERP
```

문제점:

- 호출 비용 발생
- Table Extraction 설정 의존
- 표 인식 옵션 미활성 시 오류 발생
- 문서 양식별 편차 존재
- 외부 서비스 의존도가 높음

### 4.2 2차 구조

```text
OpenCV
→ PaddleOCR
→ Parser
→ ERP
```

확인 결과:

- 문자 자체는 상당 부분 인식 가능
- 글자 좌표와 Bounding Box 확보 가능
- 거래명세서 표의 행·열 복원에서 오류 발생
- 품목명, 이력번호, Box, 중량, 단가, 금액 매핑이 불안정함

결론:

> PaddleOCR의 문자 인식보다 Parser의 행·열 복원과 ERP 필드 매핑이 핵심 병목일 가능성이 높다.

### 4.3 3차 구조

```text
OpenCV
→ PaddleOCR
→ Vision LLM
→ Parser
→ ERP
```

문제점:

- Vision LLM이 문서 전체를 다시 읽으면 속도가 느려짐
- 불필요한 토큰 사용 증가
- OCR와 LLM 결과가 충돌할 수 있음
- 전체 결과가 나올 때까지 화면을 막으면 사용자 체감 속도가 나빠짐

---

## 5. 최종 확정 구조

```text
모바일 카메라
→ 촬영 품질 검사
→ OpenCV 최소 보정
→ PaddleOCR 문자·좌표 추출
→ 1차 핵심 결과 화면 표시
→ 규칙 기반 Parser
→ 숫자·합계 Validation
→ 오류 필드만 Gemini 2.5 Flash Vision 보정
→ 재검산
→ 사용자 최종 확인
→ 매입·재고 반영
```

### 핵심 원칙

1. PaddleOCR는 1차 문자 및 좌표 추출을 담당한다.
2. Gemini 2.5 Flash는 OCR 전체를 대체하지 않는다.
3. Gemini는 오류가 있거나 신뢰도가 낮은 필드만 보정한다.
4. OCR 완료 후 화면을 먼저 표시한다.
5. AI 검증 중 화면 전체를 다시 호출하지 않는다.
6. 수정된 필드만 부분 업데이트한다.
7. 사용자 승인 전에는 재고에 자동 반영하지 않는다.

---

## 6. 엔진별 역할

### 6.1 OpenCV

담당:

- 회전 보정
- 원근 보정
- 밝기 및 대비 조절
- 문서 영역 Crop
- 필요 시 흑백 및 선명도 보정

주의:

과도한 이진화, 샤프닝, 노이즈 제거는 한글 획, 쉼표, 소수점 및 작은 숫자를 훼손할 수 있다.

원본을 반드시 보존하고 다음 이미지를 비교한다.

```text
A. 원본
B. 회전·원근 보정본
C. 대비 강화본
```

### 6.2 PaddleOCR

담당:

- 문자 인식
- Bounding Box 생성
- 좌표 추출
- OCR 신뢰도 반환

PaddleOCR 결과는 단순 문자열로 버리지 않고 좌표를 포함한 Raw JSON으로 보존해야 한다.

예시:

```json
{
  "text": "43.60",
  "confidence": 0.96,
  "bbox": {
    "x": 810,
    "y": 532,
    "width": 92,
    "height": 31
  }
}
```

### 6.3 Parser

담당:

- 같은 Y축의 문자를 동일 행으로 그룹화
- 표 헤더 기준 열 위치 추정
- 여러 줄 품목명을 한 품목으로 결합
- 이력번호를 품목과 연결
- Box 수량과 kg 중량 분리
- 단가와 공급가액 열 매핑
- 문서별 컬럼 차이 보정

현재 가장 우선적으로 보완해야 할 영역이다.

### 6.4 Gemini 2.5 Flash Vision

담당:

- PaddleOCR 오인식 수정
- 표 행·열 관계 재검토
- 누락된 품목명 또는 숫자 확인
- 정육 유통 문맥 기반 품목 후보 제시
- 지정된 JSON Schema에 맞춘 보정 결과 반환

Gemini에 전달할 자료:

```text
1. 원본 이미지
2. 보정 이미지
3. 오류 영역 Crop 이미지
4. PaddleOCR 텍스트
5. PaddleOCR 좌표
6. Parser의 기존 JSON
7. 숫자 검산 오류
```

Gemini가 이미지에서 확인할 수 없는 값은 `null`로 반환하도록 한다.

### 6.5 Validation

필수 검산:

```text
중량(kg) × kg 단가 = 공급가액
품목별 공급가액 합계 = 문서 합계금액
공급가액 + 세액 = 총금액
사업자등록번호 자릿수 확인
날짜 형식 확인
이력번호 형식 확인
```

주의:

거래명세서의 `Box 수량`과 `중량(kg)`은 다른 필드다.

예:

```text
3 Box
43.60kg
단가 7,500원
공급가액 327,000원
```

올바른 검산:

```text
43.60 × 7,500 = 327,000
```

잘못된 검산:

```text
3 × 7,500 = 22,500
```

---

## 7. 좋은축산유통 거래명세서 테스트 결과

테스트 이미지 상태:

- 해상도 충분
- 초점 양호
- 글자 선명
- 표 테두리 확인 가능
- 약간의 촬영 기울기 존재
- 일부 조명 반사 존재

전문가 판단:

> 해당 이미지는 PaddleOCR가 인식하기 어려운 수준이 아니다. 문자 인식보다 표 구조 복원, 행·열 그룹핑, 품목과 이력번호 연결, Box·중량·단가·금액 매핑을 우선 점검해야 한다.

확인한 주요 품목 데이터:

| 중량(kg) | 단가 | 공급가액 | 검산 |
|---:|---:|---:|---|
| 43.60 | 7,500 | 327,000 | 일치 |
| 12.90 | 7,000 | 90,300 | 일치 |
| 12.40 | 7,000 | 86,800 | 일치 |
| 82.10 | 1,200 | 98,520 | 일치 |
| 322.70 | 5,000 | 1,613,500 | 일치 |
| 18.20 | 5,000 | 91,000 | 일치 |

---

## 8. 육기통 앱 비교 테스트

육기통 앱은 거래명세서 촬영 후 약 3초 내외로 다음 핵심 데이터를 표시한다.

- 거래연월일
- 식육 또는 포장육 종류
- 물량(kg)
- 원산지
- 부위명칭
- 등급
- 도축장명

육기통은 문서 보존 및 신고용 핵심 데이터 추출 중심이며, 다음 처리는 하지 않는 것으로 보인다.

- 매입금액 계산
- 재고 자동 반영
- 매출 계산
- 공급가액 검산
- 표준 품목 치환
- ERP 전체 연결

MEATOS도 3초 체감 속도를 달성하려면 화면 표시와 검증을 분리한다.

```text
1차: PaddleOCR 핵심 결과를 2~3초 안에 표시
2차: Gemini 보정 및 검산을 백그라운드에서 실행
3차: 오류 필드만 화면에서 부분 수정
4차: 사용자 승인 후 ERP 반영
```

---

## 9. 사용자 화면 처리 원칙

### 정상 처리

```text
사진 촬영
→ OCR 인식 완료
→ 핵심 결과 표시
→ AI 검증 중
→ 검증 완료
```

상태 배지 예시:

```text
🟡 OCR 인식 완료
🟠 AI 검증 중
🟢 검증 완료
```

### AI가 값을 수정한 경우

화면 전체를 다시 로드하지 않는다.

예:

```text
기존 중량: 43.8
AI 보정: 43.6
```

해당 필드만 변경하고 다음 표시를 추가한다.

```text
43.6  ✓ AI 수정
```

### AI도 확신하지 못하는 경우

```text
미후지
[사용자 확인 필요]
[수정]
```

불확실한 값을 임의 확정하지 않고 사용자에게 확인을 요청한다.

---

## 10. Supabase 및 Gemini 연결 상태

### Supabase 프로젝트

```text
Organization: SmartPD Labs
Project: MEATOS
Project Ref: pkrsiqjzllyiafwpskll
Region: Northeast Asia (Seoul)
```

### Supabase Edge Function

함수명:

```text
analyze-invoice
```

배포 결과:

```text
Deployed Functions on project pkrsiqjzllyiafwpskll:
analyze-invoice
```

함수 주소:

```text
https://pkrsiqjzllyiafwpskll.supabase.co/functions/v1/analyze-invoice
```

### Gemini Secret

Supabase Edge Function Secrets에 다음 이름으로 등록했다.

```text
GEMINI_API_KEY
```

함수 내부 사용 방식:

```typescript
const apiKey = Deno.env.get("GEMINI_API_KEY");
```

API Key는 프론트엔드, GitHub, 공개 환경변수 또는 코드에 직접 포함하지 않는다.

---

## 11. 현재 Vercel 운영 배포 상태

### 운영 테스트 주소

```text
https://meatos.vercel.app/
```

MEATOS는 위 주소로 Vercel 배포되어 있으며, 최종 모바일 테스트는 사용자의 실제 휴대폰에서 진행해야 한다.

### 현재 확인된 문제

로컬 또는 개발 환경에서 수정된 내용이 `https://meatos.vercel.app/`에 반영되지 않는 현상이 발생했다.

가능한 원인:

1. 수정한 로컬 폴더와 Vercel에 연결된 Git 저장소가 다름
2. Vercel이 다른 브랜치를 Production Branch로 사용 중
3. 수정 파일을 커밋·푸시하지 않아 자동 배포가 시작되지 않음
4. Vercel Root Directory가 실제 앱 폴더와 다름
5. Build Command 또는 Output Directory 설정이 현재 프로젝트와 불일치
6. Vercel 환경변수와 로컬 환경변수가 다름
7. 배포는 성공했지만 브라우저 또는 PWA 캐시가 이전 버전을 표시
8. Service Worker가 이전 정적 파일을 캐싱
9. Preview Deployment만 생성되고 Production 배포가 갱신되지 않음
10. `meatos.vercel.app`이 다른 Vercel 프로젝트 또는 이전 저장소에 연결됨

---

## 12. Vercel 배포 진단 순서

### STEP 1. Vercel 프로젝트 확인

Vercel Dashboard에서 다음을 확인한다.

```text
Project Name: MEATOS
Production Domain: meatos.vercel.app
Connected Git Repository: 실제 MEATOS 저장소
Production Branch: main 또는 실제 운영 브랜치
Root Directory: 실제 프론트엔드 앱 위치
```

MEATMALL 저장소 또는 다른 프로젝트가 연결되어 있으면 안 된다.

### STEP 2. 현재 배포 커밋 확인

Vercel의 최근 Production Deployment에서 다음 정보를 확인한다.

- 배포된 Git Commit SHA
- Commit Message
- Branch
- 배포 시간
- Build 로그
- 배포 상태

로컬 최신 커밋과 Vercel Production Deployment의 커밋 SHA가 같은지 비교한다.

### STEP 3. Git 상태 확인

로컬에서:

```powershell
cd C:\MEATOS
git status
git branch --show-current
git remote -v
git log --oneline -5
```

확인 사항:

- 수정 파일이 아직 untracked 또는 modified 상태인지
- 현재 브랜치가 운영 브랜치인지
- 원격 저장소가 MEATOS 저장소인지
- 최신 커밋이 원격으로 푸시되었는지

주의:

커밋·푸시·운영 배포는 사용자 승인 후 진행한다.

### STEP 4. Vercel 설정 확인

Vercel Dashboard:

```text
Settings
→ Build and Deployment
```

확인 항목:

- Framework Preset
- Root Directory
- Build Command
- Output Directory
- Install Command
- Node.js Version
- Production Branch

프로젝트가 Vanilla HTML/CSS/JS라면 빌드가 필요 없는 구조일 수 있다. React, Vite 또는 Next.js라면 해당 프레임워크 설정과 실제 폴더 구조를 일치시켜야 한다.

### STEP 5. 환경변수 확인

Vercel Dashboard:

```text
Settings
→ Environment Variables
```

확인:

- Supabase URL
- Supabase Anon Key
- Edge Function 호출 주소
- Production 환경에 실제 값이 등록되었는지
- 변수명이 코드와 정확히 일치하는지

Gemini API Key는 Vercel에 넣지 않고 Supabase Secret에서만 관리한다.

### STEP 6. PWA 및 브라우저 캐시 확인

휴대폰에서 이전 화면이 계속 보이면 다음 순서로 확인한다.

1. Chrome에서 `https://meatos.vercel.app/` 직접 접속
2. 설치된 PWA가 있다면 삭제
3. Chrome 사이트 설정에서 저장 데이터 삭제
4. 브라우저 완전 종료 후 재접속
5. Vercel Deployment URL로 직접 접속하여 최신 버전 비교
6. Service Worker 버전 또는 캐시 이름 변경
7. 새 배포 시 오래된 캐시를 제거하도록 구현

PWA는 새 배포가 완료되어도 기존 Service Worker가 이전 화면을 유지할 수 있다.

### STEP 7. 강제 재배포

코드와 Git 연결이 정상인데 Production이 갱신되지 않으면 Vercel Dashboard에서 최근 정상 배포를 선택하여 Redeploy한다.

단, 다음 조건을 먼저 확인한다.

- 올바른 Git 저장소
- 올바른 커밋
- 올바른 Production Branch
- 올바른 Root Directory
- 운영 환경변수 등록 완료

잘못된 커밋을 재배포하면 이전 버전이 그대로 유지된다.

---

## 13. Vercel 모바일 최종 테스트 시나리오

최신 코드가 `https://meatos.vercel.app/`에 반영된 후 실제 휴대폰에서 아래 순서로 테스트한다.

### 테스트 1. 기본 접속

```text
meatos.vercel.app 접속
→ 최신 UI 버전 확인
→ 로그인 확인
→ 카메라 권한 확인
```

### 테스트 2. 거래명세서 촬영

```text
거래명세서 촬영
→ 이미지 미리보기
→ analyze-invoice 호출
→ 404가 발생하지 않는지 확인
```

### 테스트 3. 처리 상태

```text
OCR 인식 완료
→ 핵심 필드 표시
→ AI 검증 중
→ 검증 완료
```

### 테스트 4. 추출 필드

최소 확인 값:

- 거래일자
- 공급자
- 품목명
- Box 수량
- 중량
- 단가
- 공급가액
- 이력번호

### 테스트 5. 검산

```text
중량 × 단가 = 공급가액
품목 공급가액 합계 = 총금액
```

### 테스트 6. 사용자 수정

오류 필드 수동 수정이 가능한지 확인한다.

### 테스트 7. 저장 제어

사용자 승인 전 재고가 자동 반영되지 않는지 확인한다.

---

## 14. 필수 로그 및 산출물

테스트 문서 1건마다 다음 결과를 남긴다.

```text
01_original.jpg
02_opencv_corrected.jpg
03_paddle_raw.json
04_rows_and_columns.json
05_parsed_invoice.json
06_validation_result.json
07_gemini_request_summary.json
08_gemini_response.json
09_final_invoice.json
10_mobile_screen_result.png
```

보안상 API Key, JWT, Supabase Secret 값은 로그에 기록하지 않는다.

---

## 15. HTTP 오류 판별표

| 상태 | 의미 | 우선 확인 |
|---|---|---|
| 404 | 함수 미배포 또는 잘못된 프로젝트 URL | Edge Function 주소, Vercel 환경변수 |
| 401 | 인증 토큰 문제 | Supabase 세션, Authorization |
| 400 | 요청 데이터 오류 | 이미지 Base64, MIME type, JSON 형식 |
| 413 | 이미지 크기 초과 | 모바일 이미지 압축 |
| 429 | Gemini 호출 한도 초과 | API 사용량, 재시도 제한 |
| 500 | 함수 또는 Secret 오류 | Edge Function Logs |
| 200 | 정상 응답 | 반환 JSON 및 UI 매핑 |

---

## 16. 후속 담당자 우선순위

### 우선순위 1

`https://meatos.vercel.app/`이 실제 최신 MEATOS Git 저장소와 연결되어 있는지 확인한다.

### 우선순위 2

최신 수정 코드가 어떤 브랜치와 커밋에 있는지 확인한다.

### 우선순위 3

Vercel Production Deployment의 Commit SHA와 비교한다.

### 우선순위 4

휴대폰 PWA 및 Service Worker 캐시를 제거하고 최신 화면을 확인한다.

### 우선순위 5

모바일에서 `analyze-invoice`를 실제 호출하여 Supabase Edge Function 로그를 확인한다.

### 우선순위 6

PaddleOCR Raw → Parser → Gemini → 최종 JSON 중 최초 오류 발생 지점을 찾는다.

---

## 17. 완료 및 미완료 현황

### 완료

- OpenCV 전처리 구조
- PaddleOCR 적용 방향
- Gemini 2.5 Flash 보정 구조 확정
- Gemini API Key 발급
- Supabase `GEMINI_API_KEY` Secret 등록
- Supabase MEATOS 프로젝트 CLI 연결
- `analyze-invoice` Edge Function 배포
- 원격 함수 404 원인 해소 준비
- 운영 도메인 `https://meatos.vercel.app/` 확보

### 미완료 또는 검증 필요

- Vercel 최신 코드 반영 여부
- Vercel 연결 Git 저장소 및 Production Branch 확인
- Root Directory 및 Build 설정 검증
- PWA Service Worker 캐시 갱신
- 실제 휴대폰 카메라 촬영 테스트
- 모바일 → Edge Function 요청 확인
- Gemini 응답 JSON 확인
- Parser 행·열 복원 보완
- Box 수량과 kg 중량 분리 검증
- 사용자 승인 후 재고 반영 테스트
- 20~100장 실거래명세서 정확도 측정

---

## 18. 배포 승인 범위 원칙

후속 담당자는 다음 작업을 사용자 확인 없이 수행하지 않는다.

- Git commit
- Git push
- Vercel Production 배포
- Supabase 운영 DB 구조 변경
- DB 삭제 또는 초기화
- Auth 구조 변경
- RLS 정책 변경
- 환경변수 삭제 또는 값 교체
- 대량 파일 삭제

일반적인 코드 수정, Parser 보완, 빌드 오류 수정, 라우팅 및 화면 연결은 기존 프로젝트 규칙에 따라 진행 가능하다.

---

## 19. 최종 결론

MEATOS OCR 최종 구조는 다음으로 확정한다.

```text
OpenCV
→ PaddleOCR
→ Parser
→ Validation
→ Gemini 2.5 Flash 오류 필드 보정
→ 재검산
→ 사용자 승인
→ ERP 반영
```

현재 OCR 엔진 조합은 육기통 수준의 핵심 필드 추출을 약 3초 전후로 표시할 수 있는 구조적 가능성이 있다.

다만 실제 체감 속도와 정확도를 확보하려면 다음을 분리해야 한다.

```text
빠른 1차 화면 표시
≠
AI 최종 검증
≠
재고 및 매입 반영
```

현재 가장 시급한 문제는 OCR 모델 교체가 아니라 다음 두 가지다.

1. Parser와 Validation의 정확도
2. 최신 수정 코드가 `https://meatos.vercel.app/`에 반영되지 않는 배포 경로 문제

후속 담당자는 먼저 Vercel Production이 어느 저장소, 브랜치, Root Directory 및 커밋을 사용하고 있는지 확인한 뒤 실제 휴대폰 테스트를 재개한다.

---

## 20. 인수인계 상태

```text
OCR Architecture: 확정
Gemini Secret: 등록 완료
Supabase Function: 배포 완료
Vercel Production URL: 운영 중
Latest Code Reflection: 미확인
Mobile OCR Test: 대기
Overall Status: READY FOR DEPLOYMENT DIAGNOSIS AND MOBILE TEST
```

---

**END OF HANDOFF**
