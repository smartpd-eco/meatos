
# TASK_ORDER_002_CODEX.md
# MEATOS Official Development Order #002

Version: 1.0
Status: Active
Target: Codex
Date: 2026-07-11

---

# Sprint 목표

실제 유통 데이터를 기반으로
Product Engine을 완성한다.

이번 Sprint에서는 새로운 기능을 늘리지 않는다.

---

# 작업 1 : Product Source

- 좋은축산 Excel Import
- 원본 데이터 100% 보존
- Import Batch 관리
- Source Row 저장

완료조건
- 원본 수정 없음

---

# 작업 2 : Product Attribute

구현

- Species
- Category
- Part
- Processing
- Skin
- Bone
- Storage
- Origin
- Grade
- Unit

Attribute 기반으로 Product를 생성한다.

---

# 작업 3 : Product Master

- CRUD
- 검색
- 활성/비활성
- 표준상품 관리

상품명보다 Attribute를 우선한다.

---

# 작업 4 : Alias Engine

- Alias CRUD
- Supplier Alias
- Review Queue 연결

추측하지 않는다.

---

# 작업 5 : Review Queue

자동 판단이 어려운 데이터는

Review Queue로 이동한다.

사람이 최종 승인한다.

---

# 작업 6 : Learning 준비

AI_LEARNING_ENGINE.md 기준

- Learning Table
- Learning History

구조만 구현한다.

---

# 구현 제외

- OCR
- POS
- AI 자동 발주
- 재고 차감
- Dashboard 고도화

---

# 완료 보고

반드시 아래 내용을 포함한다.

1. 생성 파일
2. 수정 파일
3. DB 변경
4. 테스트 결과
5. 미구현 항목
6. 위험 요소
7. 다음 Sprint 제안

---

# 개발 원칙

- Foundation 준수
- Sprint 범위 준수
- 원본 데이터 수정 금지
- Product Master 중심 개발
- Review Queue 유지

---

# PM 최종 메시지

이번 Sprint의 성공은
기능 개수가 아니라
Product Engine의 안정성이다.

Sprint를 끝내고
다음 Sprint로 간다.
