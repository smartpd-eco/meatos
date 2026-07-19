
# TASK_ORDER_004_CODEX.md
# PM Review Order - OCR Foundation Hardening

Version: 1.0
Date: 2026-07-11
Status: Approved

---

# PM 검토 결과

현재 Sprint 결과는 매우 양호하다.

완료된 사항

- OCR Provider Registry 구조
- OCR Document Queue
- Mock OCR 흐름
- Review 흐름
- 테스트 통과

다만 운영 가능한 수준이 되기 위해서는
다음 항목이 반드시 보완되어야 한다.

---

# Priority 1 (필수)

## 1. OCR 상태(State Machine) 고정

상태는 아래 순서만 허용한다.

CAPTURED
↓

UPLOADED
↓

OCR_PENDING
↓

OCR_COMPLETED
↓

PARSE_COMPLETED
↓

REVIEW_REQUIRED
↓

APPROVED

↓

POSTED

실패 상태

OCR_FAILED
PARSE_FAILED

---

## 2. Retry 정책

API 실패

자동 재시도

- 1회
- 5초
- 30초

이후 Review Queue 이동

무한 재시도 금지

---

## 3. 원본 보존

반드시 분리 저장

- Original Image
- OCR Raw JSON
- Parsed JSON
- Review Result

원본 수정 금지

---

# Priority 2

## OCR 품질 점수

Provider 점수와 별개로

MEATOS Score 생성

평가

- 글자
- 표
- 계산
- Dictionary
- Supplier Alias

---

## 계산 검증

자동 확인

수량 × 단가

=

금액

공급가

+

세액

=

합계

불일치 시 Review

---

## 문서 중복 검사

동일 거래명세서 업로드 방지

기준

- File Hash
- 공급사
- 거래일
- 합계금액

---

# Priority 3

Dashboard 추가

표시

- OCR 성공률
- 평균 Confidence
- Review 비율
- 재촬영 비율
- 평균 처리시간

---

# 구현 제외

- 실제 OCR API 연결
- Production 배포
- AI 자동 승인
- OCR Engine 변경

---

# 완료 보고

1. 생성 파일
2. 수정 파일
3. 테스트
4. 화면
5. 남은 이슈

---

# PM Message

이번 Sprint는 OCR을 만드는 것이 아니라

'신뢰할 수 있는 OCR 파이프라인'

을 만드는 단계이다.

정확도보다 중요한 것은

항상 같은 방식으로

안전하게 처리되는 구조이다.
