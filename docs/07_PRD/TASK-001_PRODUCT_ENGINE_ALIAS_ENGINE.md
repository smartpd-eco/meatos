# TASK-001 Product Engine + Alias Engine PRD

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Status**: Active  
**Last Update**: 2026-07-10  
**Related Docs**:

- `docs/00_FOUNDATION/01_MEATOS_CONSTITUTION.md`
- `docs/00_FOUNDATION/02_PROJECT_VISION.md`
- `docs/00_FOUNDATION/03_PROJECT_RULES.md`
- `docs/00_FOUNDATION/04_DEVELOPMENT_STANDARD.md`
- `docs/01_PROJECT/CODEX_ORDER_001.md`

---

## 1. 목적

TASK-001의 목적은 MEATOS의 첫 Core Engine인 Product Engine과 Product Alias Engine의 기초를 만든다.

POS Adapter, OCR, AI 발주 추천은 모두 이 상품 표준 구조 위에 연결된다. 따라서 Product Master, Supplier Master, Product Alias는 이후 모든 업무의 기준 데이터가 된다.

---

## 2. Core / Plugin 판단

| 항목 | 판단 | 이유 |
| --- | --- | --- |
| Product Master | Core Engine | 모든 입고, 출고, 재고, POS, OCR의 표준 상품 기준 |
| Product Alias | Core Engine | 공급사/문서/POS별 상품명을 표준상품으로 연결 |
| Supplier Master | Core Engine | 거래처별 상품명과 입고 흐름의 기준 |
| OCR | Plugin | 외부 입력을 Product/Alias 구조에 연결 |
| POS Adapter | Plugin | 판매 데이터를 Inventory Engine으로 전달 |

---

## 3. 범위

### 포함

- 상품분류 구조
- 표준상품 구조
- 거래처 구조
- 거래처별 Alias 구조
- Product Engine CRUD 초안
- Product Catalog Service 초안
- Mock Data
- 기본 화면 연결

### 제외

- 실제 DB 저장
- 실제 OCR 연동
- 실제 POS 파일 Import
- AI 모델 호출
- 다중 사업장 권한

---

## 4. 완료 기준

- 표준상품을 등록할 수 있다.
- 거래처를 등록할 수 있다.
- 거래처별 Alias를 등록할 수 있다.
- Alias가 표준상품과 연결된다.
- Alias 추천 결과가 이후 AI OCR 결과와 연결 가능한 구조다.
- 주요 생성/수정 작업은 Event Log를 남긴다.

---

## 5. 데이터 구조

### Product Category

```ts
type ProductCategory = {
  id: string;
  name: string;
  code: string;
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
  baseUnit: "kg" | "g" | "ea" | "pack";
  safeStock: number;
  moq: number;
  traceRequired: boolean;
  isActive: boolean;
};
```

### Supplier

```ts
type Supplier = {
  id: string;
  name: string;
  businessNumber?: string;
  leadTimeDays: number;
  isActive: boolean;
};
```

### Product Alias

```ts
type ProductAlias = {
  id: string;
  rawName: string;
  productId: string;
  supplierId?: string;
  sourceType: "supplier_invoice" | "pos" | "manual" | "ocr";
  confidence: number;
  isConfirmed: boolean;
};
```

---

## 6. 업무 흐름

```text
표준상품 등록
  -> 거래처 등록
  -> 거래처별 Alias 등록
  -> Alias가 표준상품에 연결
  -> OCR/POS 원본 상품명 입력
  -> Alias 추천
  -> 사용자 확인
  -> Inventory Engine 입출고 연결
```

---

## 7. 화면 요구사항

- 표준상품 목록
- 표준상품 등록 버튼
- 거래처 목록
- 거래처 등록 버튼
- Alias 목록
- Alias 등록 버튼
- Alias 추천 테스트
- Event Log 확인

---

## 8. 검증 항목

- Product Engine 문법 검사 통과
- Product Catalog Service 문법 검사 통과
- PWA 정적 검증 통과
- `npm.cmd run build` 통과
- `npm.cmd run lint` 통과
- `npm.cmd test` 통과
