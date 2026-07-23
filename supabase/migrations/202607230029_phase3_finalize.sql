-- =====================================================================
-- Phase 3 마무리 — 파티션 전환된 테이블에 트리거/인덱스 재보장 (idempotent, 안전)
-- 여러 번의 전환 시도로 트리거가 누락됐을 수 있어 확실히 재부착한다.
-- 데이터 변경 없음. 앱 쓰기·집계 정상 동작 보장.
-- =====================================================================

-- inventory_movement 트리거
drop trigger if exists trg_fill_cs on public.inventory_movement;
create trigger trg_fill_cs before insert on public.inventory_movement
  for each row execute function public.fill_company_store();
drop trigger if exists trg_sync_inventory on public.inventory_movement;
create trigger trg_sync_inventory after insert or update on public.inventory_movement
  for each row execute function public.sync_inventory_summary();

-- sales_record 트리거
drop trigger if exists trg_fill_cs on public.sales_record;
create trigger trg_fill_cs before insert on public.sales_record
  for each row execute function public.fill_company_store();
drop trigger if exists trg_sync_sales on public.sales_record;
create trigger trg_sync_sales after insert or update on public.sales_record
  for each row execute function public.sync_sales_summary();

-- 인덱스 재보장(있으면 무시)
create index if not exists inv_mv_tenant_date_p on public.inventory_movement (tenant_id, movement_date desc);
create index if not exists inv_mv_tenant_prod_p on public.inventory_movement (tenant_id, raw_product_name);
create index if not exists inv_mv_doc_p on public.inventory_movement (ocr_document_id);
create index if not exists inv_mv_company_created_p on public.inventory_movement (company_id, created_at desc);
create index if not exists inv_mv_store_date_p on public.inventory_movement (company_id, store_id, movement_date desc);
create index if not exists inv_mv_expiry_p on public.inventory_movement (tenant_id, expiry_date);
create index if not exists sales_record_tenant_date_p on public.sales_record (tenant_id, sale_date desc);
create index if not exists sales_record_company_created_p on public.sales_record (company_id, created_at desc);
create index if not exists sales_record_store_date_p on public.sales_record (company_id, store_id, sale_date desc);

-- inventory_balance 뷰 재보장
create or replace view public.inventory_balance as
select tenant_id, raw_product_name, origin,
  sum(case when movement_type = 'OUT' then -quantity else quantity end) as on_hand_qty,
  sum(case when movement_type = 'OUT' then -amount else amount end) as net_amount,
  count(*) as movement_count,
  max(movement_date) as last_movement_date
from public.inventory_movement
where is_active = true
group by tenant_id, raw_product_name, origin;

-- 재고 요약 재계산(현재 파티션 데이터 기준)
insert into public.inventory_summary (company_id, store_id, product_key, on_hand_qty, net_amount, low_stock)
select company_id, store_id, raw_product_name,
  coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0),
  coalesce(sum(case when movement_type='OUT' then -amount else amount end),0),
  (coalesce(sum(case when movement_type='OUT' then -quantity else quantity end),0) <= 0)
from public.inventory_movement
where company_id is not null and store_id is not null and is_active=true
group by company_id, store_id, raw_product_name
on conflict (company_id, store_id, product_key) do update
  set on_hand_qty=excluded.on_hand_qty, net_amount=excluded.net_amount, low_stock=excluded.low_stock, updated_at=now();

-- 검증:
--   select tgrelid::regclass as tbl, tgname from pg_trigger
--   where tgrelid in ('public.inventory_movement'::regclass,'public.sales_record'::regclass)
--     and not tgisinternal order by 1,2;
--   -- inventory_movement: trg_fill_cs, trg_sync_inventory / sales_record: trg_fill_cs, trg_sync_sales 가 보이면 완료
