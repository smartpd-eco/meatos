
# 36_DATA_QUALITY_SPRINT.md
# MEATOS Sprint 003 (Planning)
## Data Quality Sprint

Version: 1.0
Status: Planned
Date: 2026-07-11

---

# Sprint 목적

이 Sprint의 목표는 새로운 기능을 만드는 것이 아니다.

"좋은 데이터를 좋은 데이터로 유지하는 시스템"을 만드는 것이다.

---

# 왜 필요한가

MEATOS의 경쟁력은 코드보다 데이터에 있다.

Product Dictionary가 성장할수록
AI의 품질도 함께 성장한다.

---

# Codex 작업

## 1. Data Quality Dashboard

표시 항목

- Source 개수
- 거래처 개수
- Dictionary 개수
- Alias 개수
- Review 대기
- 승인율

---

## 2. Dictionary Health

추가

- Alias 없는 상품
- Source 없는 상품
- Confidence 낮은 상품
- 중복 후보

---

## 3. Duplicate Check

자동 검사

- 동일 표준상품
- 유사 Alias
- 중복 Dictionary
- 중복 Source

삭제하지 않고 Review로 보낸다.

---

## 4. Source Trace

모든 Dictionary는

- 최초 등록 출처
- 등록일
- 마지막 수정일
- 승인자

를 확인할 수 있어야 한다.

---

## 5. Validation Rule

필수값 누락

- Species
- Part
- Origin
- Storage

누락 시 저장 금지.

---

# 구현 제외

- OCR
- POS
- Inventory
- AI 발주
- 통계 고도화

---

# 완료 기준

□ Data Quality Dashboard

□ Duplicate Check

□ Dictionary Health

□ Source Trace

□ Validation Rule

---

# Peter 역할

- 국가 기준 검증
- 중복 정책 검토
- Dictionary 품질 관리

---

# PM 역할

- 현장 데이터 검증
- 신규 거래처 확보
- Review 승인

---

# PM Message

데이터가 많다고 좋은 AI가 만들어지지 않는다.

좋은 데이터가 꾸준히 쌓일 때
좋은 AI가 만들어진다.

이번 Sprint는 기능보다 품질을 만든다.
