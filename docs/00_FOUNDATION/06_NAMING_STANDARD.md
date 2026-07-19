# 06_NAMING_STANDARD.md

# MEATOS Naming Standard

**Version**: 1.0 **Author**: SmartPD **Status**: Active **Last Update**:
2026-07-10

------------------------------------------------------------------------

# 1. 목적

MEATOS 프로젝트에서 사용하는 모든 이름(폴더, 파일, DB, API, 컴포넌트,
변수)을 일관된 기준으로 관리한다.

------------------------------------------------------------------------

# 2. 기본 원칙

-   이름만 보고 역할을 알 수 있어야 한다.
-   축약어보다 의미를 우선한다.
-   동일한 개념은 항상 같은 이름을 사용한다.

------------------------------------------------------------------------

# 3. 프로젝트 폴더

``` text
docs/
apps/
services/
packages/
adapters/
ai/
```

역할이 섞이지 않도록 유지한다.

------------------------------------------------------------------------

# 4. 파일명

-   kebab-case 사용
-   영문 사용
-   역할 포함

예시

-   inventory-service.ts
-   supplier-api.ts
-   product-alias.ts

------------------------------------------------------------------------

# 5. 화면(Page)

-   inventory-page
-   purchase-page
-   supplier-page
-   dashboard-page

페이지명은 업무 기준으로 작성한다.

------------------------------------------------------------------------

# 6. 컴포넌트

PascalCase 사용

-   InventoryTable
-   ProductCard
-   SupplierDialog
-   PurchaseForm

------------------------------------------------------------------------

# 7. Database

Table : snake_case

예)

-   product_master
-   supplier_master
-   inventory_ledger
-   inventory_history
-   event_log

PK : id

FK : xxxx_id

------------------------------------------------------------------------

# 8. API

복수형 Resource 사용

GET /products

GET /suppliers

POST /inventory/inbound

POST /inventory/outbound

------------------------------------------------------------------------

# 9. Event 이름

과거형 사용

-   inventory.created
-   inventory.updated
-   inventory.outbound
-   purchase.created
-   pos.synced
-   ai.recommended

------------------------------------------------------------------------

# 10. Git Branch

main

develop

feature/alias-engine

feature/inventory

feature/pos-adapter

bugfix/inventory

hotfix/login

------------------------------------------------------------------------

# 11. Commit

docs:

feat:

fix:

refactor:

test:

chore:

------------------------------------------------------------------------

# 12. AI 명명 규칙

Core Engine

-   Product Engine
-   Inventory Engine
-   Event Engine
-   AI Engine

Plugin

-   POS Adapter
-   OCR Adapter
-   Solapi Adapter
-   Government Adapter

Core와 Plugin 이름을 혼용하지 않는다.

------------------------------------------------------------------------

# 13. 우리의 약속

좋은 이름은 최고의 문서다.

누가 봐도 이해되는 이름을 사용한다.
