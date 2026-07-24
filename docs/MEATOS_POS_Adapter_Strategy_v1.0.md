# MEATOS POS 데이터 연동 전략 (POS Adapter v1.0)

작성일: 2026-07-23
대상 매장: 벽산정육점 (POS No. 01)
관점: POS 데이터베이스 연동 설계
목적: 기존 POS를 **수정하지 않고**(무침습) 판매·매출·상품 데이터를 MEATOS로 안전하게 가져오는 방법 정의

---

## 0. 결론 먼저 (Executive Summary)

- 현재 매장은 **Windows PC 기반 Safe POS**를 쓰므로, **POS 로컬 DB를 읽기 전용(Read-Only)으로 조회**하는 방식이 가장 빠르고 안정적이다.
- **OCR은 최후의 수단**이다. DB 직접 조회가 속도·정확도·안정성 모든 면에서 압도적이다.
- 기존 POS 프로그램은 그대로 두고, **별도 MEATOS POS Adapter(경량 프로그램)** 가 DB를 읽어 표준 JSON으로 MEATOS API에 전송한다. → POS 업체와 충돌 없음, 여러 매장에 공통 적용 가능.

---

## 1. 현장 확인 결과 (As-Is)

| 항목 | 확인 내용 |
|---|---|
| 하드웨어 | SAM4S 터치 POS 단말기 |
| POS 소프트웨어 | ADT캡스 / **Safe POS** (Windows 데스크톱 앱) |
| 배달/외부 연동 | **쿠팡 POS** 연동(별도 정산 창 존재) |
| 바코드 스캐너 | Point System (USB HID 방식 추정) |
| OS | Windows 10 (IE/Edge, 검색창 확인) |
| 매출 데이터 | 일/주/월별 매출현황, 분류별·상품별·결제수단별·시간대별 집계 화면 존재 |
| 판매 화면 | 상품버튼(등록상품), 회원정보, 상품등록, 영수증관리 등 |

**시사점**: 화면에 이미 "월별/상품별/결제수단별 매출"이 집계되어 있다는 것은 **POS 내부에 정형 DB가 존재**한다는 뜻이다. 그 DB를 읽으면 OCR 없이 정확한 데이터를 얻는다.

---

## 2. 추출 방식 우선순위

### ★★★★★ 1순위 — POS 로컬 DB 직접 조회 (Read-Only)

```
Safe POS → POS DB (MSSQL / SQLite / MySQL / Firebird) → [Read Only] → MEATOS Adapter → 표준 JSON → MEATOS API
```

- 장점: 가장 빠름 · 가장 정확 · 실시간 가능 · OCR 불필요
- 원칙: **SELECT만**. INSERT/UPDATE/DELETE 절대 금지(POS 무결성 보호).
- 계정: 읽기 전용 DB 계정 별도 생성 권장.

### ★★★★☆ 2순위 — POS 내보내기(Export) 자동 수집

```
Safe POS 정기 내보내기(CSV/Excel/TXT) → 폴더 감시(watch) → MEATOS Import
```

- POS의 "인쇄/내보내기" 또는 매출 마감 파일이 특정 폴더에 쌓이면, Adapter가 폴더를 감시해 자동 취합.
- DB 접근이 막혔을 때의 현실적 차선책.

### ★★★★☆ 3순위 — POS 업체/쿠팡 API

```
Safe POS(제조사) API 또는 쿠팡 POS API → MEATOS
```

- 공식 API가 있으면 가장 깔끔. 단, 제공 여부·계약·인증키 필요.
- 배달(쿠팡) 매출은 쿠팡 정산 API로 별도 수집 검토.

### ★★★☆☆ 4순위 — 영수증 출력 후킹(Print Hook)

```
판매 완료 → 프린터 출력 스트림 캡처 → 파싱 → JSON
```

- 결제 시 발생하는 영수증 데이터를 가로채 파싱. DB/Export/API가 모두 불가할 때.

### ★★☆☆☆ 5순위 — 화면 OCR (최후의 수단)

```
매출 화면 캡처 → OCR → LLM 정규화 → JSON
```

- 속도·정확도·안정성 모두 열세. 위 1~4가 전부 불가한 예외 매장에서만.

---

## 3. 사전 조사 체크리스트 (매장 PC에서 수행)

> POS를 종료하지 않고, **관찰만** 한다. 변경 금지.

### 3.1 설치 폴더 탐색
```
C:\SafePOS   C:\Program Files\SafePOS   C:\Program Files (x86)\SafePOS
C:\POS   D:\POS   C:\ADT   (제조사/브랜드 폴더)
```
내부에서 설정 파일 확인:
```
config.ini  setting.ini  config.xml  database.ini  db.ini  connection.ini
```
→ DB 종류·서버주소·포트·계정 힌트가 들어있는 경우가 많다.

### 3.2 DB 파일 검색 (탐색기 검색창)
```
*.db  *.sqlite  *.mdf  *.ldf  *.accdb  *.mdb  *.fdb
```
- `*.mdf/*.ldf` → **MSSQL**
- `*.fdb` → **Firebird** (국내 POS에서 흔함)
- `*.db/*.sqlite` → **SQLite**
- `*.mdb/*.accdb` → **MS Access**

### 3.3 Windows 서비스 (`services.msc`)
```
MSSQL / SQL Server / Firebird / MySQL / PostgreSQL / SafePOS 관련 서비스
```

### 3.4 실행 중 프로세스 (작업관리자)
```
SafePOS.exe  SafeDB.exe  sqlservr.exe  mysqld.exe  fbserver.exe / firebird.exe
```

### 3.5 ODBC 데이터원본 (`odbcad32.exe`)
- User DSN / System DSN 에 POS DB 연결이 등록돼 있는지 확인 → 연결정보 획득.

### 3.6 포트 확인 (참고)
```
MSSQL 1433 · MySQL 3306 · PostgreSQL 5432 · Firebird 3050
```

---

## 4. 예상 DB 스키마 (역공학 대상)

일반적인 정육/소매 POS는 아래와 유사한 테이블을 갖는다(명칭은 제조사별 상이):

| 논리 테이블 | 역할 | MEATOS 매핑 |
|---|---|---|
| `PRODUCT` / `PRODUCT_MASTER` | 상품 마스터(코드·명칭·단가·바코드) | `product` |
| `SALES_HEADER` (거래 헤더) | 영수증 단위(일시·합계·결제수단·매장) | `sales` |
| `SALES_ITEM` (거래 상세) | 품목별 수량·단가·할인·금액 | `sales_item` |
| `PAYMENT` | 결제수단별 금액(현금/카드/쿠폰) | `sales.pay_method` |
| `INVENTORY` | 재고 | `inventory_movement`(OUT=판매차감) |
| `CUSTOMER` | 회원 | `customer` |
| `EMPLOYEE` | 직원 | `app_user`(참고) |
| `STORE` | 매장 | `store` |

**핵심 조인**: `SALES_HEADER 1 : N SALES_ITEM`, `SALES_ITEM.product_code → PRODUCT`.
**증분 추출 키**: 거래일시 / 영수증번호 / (updated_at 있으면 그것). 마지막 취합 시점 이후만 조회.

---

## 5. MEATOS POS Adapter 구조

```
Safe POS  →  [Read Only]  →  MEATOS POS Adapter
                                   │  1) 증분 조회(마지막 취합 이후 거래)
                                   │  2) 상품명/코드 표준화(별칭·부위·등급 매핑)
                                   │  3) 표준 JSON 변환
                                   ▼
                              MEATOS API (매출 upsert)
                                   ▼
   재고 자동 차감(OUT) → AI 분석 → 발주 추천 → 매출 분석 → 대시보드/LLM 보고서
```

### 5.1 표준 JSON(초안)
```json
{
  "company_id": "c_...",
  "store_id": "s_...",
  "source": "SAFEPOS",
  "pos_no": "01",
  "receipt_no": "20260723-000123",
  "sold_at": "2026-07-23T14:26:00+09:00",
  "pay_method": "CARD",
  "total_amount": 19800,
  "items": [
    { "pos_product_code": "1001", "name": "한우 육회 300g", "qty": 1, "unit_price": 19800, "amount": 19800 }
  ]
}
```

### 5.2 무침습·안전 원칙
- POS DB는 **읽기 전용 계정**으로만 접속. 쓰기 권한 부여 금지.
- POS 영업시간 피크에는 조회 주기를 늘려 부하 최소화(예: 5~10분 간격 증분).
- Adapter는 **별도 프로세스**로 동작 → POS 프로그램 무수정.
- 실패/재시도·중복방지(영수증번호 유니크 키)로 이중 집계 차단.

### 5.3 배달(쿠팡) 매출 별도 처리
- 쿠팡 POS 정산 화면의 항목(매출액·중개이용료·결제대행수수료·배달비·부가세·정산예정액)은 **일반 매장 매출과 성격이 다르다.**
- MEATOS에서는 채널 구분 필드(`channel: STORE | COUPANG`)로 분리 집계 권장(순매출 vs 정산액).

---

## 6. 왜 OCR가 아니라 DB인가

| 기준 | DB 직접 조회 | 화면 OCR |
|---|---|---|
| 속도 | 즉시 | 캡처+인식 지연 |
| 정확도 | 100%(원본값) | 오인식 위험 |
| 안정성 | 높음 | 화면 변경/조명에 취약 |
| 실시간 | 가능 | 어려움 |
| 유지보수 | 스키마 고정 시 낮음 | 화면 바뀌면 재작업 |

→ 이미 POS 안에 정형 DB가 있으므로 OCR로 화면을 다시 읽을 이유가 없다.

---

## 7. 다음 단계 (권장 로드맵)

1. **현장 조사**(3장 체크리스트) 실행 → DB 종류·경로·연결정보 확보.
2. **DB 역공학**: 읽기 전용으로 접속해 실제 테이블/컬럼/관계·샘플 데이터 확인 → 스키마 매핑표 확정.
3. **`MEATOS_POS_Adapter_v1.0` 설계서** 작성: 조회 쿼리, 증분 로직, 표준화 규칙, 전송 API 계약.
4. **파일럿**: 벽산정육점 1개 매장 무침습 연동 → 매출/재고 자동 반영 검증.
5. **다매장 확장**: Adapter를 SAM4S/Safe POS 공통 규격으로 일반화(여러 매장 배포).
6. (선택) **특허/지식재산 검토**: 무침습 POS Adapter + 상품 표준화 + AI 재고/발주 연계 구조.

---

## 8. 리스크·주의

- POS DB 스키마는 제조사 고유·비공개일 수 있음 → **제조사(SAM4S/Safe POS) 협의 또는 서면 동의**를 받는 것이 안전(약관·계약 위반 방지).
- 매장 데이터는 개인정보(회원)·매출 기밀 포함 → 전송 구간 암호화, 접근 최소화.
- 쿠팡 등 외부 채널은 각 사 **공식 API/약관**을 우선 확인(무단 스크래핑 지양).
- 어떤 방식이든 **POS 원본을 변경하지 않는 것**이 제1원칙.

---

## 9. 요약

현재 매장은 Windows 기반 Safe POS라 **Adapter 설치·DB 읽기 연동에 최적**이다.
POS는 그대로 두고, MEATOS Adapter가 DB를 읽어 표준 JSON으로 올리면
**OCR 없이** 매출·상품·재고가 MEATOS ERP로 실시간 흐르고, 그 위에서 AI 재고차감·발주추천·매출분석·보고서가 동작한다.
다음 작업은 **현장 조사 → DB 역공학 → Adapter v1.0 설계서**다.
