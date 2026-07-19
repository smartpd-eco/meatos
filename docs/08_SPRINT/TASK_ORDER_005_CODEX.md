
# TASK_ORDER_005_CODEX.md
# Official PM Order
## OCR → Product Dictionary Integration Sprint

Version: 1.0
Status: Approved
Date: 2026-07-11

---

# PM 검토

현재까지의 구현 수준은 매우 우수하다.

OCR Foundation은 계획한 범위 내에서 안정적으로 구성되고 있다.

하지만 다음 Sprint부터는
'기능 추가'보다
'엔진 연결'에 집중한다.

---

# Sprint 목표

OCR와 Product Dictionary를 실제 하나의 흐름으로 연결한다.

현재

OCR

↓

Review

에서 끝난다.

다음 Sprint는

OCR

↓

Dictionary Candidate

↓

Review

↓

Dictionary

↓

Product Master

까지 연결한다.

---

# 작업 1

Dictionary Candidate Engine

OCR 결과를 이용하여

후보 상품 Top5를 계산한다.

표시

- 표준상품명
- Confidence
- Alias 일치
- Source Count

자동 선택 금지

---

# 작업 2

Supplier Alias Learning

거래처별

동일 상품명을 학습한다.

예)

좋은축산

미삼

↓

국내산 냉장 삼겹살

공급사별 Alias는
공용 Alias와 분리 관리한다.

---

# 작업 3

Review UX

Review 화면에서

원본

↓

후보

↓

선택

↓

승인

흐름을 한 화면에서 처리한다.

---

# 작업 4

History

사용자가

후보를 선택하면

왜 선택되었는지 기록한다.

- Alias
- Supplier
- Confidence
- Source

---

# 작업 5

Learning

동일 선택이 반복되면

Dictionary Score 상승

자동 승인 기능은
아직 구현하지 않는다.

---

# 구현 제외

- 실제 OCR API
- AI 자동 승인
- Inventory
- 발주
- POS

---

# 완료 기준

□ Candidate 계산

□ Supplier Alias

□ Review UX

□ History 저장

□ Learning Score

---

# PM 요청

이번 Sprint부터는

'정확한 OCR'

보다

'정확한 상품 추천'

을 우선한다.

OCR는 글자를 읽는 기술이다.

MEATOS의 경쟁력은

읽은 글자를
올바른 표준상품으로
연결하는 기술이다.

여기에 프로젝트의 핵심 가치가 있다.
