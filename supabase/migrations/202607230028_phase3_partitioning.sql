-- =====================================================================
-- Enterprise DB v2.1 · Phase 3 — 월별 Range 파티션 전환 (sales_record, inventory_movement)
-- 목적: 일 1,500만 건 규모 대응 + 5년 보관 후 연 단위 아카이브/최적화.
-- 안전장치:
--   (1) 전체를 단일 트랜잭션으로 감쌈 → 어느 단계든 오류 시 전부 롤백(운영 무손상).
--   (2) 복사 후 행수 일치 검증 실패 시 RAISE → 롤백(크로스체크 내장).
--   (3) 기존 컬럼/인덱스/FK/뷰/트리거 전부 재생성. DEFAULT 파티션으로 insert 무중단.
--   (4) 파티션 키 = created_at (보관/아카이브 기준). 앱 쓰기 경로·OCR 불변.
-- 주의: PostgreSQL DDL은 트랜잭션 지원. 오류 시 편집기가 자동 롤백함.
-- =====================================================================

-- ── 월 파티션 자동 생성 헬퍼 (향후 pg_cron으로 매월 호출 권장) ────────
create or replace function public.ensure_month_partitions(p_table text, p_start date, p_months int)
returns void language plpgsql as $$
declare i int; s date; e date; nm text;
begin
  for i in 0..p_months-1 loop
    s := (date_trunc('month', p_start) + make_interval(months => i))::date;
    e := (s + interval '1 month')::date;
    nm := p_table || '_' || to_char(s, 'YYYY_MM');
    execute format('create table if not exists public.%I partition of public.%I for values from (%L) to (%L);',
                   nm, p_table, s, e);
  end loop;
end $$;

begin;

-- =====================================================================
-- 1) sales_record → 파티션 전환
-- =====================================================================
alter table public.sales_record rename to sales_record_legacy_p3;

create table public.sales_record (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  sale_date date not null default current_date,
  item_name text not null,
  quantity numeric,
  unit_price numeric,
  amount numeric not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  company_id uuid,
  store_id uuid,
  primary key (id, created_at)
) partition by range (created_at);

-- 2026-01 부터 72개월(6년) + DEFAULT
select public.ensure_month_partitions('sales_record', date '2026-01-01', 72);
create table if not exists public.sales_record_default partition of public.sales_record default;

insert into public.sales_record
  (id, tenant_id, sale_date, item_name, quantity, unit_price, amount, memo, created_at, company_id, store_id)
select id, tenant_id, sale_date, item_name, quantity, unit_price, amount, memo, created_at, company_id, store_id
from public.sales_record_legacy_p3;

do $$
declare a bigint; b bigint;
begin
  select count(*) into a from public.sales_record;
  select count(*) into b from public.sales_record_legacy_p3;
  if a <> b then raise exception 'sales_record row mismatch: new=% legacy=%', a, b; end if;
end $$;

create index if not exists idx_sales_record_tenant_date on public.sales_record (tenant_id, sale_date desc);
create index if not exists sales_record_company_created_idx on public.sales_record (company_id, created_at desc);
create index if not exists sales_record_store_date_idx on public.sales_record (company_id, store_id, sale_date desc);
alter table public.sales_record disable row level security;

drop trigger if exists trg_fill_cs on public.sales_record;
create trigger trg_fill_cs before insert on public.sales_record
  for each row execute function public.fill_company_store();
drop trigger if exists trg_sync_sales on public.sales_record;
create trigger trg_sync_sales after insert or update on public.sales_record
  for each row execute function public.sync_sales_summary();

drop table public.sales_record_legacy_p3;

-- =====================================================================
-- 2) inventory_movement → 파티션 전환 (뷰/트리거/FK/모든 컬럼 보존)
-- =====================================================================
drop view if exists public.inventory_balance;
alter table public.inventory_movement rename to inventory_movement_legacy_p3;

create table public.inventory_movement (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  movement_type text not null default 'IN' check (movement_type in ('IN','OUT','ADJUST')),
  product_master_id uuid references public.product_master(id) on delete set null,
  raw_product_name text not null,
  origin text,
  unit text,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  unit_price numeric(18,2) check (unit_price >= 0),
  amount numeric(18,2) check (amount >= 0),
  trace_no text,
  supplier_name text,
  ocr_document_id uuid references public.ocr_document(id) on delete set null,
  ocr_line_no integer check (ocr_line_no >= 1),
  movement_date date,
  memo text,
  created_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slaughter_date date,
  expiry_date date,
  company_id uuid,
  store_id uuid,
  primary key (id, created_at)
) partition by range (created_at);

select public.ensure_month_partitions('inventory_movement', date '2026-01-01', 72);
create table if not exists public.inventory_movement_default partition of public.inventory_movement default;

insert into public.inventory_movement
  (id, tenant_id, movement_type, product_master_id, raw_product_name, origin, unit,
   quantity, unit_price, amount, trace_no, supplier_name, ocr_document_id, ocr_line_no,
   movement_date, memo, created_by, is_active, created_at, updated_at,
   slaughter_date, expiry_date, company_id, store_id)
select id, tenant_id, movement_type, product_master_id, raw_product_name, origin, unit,
   quantity, unit_price, amount, trace_no, supplier_name, ocr_document_id, ocr_line_no,
   movement_date, memo, created_by, is_active, created_at, updated_at,
   slaughter_date, expiry_date, company_id, store_id
from public.inventory_movement_legacy_p3;

do $$
declare a bigint; b bigint;
begin
  select count(*) into a from public.inventory_movement;
  select count(*) into b from public.inventory_movement_legacy_p3;
  if a <> b then raise exception 'inventory_movement row mismatch: new=% legacy=%', a, b; end if;
end $$;

create index if not exists inventory_movement_tenant_date_idx on public.inventory_movement (tenant_id, movement_date desc);
create index if not exists inventory_movement_tenant_product_idx on public.inventory_movement (tenant_id, raw_product_name);
create index if not exists inventory_movement_document_idx on public.inventory_movement (ocr_document_id);
create index if not exists inventory_movement_company_created_idx on public.inventory_movement (company_id, created_at desc);
create index if not exists inventory_movement_store_date_idx on public.inventory_movement (company_id, store_id, movement_date desc);
create index if not exists inventory_movement_expiry_idx on public.inventory_movement (tenant_id, expiry_date);
alter table public.inventory_movement disable row level security;

-- 재고 잔량 뷰 재생성 (원본과 동일)
create or replace view public.inventory_balance as
select
  tenant_id,
  raw_product_name,
  origin,
  sum(case when movement_type = 'OUT' then -quantity else quantity end) as on_hand_qty,
  sum(case when movement_type = 'OUT' then -amount else amount end) as net_amount,
  count(*) as movement_count,
  max(movement_date) as last_movement_date
from public.inventory_movement
where is_active = true
group by tenant_id, raw_product_name, origin;

drop trigger if exists trg_fill_cs on public.inventory_movement;
create trigger trg_fill_cs before insert on public.inventory_movement
  for each row execute function public.fill_company_store();
drop trigger if exists trg_sync_inventory on public.inventory_movement;
create trigger trg_sync_inventory after insert or update on public.inventory_movement
  for each row execute function public.sync_inventory_summary();

drop table public.inventory_movement_legacy_p3;

commit;

-- =====================================================================
-- 보관/아카이브 정책 (운영 5년 → 이후 detach 후 콜드 이관)
--   매년 1회, 6년차 이전 파티션을 분리(detach)하여 아카이브:
--     alter table public.sales_record detach partition public.sales_record_2026_01;
--     -- pg_dump 로 백업 후 archive 스키마/별 DB로 이관, 원본 파티션 drop
--   향후 파티션은 pg_cron 으로 매월 자동 생성 권장:
--     select cron.schedule('meatos-partitions','0 0 1 * *',
--       $$select public.ensure_month_partitions('sales_record', date_trunc('month',now())::date, 3);
--         select public.ensure_month_partitions('inventory_movement', date_trunc('month',now())::date, 3);$$);
--
-- 검증(실행 후):
--   select count(*) from public.sales_record;         -- 전환 전과 동일
--   select count(*) from public.inventory_movement;   -- 전환 전과 동일
--   select relname from pg_class where relkind='r' and relname like 'sales_record_2026%' order by 1;  -- 파티션 목록
--   -- 앱에서 스캔 저장/판매 입력 1건 → 정상 기록되는지 크로스체크
-- =====================================================================
