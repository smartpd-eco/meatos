# Sprint 001 Product Engine PRD

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Target**: Codex  
**Status**: Active  
**Last Update**: 2026-07-10  
**Related Docs**:

- `docs/00_FOUNDATION/01_MEATOS_CONSTITUTION.md`
- `docs/00_FOUNDATION/02_PROJECT_VISION.md`
- `docs/00_FOUNDATION/03_PROJECT_RULES.md`
- `docs/00_FOUNDATION/04_DEVELOPMENT_STANDARD.md`
- `docs/00_FOUNDATION/05_CODING_STANDARD.md`
- `docs/00_FOUNDATION/06_NAMING_STANDARD.md`
- `docs/00_FOUNDATION/07_DOCUMENT_STANDARD.md`
- `docs/00_FOUNDATION/08_DOCUMENTATION_STANDARD.md.md`
- `docs/03_DATABASE/MEATOS_PRODUCT_STANDARD.md`
- `docs/03_DATABASE/PRODUCT_MASTER_ERD.md`
- `docs/08_SPRINT/SPRINT_001_PRODUCT_MASTER_SPEC.md`
- `docs/08_SPRINT/SPRINT_001_CHECKLIST.md`
- `docs/08_SPRINT/TASK_ORDER_001_CODEX.md`

---

## 1. Purpose

Sprint 001의 목적은 MEATOS의 첫 번째 Core Engine인 Product Engine을 완성하는 것이다.

이 Sprint에서 만드는 구조는 이후 모든 기능의 기준 데이터가 된다.

- OCR 결과는 Product Alias로 연결된다.
- POS 판매명은 Product Alias로 연결된다.
- Supplier별 원본명은 Product Alias와 Supplier Master로 연결된다.
- Inventory Engine은 이 표준 상품 구조를 기준으로 재고를 계산한다.

즉, Product Engine은 MEATOS의 시작점이다.

---

## 2. Core / Plugin Boundary

| Area | Type | Responsibility |
| --- | --- | --- |
| Product Master | Core | 표준상품의 기준을 만든다 |
| Product Category | Core | 상품 분류 체계를 만든다 |
| Product Attribute | Core | 부위, 원산지, 단위, 보관, 형태 등 속성을 정의한다 |
| Supplier Master | Core | 거래처 기준 정보를 관리한다 |
| Product Alias | Core | 원본 상품명을 표준상품에 연결한다 |
| Supplier Alias | Core | 거래처별 상품명을 표준상품에 연결한다 |
| Product Catalog Service | Service | UI와 Engine 사이의 업무 규칙을 담당한다 |
| OCR Adapter | Plugin | 외부 원본명을 Alias 후보로 전달한다 |
| POS Adapter | Plugin | 판매 데이터를 Inventory Engine으로 전달한다 |

---

## 3. Scope

### In Scope

- Product Master CRUD 초안
- Product Category 구조
- Product Attribute 구조
- Supplier Master CRUD 초안
- Product Alias CRUD 초안
- Supplier Alias CRUD 초안
- Product Catalog Service 초안
- Mock Data
- 목록/등록/검색 UI 연결
- Event Log 저장

### Out of Scope

- 실제 DB 저장
- 실제 OCR 연동
- 실제 POS 파일 Import
- 대량 데이터 마이그레이션
- AI 모델 호출
- 권한/멀티테넌시

---

## 4. Completion Criteria

- 표준상품을 등록할 수 있다.
- 거래처를 등록할 수 있다.
- 거래처별 Alias를 등록할 수 있다.
- Alias가 표준상품과 연결된다.
- Product Category가 상품에 연결된다.
- Product Attribute가 상품 정의에 포함된다.
- 주요 생성/수정 작업이 Event Log를 남긴다.
- 이후 AI OCR 결과가 이 구조에 연결될 준비가 된다.

---

## 5. Data Model

### Product Category

```ts
type ProductCategory = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};
```

### Standard Product

```ts
type StandardProduct = {
  id: string;
  categoryId: string;
  supplierId?: string;
  name: string;
  cutName: string;
  species?: string;
  part?: string;
  processingType?: string;
  skinType?: string;
  boneType?: string;
  storageType?: string;
  origin?: string;
  grade?: string;
  brand?: string;
  baseUnit: "kg" | "g" | "ea" | "pack";
  safeStock: number;
  moq: number;
  traceRequired: boolean;
  isActive: boolean;
};
```

### Supplier Master

```ts
type Supplier = {
  id: string;
  name: string;
  businessNumber?: string;
  manager?: string;
  phone?: string;
  leadTimeDays: number;
  isActive: boolean;
};
```

### Product Alias

```ts
type ProductAlias = {
  id: string;
  rawName: string;
  normalizedName: string;
  productId: string;
  supplierId?: string;
  sourceType: "supplier_invoice" | "pos" | "manual" | "ocr";
  confidence: number;
  verified: boolean;
  useCount: number;
};
```

### Supplier Alias

```ts
type SupplierAlias = {
  id: string;
  supplierId: string;
  productId: string;
  supplierRawName: string;
  verified: boolean;
  lastUsedAt?: string;
};
```

---

## 6. Business Flow

```text
표준상품 등록
  -> 거래처 등록
  -> 거래처별 Alias 등록
  -> Supplier Alias 연결
  -> OCR/POS 원본명 입력
  -> Alias 추천
  -> 사용자 확인
  -> Inventory Engine 입출고 연결
```

중요 원칙:

- 상품명은 표준상품을 기준으로만 관리한다.
- Alias는 원본명 저장소가 아니라 표준상품 연결 레이어다.
- 거래처별 차이는 Supplier Alias로 분리한다.
- UI는 Service만 호출하고, 핵심 규칙은 Engine에 둔다.

---

## 7. UI Requirements

- 표준상품 목록
- 표준상품 등록
- 거래처 목록
- 거래처 등록
- Alias 목록
- Alias 등록
- Alias 추천 테스트
- Event Log 확인
- 검색 및 필터

---

## 8. Service Requirements

`ProductCatalogService`는 다음 책임을 가진다.

- 카탈로그 스냅샷 제공
- 표준상품 생성
- 거래처 생성
- Alias 생성
- Alias 추천
- Event Log 기록

UI는 `ProductEngine`을 직접 조작하지 않고 `ProductCatalogService`만 호출한다.

---

## 9. Validation

- Product Engine 문법 검증
- Product Catalog Service 문법 검증
- Mock Data 구조 검증
- PWA 정적 검증
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd test`

---

## 10. Sprint 001 Output

Sprint 001이 끝나면 다음이 남아야 한다.

- 표준상품 구조
- 거래처 구조
- Alias 구조
- Supplier Alias 구조
- Event Log 기록
- OCR/POS 연결 준비
- 다음 Sprint에서 Inventory Engine으로 넘어갈 기준 데이터
