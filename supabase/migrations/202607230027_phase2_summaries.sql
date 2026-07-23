-- =====================================================================
-- Enterprise DB v2.1 · Phase 2 — 집계(요약) 테이블 + 자동 갱신 트리거
-- 목적: 대시보드가 원본 트랜잭션(수백만 행) 대신 요약만 조회 → 10만 매장 대응.
-- 원칙: 서버(DB)만 추가. 앱 코드 무변경. 원본 데이터 불변. OCR과 무관.
--       요약은 append-only 원본에서 "영향받은 버킷만" 재계산 → 항상 정확.
-- 재실행 안전(idempotent).
-- =====================================================================

-- ── 요약 테이블 ───────────────────────────────────────────────────────
create table if not exists public.daily_sales_summary (
  company_id uuid not null, store_id uuid not null, day date not null,
  order_cnt int not null default 0, amount numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, store_id, day)
);
create table if not exists public.monthly_sales_summary (
  company_id uuid not null, store_id uuid not null, ym text not null,
  order_cnt int not null default 0, amount numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, store_id, ym)
);
create table if not exists public.daily_purchase_summary (
  company_id uuid not null, store_id uuid not null, day date not null,
  doc_cnt int not null default 0, amount numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, store_id, day)
);
create table if not exists public.monthly_purchase_summary (
  company_id uuid not null, store_id uuid not null, ym text not null,
  doc_cnt int not null default 0, amount numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, store_id, ym)
);
create table if not exists public.inventory_summary (
  company_id uuid not null, store_id uuid not null, product_key text not null,
  on_hand_qty numeric(18,3) not null default 0, net_amount numeric(18,2) not null default 0,
  low_stock boolean not null default false, updated_at timestamptz not null default now(),
  primary key (company_id, store_id, product_key)
);
alter table public.daily_sales_summary disable row level security;
alter table public.monthly_sales_summary disable row level security;
alter table public.daily_purchase_summary disable row level security;
alter table public.monthly_purchase_summary disable row level security;
alter table public.inventory_summary disable row level security;

-- ── 갱신 함수 (영향받은 버킷만 원본에서 재계산) ───────────────────────
create or replace function public.sync_sales_summary()
returns trigger language plpgsql as $$
begin
  insert into public.daily_sales_summary (company_id, store_id, day, order_cnt, amount)
  select new.company_id, new.store_id, new.sale_date, count(*), coalesce(sum(amount),0)
  from public.sales_record
  where company_id = new.company_id and store_id is not distinct from new.store_id and sale_date = new.sale_date
  on conflict (company_id, store_id, day)
    do update set order_cnt = excluded.order_cnt, amount = excluded.amount, updated_at = now();

  insert into public.monthly_sales_summary (company_id, store_id, ym, order_cnt, amount)
  select new.company_id, new.store_id, to_char(new.sale_date,'YYYY-MM'), count(*), coalesce(sum(amount),0)
  from public.sales_record
  where company_id = new.company_id and store_id is not distinct from new.store_id
    and to_char(sale_date,'YYYY-MM') = to_char(new.sale_date,'YYYY-MM')
  on conflict (company_id, store_id, ym)
    do update set order_cnt = excluded.order_cnt, amount = excluded.amount, updated_at = now();
  return null;
end $$;

create or replace function public.sync_purchase_summary()
returns trigger language plpgsql as $$
declare d date;
begin
  d := coalesce(new.invoice_date, (new.created_at)::date);
  insert into public.daily_purchase_summary (company_id, store_id, day, doc_cnt, amount)
  select new.company_id, new.store_id, d, count(*), coalesce(sum(total_amount),0)
  from public.ocr_document
  where company_id = new.company_id and store_id is not distinct from new.store_id
    and document_status = 'POSTED'
    and coalesce(invoice_date, created_at::date) = d
  on conflict (company_id, store_id, day)
    do update set doc_cnt = excluded.doc_cnt, amount = excluded.amount, updated_at = now();

  insert into public.monthly_purchase_summary (company_id, store_id, ym, doc_cnt, amount)
  select new.company_id, new.store_id, to_char(d,'YYYY-MM'), count(*), coalesce(sum(total_amount),0)
  from public.ocr_document
  where company_id = new.company_id and store_id is not distinct from new.store_id
    and document_status = 'POSTED'
    and to_char(coalesce(invoice_date, created_at::date),'YYYY-MM') = to_char(d,'YYYY-MM')
  on conflict (company_id, store_id, ym)
    do update set doc_cnt = excluded.doc_cnt, amount = excluded.amount, updated_at = now();
  return null;
end $$;

create or replace function public.sync_inventory_summary()
returns trigger language plpgsql as $$
begin
  insert into public.inventory_summary (company_id, store_id, product_key, on_hand_qty, net_amount, low_stock)
  select new.company_id, new.store_id, new.raw_product_name,
    coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0),
    coalesce(sum(case when movement_type='OUT' then -amount else amount end),0),
    (coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0) <= 0)
  from public.inventory_movement
  where company_id = new.company_id and store_id is not distinct from new.store_id
    and raw_product_name = new.raw_product_name and is_active = true
  on conflict (company_id, store_id, product_key)
    do update set on_hand_qty = excluded.on_hand_qty, net_amount = excluded.net_amount,
                  low_stock = excluded.low_stock, updated_at = now();
  return null;
end $$;

-- ── 트리거 부착 (INSERT/UPDATE 후 요약 동기화) ────────────────────────
drop trigger if exists trg_sync_sales on public.sales_record;
create trigger trg_sync_sales after insert or update on public.sales_record
  for each row execute function public.sync_sales_summary();

drop trigger if exists trg_sync_purchase on public.ocr_document;
create trigger trg_sync_purchase after insert or update on public.ocr_document
  for each row execute function public.sync_purchase_summary();

drop trigger if exists trg_sync_inventory on public.inventory_movement;
create trigger trg_sync_inventory after insert or update on public.inventory_movement
  for each row execute function public.sync_inventory_summary();

-- ── 기존 데이터 백필 ──────────────────────────────────────────────────
insert into public.daily_sales_summary (company_id, store_id, day, order_cnt, amount)
select company_id, store_id, sale_date, count(*), coalesce(sum(amount),0)
from public.sales_record where company_id is not null and store_id is not null
group by company_id, store_id, sale_date
on conflict (company_id, store_id, day) do update set order_cnt=excluded.order_cnt, amount=excluded.amount, updated_at=now();

insert into public.monthly_sales_summary (company_id, store_id, ym, order_cnt, amount)
select company_id, store_id, to_char(sale_date,'YYYY-MM'), count(*), coalesce(sum(amount),0)
from public.sales_record where company_id is not null and store_id is not null
group by company_id, store_id, to_char(sale_date,'YYYY-MM')
on conflict (company_id, store_id, ym) do update set order_cnt=excluded.order_cnt, amount=excluded.amount, updated_at=now();

insert into public.daily_purchase_summary (company_id, store_id, day, doc_cnt, amount)
select company_id, store_id, coalesce(invoice_date, created_at::date), count(*), coalesce(sum(total_amount),0)
from public.ocr_document where company_id is not null and store_id is not null and document_status='POSTED'
group by company_id, store_id, coalesce(invoice_date, created_at::date)
on conflict (company_id, store_id, day) do update set doc_cnt=excluded.doc_cnt, amount=excluded.amount, updated_at=now();

insert into public.monthly_purchase_summary (company_id, store_id, ym, doc_cnt, amount)
select company_id, store_id, to_char(coalesce(invoice_date, created_at::date),'YYYY-MM'), count(*), coalesce(sum(total_amount),0)
from public.ocr_document where company_id is not null and store_id is not null and document_status='POSTED'
group by company_id, store_id, to_char(coalesce(invoice_date, created_at::date),'YYYY-MM')
on conflict (company_id, store_id, ym) do update set doc_cnt=excluded.doc_cnt, amount=excluded.amount, updated_at=now();

insert into public.inventory_summary (company_id, store_id, product_key, on_hand_qty, net_amount, low_stock)
select company_id, store_id, raw_product_name,
  coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0),
  coalesce(sum(case when movement_type='OUT' then -amount else amount end),0),
  (coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0) <= 0)
from public.inventory_movement where company_id is not null and store_id is not null and is_active=true
group by company_id, store_id, raw_product_name
on conflict (company_id, store_id, product_key) do update
  set on_hand_qty=excluded.on_hand_qty, net_amount=excluded.net_amount, low_stock=excluded.low_stock, updated_at=now();

-- =====================================================================
-- 검증(요약 = 원본 대조):
--   select (select coalesce(sum(amount),0) from public.sales_record)         as raw_sales,
--          (select coalesce(sum(amount),0) from public.daily_sales_summary)  as sum_sales;   -- 같아야 정상
--   select (select coalesce(sum(total_amount),0) from public.ocr_document where document_status='POSTED') as raw_buy,
--          (select coalesce(sum(amount),0) from public.daily_purchase_summary) as sum_buy;    -- 같아야 정상
--   select count(*) from public.inventory_summary;
-- =====================================================================
