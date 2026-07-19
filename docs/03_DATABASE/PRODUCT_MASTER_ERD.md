
# PRODUCT_MASTER_ERD.md
# MEATOS Product Master ERD (Sprint 001)

**Version**: 1.0
**Author**: SmartPD / Peter
**Status**: Ready
**Target**: Codex
**Last Update**: 2026-07-10

---

# 목적

본 문서는 Sprint 001에서 구현할 Product Engine의 데이터 구조를 정의한다.

이번 Sprint에서는 Product Master를 중심으로 최소한의 테이블만 구현한다.

---

# ERD

Product Master
│
├── Product Alias
│
├── Supplier Alias
│
└── Supplier Master

Inventory는 다음 Sprint에서 연결한다.

---

# 1. product_master

PK : product_id

주요 컬럼

- product_code
- standard_name
- category
- species
- part
- processing_type
- skin_type
- bone_type
- storage_type
- origin
- grade
- brand
- unit
- active
- created_at
- updated_at

원칙

- 표준상품은 중복 생성하지 않는다.
- 하나의 Product ID는 하나의 표준상품만 가진다.

---

# 2. product_alias

PK : alias_id

FK : product_id

컬럼

- raw_name
- normalized_name
- confidence
- verified
- use_count

역할

동일 상품의 다양한 표현을 저장한다.

---

# 3. supplier_master

PK : supplier_id

컬럼

- supplier_name
- business_no
- manager
- phone
- active

---

# 4. supplier_alias

PK : supplier_alias_id

FK

- supplier_id
- product_id

컬럼

- supplier_raw_name
- verified
- last_used_at

역할

공급처별 상품명을 표준상품과 연결한다.

---

# 관계

product_master (1)

↓

product_alias (N)

↓

supplier_alias (N)

↓

supplier_master (1)

---

# Sprint 001 제외

- inventory_master
- inventory_ledger
- inventory_history
- review_queue
- alias_memory
- event_log

위 항목은 다음 Sprint에서 구현한다.

---

# 개발 원칙

1. DB는 단순하게 시작한다.
2. 확장성을 고려한다.
3. 불필요한 컬럼은 추가하지 않는다.
4. Foundation 문서를 우선한다.

---

# PM Note

2026-07-10

오늘 결정한 사항

Sprint 001은 Product Engine만 구현한다.

좋은 아이디어가 떠오르더라도 구조를 흔들지 않는다.

필요한 기능은 PM Note에 기록하고 Sprint 종료 후 검토한다.

> 완벽한 ERD보다 성장 가능한 ERD를 만든다.
