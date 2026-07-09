# AI 축산물 유통 SCM 플랫폼

## Universal POS Adapter & AI Inventory Platform

Version 1.0

---

## 1. 프로젝트 비전

> 대한민국 모든 정육점이 어떤 POS를 사용하더라도 연결 가능한 AI 유통 SCM 플랫폼을 만든다.

이 프로젝트는 POS를 대체하는 제품이 아니다. 핵심은 POS별로 흩어진 판매 데이터를 하나의 표준으로 흡수하고, 입고ㆍ재고ㆍ발주ㆍAI 분석까지 이어지는 축산물 유통 SCM 표준을 만드는 것이다.

```text
POS = 판매
SCM = 입고 + 재고 + 발주 + AI + 분석
```

---

## 2. 시장 문제

정육점 POS 시장은 제조사와 매장 환경별로 데이터 구조가 분리되어 있다.

- OKPOS
- POSMASTER
- POPS
- 자체 POS
- 구형 DOS POS
- Windows POS
- POS 없는 정육점

각 POS는 상품번호, 상품명, 단위, 중량, 할인, 반품, 정산 방식이 다르다. 따라서 기존 ERP처럼 특정 POS 하나만 연동하는 방식으로는 전국 정육점 시장을 확장하기 어렵다.

---

## 3. 플랫폼 핵심 구조

```text
OKPOS / POSMASTER / POPS / 자체 POS / POS 없음
        |
        v
Universal POS Adapter
        |
        v
Universal Product Standard
        |
        v
AI Alias Engine
        |
        v
Inventory Ledger
        |
        v
AI Sales Analysis + AI Purchase Recommendation
```

플랫폼의 경쟁력은 프로그램 화면보다 다음 세 가지에 있다.

1. Universal Product Standard
2. AI Alias Engine
3. Universal POS Adapter

---

## 4. Universal Product Standard

POS마다 다른 상품명과 상품코드를 내부 표준상품으로 변환한다.

| POS 원본명 | 표준상품명 | 표준 분류 | 기본 단위 |
| --- | --- | --- | --- |
| 삼겹살, 생삼겹, 냉장삼겹, 국내산삼겹, 삼겹 | 삼겹살 | 돼지고기 | kg |
| 앞다리살, 미전지, 전지, 앞다리, 미박앞다리 | 미박 앞다리살 | 돼지고기 | kg |
| 목살, 생목살, 국내산목살 | 목살 | 돼지고기 | kg |
| 갈비, 돼지갈비, LA갈비 | 갈비 | 돼지고기/소고기 | kg |

### 표준상품 기본 필드

```ts
type StandardProduct = {
  id: string;
  name: string;
  category: "pork" | "beef" | "chicken" | "processed" | "other";
  cutName: string;
  origin?: string;
  storageType?: "fresh" | "frozen" | "room";
  baseUnit: "kg" | "g" | "ea" | "pack";
  barcodeAliases: string[];
  nameAliases: string[];
  isActive: boolean;
};
```

---

## 5. AI Alias Engine

이 프로젝트의 핵심은 OCR 자체가 아니라 원본 상품명을 표준상품으로 치환하는 Alias Engine이다.

```text
거래명세서 / POS 판매명 / CSV 상품명
        |
        v
원본 상품명 정규화
        |
        v
Alias 후보 검색
        |
        v
AI 유사도 판단
        |
        v
표준상품 매칭
        |
        v
재고 반영
```

### Alias Engine 판단 기준

- 문자열 유사도
- 축산물 부위 사전
- 거래처별 과거 매칭 이력
- 원산지, 보관상태, 단위 키워드
- 상품 바코드
- 사용자 확정 이력

### Alias 매칭 결과 상태

```ts
type AliasMatchStatus =
  | "matched"
  | "needs_review"
  | "new_alias_candidate"
  | "rejected";
```

---

## 6. Universal POS Adapter

모든 POS 데이터를 하나의 표준 판매 Ledger로 변환한다.

### Level 1. API Adapter

지원 대상:

- OKPOS
- API 제공 POS

가장 안정적인 방식이다. API 인증, 호출 제한, 장애 재처리가 필요하다.

### Level 2. DB Adapter

POS DB를 읽기 전용으로 조회한다.

지원 후보:

- MSSQL
- SQLite
- Firebird
- MySQL
- Access

원칙:

- 쓰기 금지
- 읽기 전용 계정 사용
- 원본 DB 스키마 변경 금지
- 동기화 실패 시 재시도 가능해야 함

### Level 3. CSV Adapter

가장 현실적인 MVP 방식이다.

```text
판매.csv
  -> CSV Import
  -> 컬럼 매핑
  -> Alias Engine
  -> 판매 Ledger
  -> 재고 감소
```

### Level 4. Folder Watch

POS Export Folder를 감시해 신규 파일을 자동 Import한다.

```text
POS Export Folder
  -> 파일 생성 감지
  -> 파일 잠금 해제 확인
  -> Import Queue 등록
  -> 처리 결과 기록
```

### Level 5. Printer Adapter

영수증 출력 데이터를 감시해 판매를 인식한다. POS 연동이 어려운 구형 환경에서 보조 수단으로 사용한다.

### Level 6. Barcode Adapter

POS 없이 블루투스 바코드 스캐너로 판매를 등록한다.

### Level 7. Manual Adapter

POS가 없는 정육점도 사용할 수 있어야 하므로 가장 중요한 백업 경로다.

```text
상품검색
  -> 수량/중량 입력
  -> 판매등록
  -> 재고 감소
```

---

## 7. POS Health Check

프로그램 실행 시 매장 PC 환경을 점검하고 가능한 Adapter를 추천한다.

### 점검 항목

- POS 프로세스 존재 여부
- 제조사 추정
- 버전 정보
- DB 파일 또는 DB 서버 존재 여부
- API 사용 가능 여부
- CSV Export 폴더 존재 여부
- 영수증 프린터 드라이버 존재 여부
- 바코드 스캐너 연결 여부

### 결과 예시

```ts
type PosHealthCheckResult = {
  detectedVendor?: "OKPOS" | "POSMASTER" | "POPS" | "CUSTOM" | "UNKNOWN";
  detectedVersion?: string;
  supportsApi: boolean;
  supportsDbRead: boolean;
  supportsCsvExport: boolean;
  supportsFolderWatch: boolean;
  supportsPrinterCapture: boolean;
  recommendedAdapterLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  confidence: number;
  notes: string[];
};
```

---

## 8. 표준 판매 Ledger

모든 Adapter는 최종적으로 같은 판매 Ledger를 생성해야 한다.

```ts
type SalesLedgerEntry = {
  id: string;
  storeId: string;
  sourceType: "api" | "db" | "csv" | "folder_watch" | "printer" | "barcode" | "manual";
  sourceVendor?: string;
  sourceTransactionId?: string;
  soldAt: string;
  rawProductName: string;
  rawProductCode?: string;
  standardProductId?: string;
  matchStatus: AliasMatchStatus;
  quantity: number;
  unit: "kg" | "g" | "ea" | "pack";
  unitPrice?: number;
  totalAmount?: number;
  discountAmount?: number;
  isReturn: boolean;
};
```

Ledger 기반으로 재고를 직접 수정하지 않고, 입출고 이벤트를 누적해 현재고를 계산하는 구조를 기본값으로 둔다.

---

## 9. Inventory Engine

재고는 단순 수량 컬럼이 아니라 입고, 판매, 조정, 폐기, 반품 이벤트의 합으로 관리한다.

```text
입고 + 재고조정 + 반품입고
- 판매 - 폐기 - 출고
= 현재고
```

### 재고 이벤트 타입

```ts
type InventoryEventType =
  | "purchase_received"
  | "sale"
  | "manual_adjustment"
  | "return_in"
  | "return_out"
  | "waste"
  | "transfer_in"
  | "transfer_out";
```

---

## 10. AI 판매 분석

단순 재고 차감이 아니라 판매 패턴을 분석해 이상징후와 발주 필요성을 알려준다.

예시:

```text
삼겹살 평균 판매량: 15kg
오늘 판매량: 40kg
AI 판단: 내일 추가 발주 추천
```

```text
갈비 최근 판매 없음
오늘 갑작스러운 증가
AI 판단: 행사 또는 단체주문 여부 확인
```

---

## 11. 공급사 자동 발주

```text
현재고
  -> 안전재고 이하
  -> AI 추천 발주량 계산
  -> 발주서 생성
  -> 공급사 확인
  -> 배송
  -> 입고 반영
```

실제 카카오 알림톡, 문자, 메일 발송은 운영 환경 데이터에 영향을 주므로 별도 사용자 확인 후 연결한다.

---

## 12. Lite POS

POS 없는 정육점을 위한 최소 판매 등록 기능이다.

포함 기능:

- 판매 등록
- 재고 감소
- 영수증 출력
- 바코드 입력
- 판매 취소/반품

제외 기능:

- 복잡한 카드 결제
- VAN 직접 연동
- 세무 신고 대행

카드 결제는 기존 카드단말기를 사용하는 전제로 설계한다.

---

## 13. 개발 MVP 범위

### MVP 1. AI 거래명세서 입고

- 거래명세서 OCR 결과 입력
- 원본 상품명 추출
- Alias Engine 매칭
- 입고 Ledger 생성
- 재고 증가

### MVP 2. Alias Engine 관리

- 표준상품 관리
- 원본명 Alias 관리
- 미매칭 후보 검토
- 사용자 확정 이력 저장

### MVP 3. CSV POS Adapter

- CSV 업로드
- 컬럼 매핑
- 판매 Ledger 변환
- 재고 감소
- Import 결과 리포트

### MVP 4. Manual Adapter

- 상품 검색
- 중량/수량 입력
- 판매 등록
- 재고 감소

### MVP 5. POS Health Check 초안

- CSV 폴더 존재 확인
- DB 파일 후보 확인
- 추천 Adapter 표시

---

## 14. 화면 메뉴 제안

SMARTPD ERP 스타일 기준 메뉴명은 부서명 + 관리 형태를 유지한다.

- AI관리
  - 거래명세서 AI입고
  - Alias Engine 관리
  - 미매칭 상품 검토
- 재고관리
  - 현재고 현황
  - 재고 Ledger
  - 재고 조정
- 판매관리
  - POS 판매 Import
  - Manual 판매등록
  - 판매 Ledger
- POS관리
  - POS Health Check
  - Adapter 설정
  - CSV 컬럼 매핑
- 발주관리
  - AI 발주추천
  - 공급사 발주서
  - 입고 예정
- 분석관리
  - 판매 패턴 분석
  - 이상 판매 감지
  - 지역/상품 통계

---

## 15. Roadmap

1. AI 거래명세서 입고
2. Alias Engine
3. Inventory Engine
4. Universal POS Adapter
5. POS Health Check
6. AI Auto Adapter
7. Lite POS
8. AI 판매 분석
9. AI 발주 추천
10. 전국 정육점 통합 SCM

---

## 16. 2차 확장

전국 데이터를 활용해 지역ㆍ상품ㆍ시기별 수요를 예측한다.

예시:

```text
안산 지역 삼겹살 판매량 증가
  -> 내일 가격 상승 가능성 예측
  -> 공급사 발주량 선제 추천
```

---

## 17. 3차 확장

다음 데이터를 통합해 대한민국 축산물 운영 표준 플랫폼으로 확장한다.

- 축산물품질평가원
- 축산물이력제
- 도축증명서
- 거래명세서
- POS
- AI
- 재고
- 발주
- 매출
- 통계

---

## 18. 최종 목표

우리는 POS를 대체하지 않는다.

우리는 모든 POS를 연결한다.

그리고 POS가 없는 곳도 사용할 수 있게 만든다.

궁극적으로 대한민국 축산 유통의 Universal SCM Standard를 만든다.
