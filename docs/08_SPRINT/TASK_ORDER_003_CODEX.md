
# TASK_ORDER_003_CODEX.md
# MEATOS Official Development Order #003

Version: 1.0
Status : Approved
Date   : 2026-07-11
Target : Codex

---

# Sprint 목표

이번 Sprint는 Product Dictionary의 운영 흐름을 완성한다.

새로운 기능을 늘리는 것이 아니라,
현재 구조를 하나의 데이터 파이프라인으로 연결한다.

---

# 현재 상태

완료

- Source Registry
- Import Queue
- Product Dictionary 구조
- Product Master 분리
- Review Queue
- Learning 기반

이제 각각의 기능을 연결한다.

---

# 작업 1

Source Registry CRUD

필수 기능

- 등록
- 수정
- 비활성
- 검색

Source Type

- 국가기관
- 공공기관
- 협회
- 논문
- 유통사
- 거래처
- 정육점

---

# 작업 2

Import Queue

추가 기능

- 승인
- 반려
- 보류

상태

NEW
↓

REVIEW

↓

APPROVED

↓

DICTIONARY

↓

MASTER

---

# 작업 3

Review 화면 개선

표시 항목

- 원본 상품명
- 추천 표준상품
- Confidence
- Source
- Supplier
- Attribute
- 승인/반려

---

# 작업 4

Product Dictionary

추가

- Confidence 표시
- Alias 개수
- Source Count
- 마지막 수정일

---

# 작업 5

Dashboard

요약 카드만 추가

- Source 수
- Queue 건수
- Review 대기
- Dictionary 수
- Master 수

그래프는 다음 Sprint.

---

# 구현 제외

- OCR
- POS Adapter
- Inventory
- 발주 추천
- AI 자동 차감

---

# 완료 기준

□ Source 등록 가능

□ Import Queue 승인 가능

□ Review 승인 가능

□ Dictionary 반영 가능

□ Master 생성 가능

□ Dashboard 확인 가능

---

# 완료 보고

반드시 보고

1. 생성 파일
2. 수정 파일
3. DB 변경
4. 테스트 결과
5. 스크린샷
6. 남은 이슈
7. 다음 Sprint 제안

---

# PM Message

이번 Sprint의 목적은 기능 추가가 아니다.

'Source → Queue → Review → Dictionary → Master'

이 흐름을 완성하는 것이다.

기능은 나중에도 만들 수 있지만
좋은 데이터 흐름은 처음부터 올바르게 만들어야 한다.
