# MEATOS Enterprise DB v2.1 — 재설계 지침 (실행판)

> 기준 문서: `MEATOS_Enterprise_DB_v2.0_100K_SaaS_Architecture.md`
> 본 v2.1은 v2.0 지침을 **실제 PostgreSQL/Supabase DDL과 단계적 마이그레이션 계획**으로 구체화한 실행판이다.
> 작성: DB 컨설팅 관점 재구성 · 대상: 전국 SaaS(다수 정육점) SCM 서비스

---

## 0. 절대 원칙 (변경 금지)

1. **구현된 OCR 인식 정확도·속도는 절대 저하되면 안 된다.** 본 재설계는 *데이터 저장·확장 계층*만 다룬다. `analyze-invoice` Edge Function, `scan.html` 인식 파이프라인, Gemini 프롬프트/모델 라우팅은 **일절 변경하지 않는다.**
2. OCR 결과의 정합성(행합계·문서합계·이력번호) **Cross-Check는 앱(scan.html/app 검수화면)에서 재수행**한다. DB는 검증 결과를 저장만 한다.
3. 마이그레이션은 **무중단·역호환**으로 진행한다. 기존 컬럼(`tenant_id`)은 유지한 채 신규 계층(`company_id`,`store_id`)을 **덧붙이는(additive)** 방식.
4. 어떤 단계도 **기존 운영 데이터 삭제(하드 딜리트)·컬럼 제거를 하지 않는다.** 폐기는 view/별칭으로 흡수 후 최종 단계에서만.

---

## 1. 목표·용량 산정

| 항목 | 값 |
|---|---|
| 정육점(store) | 100,000개 |
| 일 최대 거래(매출+매입+재고이동 합) | 10,000,000 ~ 15,000,000건 |
| 매장당 일 평균 | 100 ~ 150건 |
| 연간 누적(운영성 행) | 약 40억 ~ 55억 행 |
| AI/OCR 로그(별도) | 매장당 수십 건/일 → 별도 파티션 |
| 보관 | 운영 DB 3년, 이후 Archive |

**결론**: 단일 대형 테이블로는 인덱스·VACUUM·백업이 붕괴한다. → **월별 Range 파티션 + 2단계 테넌트 + 집계 테이블**이 필수.

---

## 2. 현행 전수 검사 결과 (As-Is Audit)

### 2.1 현재 스키마 구성

| 영역 | 테이블/뷰 | 상태 |
|---|---|---|
| 테넌트 | `tenant_master` (+ `tenant_id` 25곳) | **1단계 테넌트만** 존재 |
| 매입/문서 | `ocr_document`, `ocr_line_item` | 운영 중 |
| 재고 | `inventory_movement`, `inventory_balance`(view) | 운영 중 |
| 매출 | `sales_record` | 신규(MVP) |
| 기준 | `expiry_policy` | 운영 중 |
| 위생 | `daily_sanitation_logs` | 운영 중 |
| 상품/사전/OCR학습 | `product_master`, `supplier_master`, alias, ocr_* 다수(11일자 마이그레이션) | 운영/학습용 |

### 2.2 엔터프라이즈 대비 격차 (Gap)

| # | 격차 | 위험 | v2.1 대응 |
|---|---|---|---|
| G1 | **테넌트가 1단계(`tenant_id`)** — 회사↔매장 구분 없음 | 프랜차이즈·다점포 불가 | `company_id` + `store_id` 2단계 도입 |
| G2 | **파티션 없음** — 운영 테이블 단일 힙 | 5억 행에서 인덱스·백업 붕괴 | 월별 Range 파티션 |
| G3 | **RLS 전면 비활성**(anon 직접 접근) | 회사 간 데이터 노출 위험 | company_id 기준 RLS + 인증 전환 |
| G4 | **집계 테이블 없음** — 대시보드가 원본 스캔 | 매장 늘수록 조회 폭증 | daily/monthly summary 테이블 |
| G5 | **운영/AI 로그 혼재** | 로그가 운영 성능 잠식 | ai_log/ocr_log 분리·별 파티션 |
| G6 | 페이지네이션 `limit`만 사용(offset 성향) | 대용량에서 느려짐 | Cursor(keyset) pagination |
| G7 | 백업/아카이브 정책 문서화 안 됨 | 무한 증가 | 3년 운영→Archive 정책 |

### 2.3 잘 되어 있는 점 (유지)

- `tenant_id` + 날짜 **복합 인덱스** 관습(`(tenant_id, movement_date desc)`) — v2.1 인덱스 원칙과 동일, 그대로 계승.
- `numeric(18,3)/(18,2)` 정밀도, `check` 제약, `created_at/updated_at` 표준 — 유지.
- OCR 파이프라인(Edge Function)과 저장 분리 — v2.1의 AI/OCR 분리 방향과 이미 부합.

---

## 3. 재설계 핵심 원칙

### 3.1 2단계 멀티테넌트

모든 업무 테이블 공통 컬럼:

```
company_id  uuid  not null   -- 회사(가맹본부/사업자)
store_id    uuid  not null   -- 매장(정육점)
created_at  timestamptz not null default now()
```

- 기존 `tenant_id`는 **company_id로 승격**하고, 단일 매장이면 `store_id = 기본매장`으로 백필.
- 조회는 항상 `company_id`(+`store_id`) 선행 조건.

### 3.2 월별 Range 파티션 (대용량 테이블 한정)

대상: `sales`, `sales_item`, `purchase`, `purchase_item`, `inventory_movement`, `ai_log`, `ocr_log`, `audit_log`.

- `PARTITION BY RANGE (created_at)` — 월 단위.
- 파티션 자동 생성은 `pg_partman` 또는 월 1회 cron.
- 파티션별 인덱스 자동 상속.

### 3.3 RLS (company_id 기준)

- 각 업무 테이블에 `USING (company_id = auth_company_id())` 정책.
- **전환 원칙**: 현재 anon 직접 접근 → 서비스 계정/JWT 클레임(`company_id`) 기반으로 단계 전환. 전환 완료 전까지는 기존 방식 유지(무중단).

### 3.4 AI/OCR 분리

- 운영: `sales*`, `purchase*`, `inventory_movement`, `product`, `supplier`, `customer`.
- 로그(고빈도·비운영): `ocr_log`, `ai_log`, `prompt_log`, `ai_result` — 별 스키마 `ai`.
- **OCR 인식 로직 자체는 불변**; 로그 적재 위치만 분리.

### 3.5 집계 전용 테이블 (대시보드 가속)

- `daily_sales_summary`, `monthly_sales_summary`, `daily_purchase_summary`, `inventory_summary`, `dashboard_summary`.
- 원본 트랜잭션 트리거 또는 야간 배치로 증분 갱신. 대시보드는 요약만 조회 → 10만 매장에서도 O(1)급.

### 3.6 Cursor(Keyset) Pagination

- `where (company_id, created_at, id) < (:c, :ts, :id) order by created_at desc, id desc limit N`.
- offset 방식 폐기(대용량에서 느림).

---

## 4. 권장 스키마 (핵심 DDL)

> 스키마: 운영 `public`, 로그 `ai`. 모든 업무 테이블은 company_id/store_id/created_at 포함.

### 4.1 조직/마스터

```sql
create table public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  biz_no text,                 -- 사업자번호
  plan text not null default 'FREE',
  created_at timestamptz not null default now()
);

create table public.store (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null,
  addr text,
  created_at timestamptz not null default now()
);
create index on public.store (company_id);

create table public.app_user (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid references public.store(id) on delete set null,
  email text unique,
  role text not null default 'STAFF',   -- OWNER/MANAGER/STAFF
  created_at timestamptz not null default now()
);
create index on public.app_user (company_id, store_id);
```

### 4.2 상품/거래처/고객

```sql
create table public.product (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid,
  name text not null,
  species text, part_name text, storage_type text,   -- 축종/부위/보관
  barcode text,
  default_price numeric(18,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.product (company_id, name);
create index on public.product (company_id, barcode);

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, name text not null,
  biz_no text, created_at timestamptz not null default now()
);
create index on public.supplier (company_id, name);

create table public.customer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, store_id uuid,
  name text, phone text, created_at timestamptz not null default now()
);
create index on public.customer (company_id, store_id);
```

### 4.3 매출 (파티션 예시 — 핵심 패턴)

```sql
-- 부모(파티션 루트)
create table public.sales (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  sale_date date not null,
  customer_id uuid,
  total_amount numeric(18,2) not null default 0,
  pay_method text,
  created_at timestamptz not null default now(),
  primary key (id, created_at)               -- 파티션 키 포함 필수
) partition by range (created_at);

-- 월 파티션 (자동화 전 수동 예시)
create table public.sales_2026_07 partition of public.sales
  for values from ('2026-07-01') to ('2026-08-01');
create table public.sales_2026_08 partition of public.sales
  for values from ('2026-08-01') to ('2026-09-01');

create index on public.sales (company_id, created_at desc);
create index on public.sales (company_id, store_id, sale_date desc);

create table public.sales_item (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null,
  sales_id uuid not null,
  product_id uuid,
  qty numeric(18,3), unit_price numeric(18,2), amount numeric(18,2),
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.sales_item (company_id, sales_id);
```

### 4.4 매입 (기존 ocr_document 계승 + 파티션화)

```sql
-- purchase = 거래명세서 헤더(현 ocr_document 역할 계승)
create table public.purchase (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null, store_id uuid not null,
  supplier_id uuid, invoice_date date,
  total_amount numeric(18,2) not null default 0,
  source text default 'OCR',            -- OCR/MANUAL
  ocr_document_id uuid,                 -- 기존 ocr_document 연결(역호환)
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.purchase (company_id, created_at desc);

create table public.purchase_item (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null, purchase_id uuid not null,
  product_id uuid, raw_product_name text,
  origin text, unit text,
  qty numeric(18,3), unit_price numeric(18,2), amount numeric(18,2),
  trace_no text,                        -- 이력번호(국내/수입 공통)
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.purchase_item (company_id, purchase_id);
create index on public.purchase_item (company_id, trace_no);
```

### 4.5 재고 이동 (현 inventory_movement 확장·파티션화)

```sql
create table public.inventory_movement2 (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null, store_id uuid not null,
  movement_type text not null check (movement_type in ('IN','OUT','ADJUST')),
  product_id uuid, raw_product_name text not null,
  origin text, unit text,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2), amount numeric(18,2),
  trace_no text, supplier_name text,
  slaughter_date date, expiry_date date,   -- 유통기한 계산 결과 저장
  purchase_item_id uuid,
  movement_date date,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.inventory_movement2 (company_id, store_id, movement_date desc);
create index on public.inventory_movement2 (company_id, raw_product_name);
create index on public.inventory_movement2 (company_id, expiry_date);
```

### 4.6 바코드 · 알림

```sql
create table public.barcode (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, product_id uuid not null,
  code text not null, created_at timestamptz not null default now()
);
create unique index on public.barcode (company_id, code);

create table public.notification (
  id uuid not null default gen_random_uuid(),
  company_id uuid not null, store_id uuid,
  kind text not null,           -- EXPIRY/SANITATION/RECALL/SYSTEM
  title text, body text, ref_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.notification (company_id, store_id, is_read, created_at desc);
```

### 4.7 집계 (대시보드 전용)

```sql
create table public.daily_sales_summary (
  company_id uuid not null, store_id uuid not null, day date not null,
  order_cnt int not null default 0, amount numeric(18,2) not null default 0,
  primary key (company_id, store_id, day)
);
create table public.monthly_sales_summary (
  company_id uuid not null, store_id uuid not null, ym text not null,  -- '2026-07'
  order_cnt int not null default 0, amount numeric(18,2) not null default 0,
  primary key (company_id, store_id, ym)
);
create table public.inventory_summary (
  company_id uuid not null, store_id uuid not null,
  product_key text not null, on_hand_qty numeric(18,3), net_amount numeric(18,2),
  low_stock boolean, updated_at timestamptz not null default now(),
  primary key (company_id, store_id, product_key)
);
create table public.dashboard_summary (
  company_id uuid not null, store_id uuid not null,
  today_sales numeric(18,2), today_purchase numeric(18,2),
  stock_items int, expiry_alerts int, sanitation_done boolean,
  updated_at timestamptz not null default now(),
  primary key (company_id, store_id)
);
```

증분 갱신: 매출/매입/재고 INSERT 트리거로 해당 요약 upsert(+= amount, += 1). 대시보드는 요약만 read.

### 4.8 AI/OCR 로그 (별 스키마 `ai`, 파티션)

```sql
create schema if not exists ai;

create table ai.ocr_log (
  id uuid not null default gen_random_uuid(),
  company_id uuid, store_id uuid,
  model text, latency_ms int, ok boolean, err text,
  page_cnt int, line_cnt int,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

create table ai.ai_result (
  id uuid not null default gen_random_uuid(),
  company_id uuid, ocr_document_id uuid,
  raw_json jsonb, created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
```

> OCR **인식 로직은 불변**. Edge Function은 결과를 `ai.*`에 적재만 추가(선택). 성능·정확도 영향 없음.

### 4.9 감사 로그

```sql
create table public.audit_log (
  id uuid not null default gen_random_uuid(),
  company_id uuid, store_id uuid, user_id uuid,
  action text, entity text, entity_id uuid, diff jsonb,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index on public.audit_log (company_id, created_at desc);
```

---

## 5. 인덱스 원칙

- 단일: `company_id`, `store_id`, `created_at`, `product_id`, `barcode`, `sale_date`.
- 복합(선두 = company_id): `(company_id, created_at desc)`, `(company_id, store_id, sale_date desc)`, `(company_id, product_id)`, `(company_id, barcode)`, `(company_id, trace_no)`, `(company_id, expiry_date)`.
- 파티션 인덱스는 부모에 정의 → 자식 자동 상속.
- **원칙**: 모든 조회 쿼리의 첫 조건은 `company_id`. RLS와도 일치.

---

## 6. 파티션 자동화

```sql
-- pg_partman 권장(월 단위, 3개월 선행 생성, 36개월 보관)
select partman.create_parent(
  p_parent_table => 'public.sales',
  p_control => 'created_at', p_type => 'range', p_interval => '1 month',
  p_premake => 3
);
-- 대안: 월 1회 cron(pg_cron)으로 다음달 파티션 create.
```

---

## 7. 보관/아카이브 정책

| 데이터 | 운영 DB | 이후 |
|---|---|---|
| sales/purchase/inventory | 최근 **36개월** | Archive DB(콜드) 이관, 파티션 detach |
| ai/ocr 로그 | 최근 **6~12개월** | 삭제 또는 콜드 스토리지 |
| audit_log | 최근 **24개월** | 콜드 |
| 집계(summary) | 무기한(경량) | 유지 |

파티션 detach → dump → archive 스키마/별 DB attach. 원본 절대 즉시 삭제 금지.

---

## 8. 단계적 마이그레이션 (무중단·역호환)

> 각 단계는 독립 배포 가능. **어느 단계도 OCR 로직·기존 컬럼을 제거하지 않는다.**

**Phase 0 — 준비(영향 0)**
- `company`, `store` 테이블 생성. 기존 `tenant_master` 1건 → company 1건, 기본 store 1건 매핑.

**Phase 1 — 컬럼 덧붙이기(additive)**
- 기존 운영 테이블(`ocr_document`, `inventory_movement`, `sales_record`, `daily_sanitation_logs`, `expiry_policy`)에 `company_id`,`store_id` **nullable로 추가** → 백필(`company_id = tenant_id`) → not null 승격.
- 앱은 계속 `tenant_id`로도 동작(뷰/기본값으로 흡수). **읽기·쓰기 경로 불변.**

**Phase 2 — 집계 도입**
- summary 테이블 + 트리거. 대시보드(홈/매출/매입 카드)를 원본조회 → summary조회로 **점진 전환**(먼저 병행 검증).

**Phase 3 — 파티션 신규 테이블 병행**
- `sales`/`purchase`/`inventory_movement2` 파티션 테이블 생성. **신규 데이터부터 신 테이블 기록**, 구 테이블은 읽기 유지. 앱은 UNION 뷰로 과도기 조회.

**Phase 4 — RLS·인증 전환**
- JWT `company_id` 클레임 발급 → RLS 정책 활성화 → anon 직접접근 축소. 전환 완료까지 병행.

**Phase 5 — 정리**
- 과거 데이터 신 파티션으로 백필 이관 → 구 테이블 아카이브 → 뷰 정리.

**롤백**: 각 Phase는 신규 추가만 하므로, 문제 시 앱을 이전 경로로 되돌리면 즉시 복구.

---

## 9. 성능·용량 체크포인트

- 일 1,500만 행 → 월 ~4.5억. 월 파티션 1개 ≈ 4.5억 행/파티션 → **필요 시 company_id 해시 서브파티션** 또는 주 단위 파티션으로 세분.
- 대시보드는 summary만 조회(파티션 스캔 회피).
- Read replica로 조회 분산, Write는 프라이머리.
- 배치(집계/알림 계산)는 야간 + 증분 트리거 혼합.

---

## 10. OCR/정확도 보증 (재확인)

- 본 문서의 어떤 항목도 `analyze-invoice`/`scan.html`/Gemini 프롬프트·모델·타임아웃을 변경하지 않는다.
- 인식 결과 **Cross-Check(행합계·문서합계·이력번호 정합)는 앱 검수화면에서 재수행**하며, DB는 검증 통과 결과만 저장.
- 즉, **속도·정확도 지표는 재설계와 독립**이며 저하 요인이 없다.

---

## 11. 로드맵

| 단계 | 매장 수 | DB 조치 |
|---|---|---|
| 1 | ~100 | Phase 0~1 (2단계 테넌트 + 백필) |
| 2 | ~1,000 | Phase 2 (집계 테이블) |
| 3 | ~10,000 | Phase 3 (월 파티션 전환) + Read replica |
| 4 | ~100,000 | Phase 4~5 (RLS·인증, 서브파티션, 아카이브 자동화) |
| 5 | 전국 | AI 수요예측 · 전국 유통 빅데이터(집계 기반) |

---

## 12. 결론

- 현행은 **정상 동작하나 단일 테넌트·비파티션·집계부재**로 10만 매장 확장 불가.
- v2.1은 v2.0 지침을 **2단계 테넌트 + 월 파티션 + RLS + 집계 + AI/OCR분리**의 실행 DDL로 구체화했다.
- 전 과정 **무중단·역호환·OCR 불변**을 원칙으로 하며, 초기 MVP부터 전국 SaaS를 전제로 스키마를 확정한다.
