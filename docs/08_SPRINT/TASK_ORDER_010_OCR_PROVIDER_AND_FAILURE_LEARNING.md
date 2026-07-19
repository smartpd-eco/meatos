
# TASK_ORDER_010_OCR_PROVIDER_AND_FAILURE_LEARNING.md
# MEATOS Official Development Order #010
## 실제 OCR Provider 연동 + 재촬영 판정 + Failure Learning

**Version**: 1.0  
**Status**: PM Approved  
**Target**: Codex  
**Owner**: SmartPD / Peter  
**Date**: 2026-07-12  
**Recommended Path**: `C:\MEATOS\docs\08_SPRINT\TASK_ORDER_010_OCR_PROVIDER_AND_FAILURE_LEARNING.md`

---

# 1. PM 결론

실제 OCR Provider API 연동은 시기상조가 아니다.

현재 MEATOS는 이미 다음 기반을 갖췄다.

- 이미지 업로드
- 전처리
- 원본 저장
- OCR Mock
- OCR Document Queue
- OCR Line Item
- Dictionary 매칭
- Review Queue
- Learning History
- Tenant 구조

따라서 지금은 실제 Provider를 한 번 연결해
Mock과 실데이터 사이의 차이를 확인해야 할 시점이다.

다만 이번 Sprint에서 완전한 운영 OCR을 만들지는 않는다.

```text
한 개 Provider
+ 한 개 실거래명세서
+ 서버 경유
+ Raw JSON 보존
+ Review 필수
```

형태의 최소 수직 통합(Thin Vertical Slice)만 구현한다.

---

# 2. 우선순위

이번 Sprint는 다음 세 축을 함께 진행한다.

## Priority A — 실제 OCR Provider 1개 연결

추천:

```text
NAVER CLOVA OCR General
```

이유:

- 한국어 문서 우선 검증에 적합
- 이미지 전체 텍스트와 좌표 정보 추출 가능
- 현재 거래명세서처럼 양식이 다양한 문서에 General OCR이 적합
- 공급사 양식이 반복되는 경우 추후 Template OCR 확장 가능

## Priority B — 재촬영 판정

OCR 호출 전에 사진 품질을 검사한다.

## Priority C — OCR Failure Learning Engine

실패를 삭제하지 않고
다음 인식 정확도를 높이는 학습 데이터로 축적한다.

---

# 3. Sprint 목표

```text
실거래명세서 촬영
→ 품질검사
→ 필요 시 재촬영
→ 이미지 전처리
→ CLOVA OCR 호출
→ Raw JSON 저장
→ 표/행 파싱
→ Dictionary 후보 생성
→ Review
→ Failure/Correction Learning
```

---

# 4. 실제 OCR Provider 연동 범위

## 4.1 Provider Adapter

다음 인터페이스를 유지한다.

```text
OcrProviderAdapter

- healthCheck()
- recognizeDocument()
- normalizeResponse()
- getProviderName()
- getProviderVersion()
```

구현:

```text
MockOcrProvider
ClovaOcrProvider
```

기존 Mock Provider는 삭제하지 않는다.

---

## 4.2 서버 경유

브라우저에서 CLOVA OCR API를 직접 호출하지 않는다.

```text
Frontend
→ Supabase Edge Function 또는 Server API
→ CLOVA OCR
```

금지:

- API Secret 브라우저 노출
- API Secret Git Commit
- API Secret Local Storage 저장
- 클라이언트에서 Provider Endpoint 직접 호출

---

## 4.3 환경변수

서버 전용:

```env
CLOVA_OCR_API_URL=
CLOVA_OCR_SECRET_KEY=
CLOVA_OCR_PROVIDER=clova
```

`.env.example`에는 Key 이름만 기록한다.

실제 값은 로컬 또는 Supabase Secret에만 저장한다.

---

# 5. 재촬영 판정 엔진

## 5.1 품질 검사 항목

OCR 호출 전에 다음을 검사한다.

- 문서 네 모서리 검출
- 문서 잘림 여부
- 해상도
- 흔들림/블러
- 밝기
- 대비
- 그림자
- 반사광
- 회전 각도
- 원근 왜곡
- 손가락/물체 가림
- 한 이미지 안의 복수 문서

---

## 5.2 재촬영 기준

다음 조건이면 OCR 호출 전에 재촬영을 권고한다.

```text
문서 잘림
심한 블러
합계/품목 영역 가림
해상도 부족
반사광이 주요 필드 침범
복수 문서 동시 촬영
```

재촬영이 불가능하면:

```text
FORCE_OCR
→ LOW_QUALITY
→ REVIEW_REQUIRED
```

로 진행한다.

---

## 5.3 품질 등급

```text
A 매우 선명
B 일반
C 낮은 품질
D 일부 훼손
E 인식 곤란
```

DB 저장 필드:

```text
quality_grade
quality_score
recapture_required
recapture_reason_codes
```

---

# 6. 공급사별 Template Learning

Codex 제안대로 공급사별 양식 학습은 추가한다.

단, 지금은 Template OCR Provider 기능에 종속시키지 않는다.

먼저 MEATOS 내부 Template Profile을 만든다.

## supplier_document_template

```text
id
tenant_id
supplier_id
template_code
template_name
document_type
sample_count
header_aliases jsonb
column_layout jsonb
anchor_words jsonb
expected_fields jsonb
quality_rules jsonb
is_active
created_at
updated_at
```

## 역할

- 공급사명 위치
- 거래일 위치
- 품목표 시작 위치
- 상품명 열
- 수량 열
- 단가 열
- 금액 열
- 합계 위치
- 이력번호 위치
- 자주 쓰는 Header Alias

같은 공급사의 문서가 반복될수록 파싱 정확도를 높인다.

---

# 7. OCR Failure Learning Engine

## 7.1 목적

OCR 실패를 단순 오류로 끝내지 않는다.

```text
실패
→ 원인 분류
→ 사용자 수정
→ 공급사/양식/품목 패턴 저장
→ 다음 처리 시 보정
```

---

## 7.2 신규 테이블

### ocr_failure_case

```text
id
tenant_id
ocr_document_id
ocr_line_item_id nullable
supplier_id nullable
template_id nullable
failure_type
raw_text
expected_text nullable
provider_name
provider_confidence
quality_grade
failure_reason_codes jsonb
image_region_path nullable
status
created_at
resolved_at nullable
```

### ocr_correction_history

```text
id
tenant_id
failure_case_id
before_text
after_text
selected_dictionary_id nullable
correction_type
corrected_by nullable
created_at
```

### ocr_pattern_learning

```text
id
tenant_id
supplier_id nullable
template_id nullable
pattern_type
source_pattern
target_pattern
sample_count
success_count
confidence
last_used_at
is_active
created_at
updated_at
```

---

## 7.3 Failure Type

```text
BLUR
LOW_RESOLUTION
SHADOW
GLARE
CROPPED
TORN
FOLDED
OCCLUDED
TABLE_DETECTION_FAILED
COLUMN_SHIFT
ROW_MERGE
ROW_SPLIT
CHARACTER_MISREAD
NUMBER_MISREAD
UNIT_MISREAD
PRODUCT_MATCH_FAILED
TOTAL_VALIDATION_FAILED
UNKNOWN
```

---

# 8. 훼손 문서 AI 보정 원칙

훼손된 글자를 기존 누적 데이터로 보정할 수 있다.

예:

```text
원본 OCR: 미ㅂ앞다리
공급사 과거 표현: 미박앞다리
Dictionary 후보: 미박 앞다리살
```

그러나 AI는 복원값을 사실처럼 확정하면 안 된다.

저장 구조:

```text
raw_text
reconstructed_text
reconstruction_confidence
reconstruction_basis
```

`reconstruction_basis` 예:

```text
SUPPLIER_HISTORY
TEMPLATE_PATTERN
DICTIONARY_ALIAS
NEIGHBORING_COLUMNS
PRICE_QUANTITY_CONTEXT
MANUAL_CORRECTION_HISTORY
```

정책:

```text
95 이상 → 빠른 확인
80~94 → Review 추천
80 미만 → 사용자 직접 확인
```

이번 Sprint에서는 자동 승인하지 않는다.

---

# 9. 계산 검증

OCR 결과를 업무 규칙으로 검증한다.

```text
수량 × 단가 ≈ 금액
품목 금액 합계 ≈ 공급가액
공급가액 + 세액 ≈ 총액
```

검증 실패 시:

```text
TOTAL_VALIDATION_FAILED
→ Review Queue
→ Failure Learning
```

공급사별 반올림/절사 규칙은 Template Profile에 저장한다.

---

# 10. 실전 테스트 데이터

첫 테스트는 실제 거래명세서 1장으로 시작한다.

그 후 동일 문서를 변형하여 비교한다.

```text
1. 원본 선명 사진
2. 10도 기울임
3. 그림자 추가
4. 일부 접힘
5. 품목명 일부 가림
6. 저해상도
7. 흑백
8. 원근 왜곡
```

같은 문서의 변형본을 사용하면
정답 기준이 같아 정확도 비교가 쉽다.

---

# 11. 평가 지표

## OCR

- 전체 문자 정확도
- 숫자 정확도
- 품목명 정확도
- 품목 행 개수 일치율
- 표 열 구분 정확도

## MEATOS

- Dictionary Top1 정확도
- Dictionary Top5 포함률
- 자동 보정 정확도
- Review 수정 횟수
- Failure 재발률
- 공급사 Template 적용 효과
- 평균 처리 시간
- 문서당 Provider 비용

---

# 12. API 연결 성공 기준

다음이 모두 충족되어야 한다.

- 실제 CLOVA 응답 수신
- HTTP 오류 처리
- Timeout 처리
- Provider Raw JSON 저장
- Provider 이름/버전 저장
- 원본 이미지 유지
- 품질 점수 저장
- OCR Line Item 생성
- Review Queue 연결
- API Secret 미노출
- 동일 문서 재처리 가능
- Mock Provider 유지

---

# 13. 이번 Sprint에서 하지 않는 것

- 여러 OCR Provider 동시 운영
- Azure/Google 운영 연결
- 자동 Provider Routing
- Global Dictionary 자동 수정
- OCR 결과 자동 입고 반영
- 자동 승인
- 대량 과금 테스트
- Production 배포
- Auth/RLS 변경
- POS/Inventory 연결

---

# 14. 구현 순서

```text
1. CLOVA OCR 계정/도메인 준비
2. Server/Edge Function Adapter 작성
3. API Secret 등록
4. Health Check
5. 실제 문서 1장 호출
6. Raw JSON 저장
7. 응답 Normalizer
8. Line Item 파서
9. 재촬영 판정
10. Supplier Template Profile
11. Failure Case 저장
12. Correction History 저장
13. Pattern Learning
14. Dictionary Candidate 연결
15. Review UI
16. KPI 및 테스트 보고
```

---

# 15. 완료 보고 형식

```md
## 실제 OCR 연결 결과

## 사용 Provider

## Environment / Secret 처리

## 실거래명세서 테스트 결과

## 품질 판정 및 재촬영 결과

## OCR Field / Line Item 결과

## Dictionary 매칭 결과

## Failure Case

## 사용자 수정 및 Learning 결과

## 보정 전후 비교

## 처리시간 / 비용

## 생성·수정 파일

## Build / Lint / Test

## 남은 문제

## 다음 Provider 비교 필요성
```

---

# 16. PM 최종 판단

API 연동은 아직 이르지 않다.

오히려 지금 연결해야 다음 사항을 실제로 알 수 있다.

- Mock과 실제 OCR 결과의 차이
- CLOVA 응답 구조
- 한국 거래명세서 표 인식 수준
- 품목 행 파싱 난이도
- 훼손 문서 한계
- Dictionary 보정의 실제 효과
- 비용과 처리시간

다만 전면 도입은 이르다.

따라서 이번 Sprint는:

> 실제 Provider 1개를 최소 범위로 연결하고, 재촬영 판정과 Failure Learning을 함께 검증하는 Sprint로 진행한다.

---

# PM Message

OCR가 실패하지 않는 시스템을 만드는 것이 목표가 아니다.

실패를 정확히 기록하고,
사람의 수정을 기억하며,
같은 실패를 반복하지 않는 시스템을 만드는 것이 목표다.
