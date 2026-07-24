-- =====================================================================
-- 스캔 수신부 — 에이전트가 바코드만 POST 하면 자동 재고 OUT + 매출 기록
-- 흐름: scan_event INSERT → 트리거가 바코드 파싱 → product_barcode 매핑 →
--       inventory_movement OUT + sales_record(STORE) 자동 생성.
-- 미등록 바코드는 status=PENDING 으로 남겨 나중에 1회 매핑.
-- RLS off·anon 접근(기존과 동일). 트리거는 SECURITY DEFINER.
-- =====================================================================

create table if not exists public.scan_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  barcode text not null,
  device text,
  status text not null default 'PENDING',   -- PROCESSED / PENDING(미등록·계산불가)
  matched_product text,
  note text,
  scanned_at timestamptz not null default now()
);
create index if not exists scan_event_tenant_time_idx on public.scan_event (tenant_id, scanned_at desc);
create index if not exists scan_event_status_idx on public.scan_event (tenant_id, status);
alter table public.scan_event disable row level security;
grant all on public.scan_event to anon, authenticated;

create or replace function public.process_scan_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bc text := regexp_replace(coalesce(new.barcode,''), '\D', '', 'g');
  itemkey text;
  price int;
  map public.product_barcode%rowtype;
  q numeric; amt numeric;
begin
  -- KR 매장 바코드: 13자리, '2' 시작 → 품목코드(2~7) + 금액(8~12)
  if bc ~ '^2[0-9]{12}$' then
    itemkey := substr(bc, 2, 6);
    price := substr(bc, 8, 5)::int;
  else
    itemkey := bc; price := null;
  end if;

  select * into map from public.product_barcode
    where tenant_id = new.tenant_id and barcode_key = itemkey limit 1;

  if not found then
    new.status := 'PENDING'; new.note := '미등록 바코드'; return new;
  end if;

  if map.weigh_type = 'PRICE_EMBED' and price is not null and coalesce(map.default_price,0) > 0 then
    amt := price; q := round((price::numeric / map.default_price), 3);
  elsif map.weigh_type = 'WEIGHT_EMBED' and price is not null then
    q := round((price::numeric / 1000), 3); amt := round(q * coalesce(map.default_price,0));
  elsif map.weigh_type = 'FIXED' then
    q := 1; amt := coalesce(map.default_price,0);
  else
    new.status := 'PENDING'; new.note := '계산 불가(단가/방식 확인)'; return new;
  end if;

  insert into public.inventory_movement
    (tenant_id, movement_type, raw_product_name, unit, quantity, unit_price, amount, movement_date, memo)
    values (new.tenant_id, 'OUT', map.raw_product_name, coalesce(map.unit,'kg'), q, coalesce(map.default_price,0), amt, current_date, '스캔판매');

  insert into public.sales_record
    (tenant_id, sale_date, item_name, quantity, unit_price, amount, channel, memo)
    values (new.tenant_id, current_date, map.raw_product_name, q, coalesce(map.default_price,0), amt, 'STORE', '스캔판매');

  new.status := 'PROCESSED'; new.matched_product := map.raw_product_name; new.note := null;
  return new;
end $$;

drop trigger if exists trg_process_scan on public.scan_event;
create trigger trg_process_scan before insert on public.scan_event
  for each row execute function public.process_scan_event();

-- 검증:
--   insert into public.scan_event(tenant_id,barcode,device)
--     values ('881f6cc1-b552-468c-b9b4-152edb464e61','2090120240002','TEST');
--   select status, matched_product, note from public.scan_event order by scanned_at desc limit 1;
--   (사전에 product_barcode 에 090120=채끝등심, 단가 등록돼 있어야 PROCESSED)
-- =====================================================================
