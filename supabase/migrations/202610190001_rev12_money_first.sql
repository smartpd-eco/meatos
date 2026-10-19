-- =====================================================================
-- Rev 1.2 "돈 먼저(Money-first)" · 202610190001
--
-- ① 품목 등록 없이 매출부터 기록
--    - 저울 라벨(13자리 '2'로 시작)은 바코드 안의 금액으로 즉시 매출을 기록한다.
--      품목이 등록돼 있지 않으면 "미분류(품목코드)"로 남기고 needs_mapping = true.
--    - 나중에 그 품목코드를 한 번 지정하면(product_barcode 저장) 지난 미분류 매출이
--      자동으로 그 품목 이름·중량으로 바뀌고 재고도 소급 차감된다.
--    - 매출과 재고를 한 트랜잭션에서 저장한다(웹 판매 스캔의 "재고만 빠짐" 문제 해결).
-- ② 기초재고 없이 시작
--    - 재고가 부족해도 판매를 거부하지 않는다(실제로 팔린 매출을 잃지 않는다).
--      재고는 마이너스가 될 수 있고, 화면에서 "확인 필요"로만 알린다.
-- ③ 사장님은 앱을 안 열어도
--    - 오늘의 돈 요약(get_money_brief)과 매일 아침 알림 구독(money_brief_subscription).
--
-- 원칙: 기존 테이블·데이터를 지우지 않는 additive 마이그레이션. 재실행 안전.
-- 기존 관찰(shadow) 함수 capture_pos_sale_observation_agent 는 그대로 둔다(Rev 1.1 보관).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 0) 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────
alter table public.sales_record
  add column if not exists product_code text,
  add column if not exists needs_mapping boolean not null default false;

create index if not exists sales_record_needs_mapping_idx
  on public.sales_record (tenant_id, product_code)
  where needs_mapping;

-- ─────────────────────────────────────────────────────────────────────
-- 1) 핵심: 스캔 1건 → 매출(항상) + 재고(품목이 지정된 경우) 원자 기록
--    클라이언트에 직접 공개하지 않는 내부 함수. 아래 두 래퍼만 호출한다.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.meatos_record_scan_sale(
  p_tenant_id uuid,
  p_company_id uuid,
  p_store_id uuid,
  p_barcode text,
  p_quantity numeric,
  p_sale_amount numeric,
  p_sold_at timestamptz,
  p_external_transaction_id text,
  p_device text,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_barcode text := trim(coalesce(p_barcode, ''));
  transaction_id text := nullif(trim(coalesce(p_external_transaction_id, '')), '');
  device_label text := nullif(trim(coalesce(p_device, '')), '');
  source_label text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'local-agent');
  sale_day date := (coalesce(p_sold_at, now()) at time zone 'Asia/Seoul')::date;
  item_key text;
  embedded_value numeric;
  is_scale_label boolean := false;
  mapping public.product_barcode%rowtype;
  has_mapping boolean := false;
  sale_quantity numeric(18,3);
  sale_amount numeric(18,2);
  unit_price numeric(18,2);
  item_label text;
  movement_id uuid;
  sale_id uuid;
  available_quantity numeric(18,3);
  stock_warning boolean := false;
begin
  -- 중복 전송(재시도) 방지
  if transaction_id is not null and (
       exists (select 1 from public.scan_event
                where tenant_id = p_tenant_id and external_transaction_id = transaction_id)
    or exists (select 1 from public.sales_record
                where tenant_id = p_tenant_id and external_transaction_id = transaction_id)
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'shadowMode', false);
  end if;

  if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' then
    if transaction_id is not null then
      insert into public.scan_event (
        tenant_id, company_id, store_id, barcode, device, status, note,
        external_transaction_id, source, error_code
      ) values (
        p_tenant_id, p_company_id, p_store_id, left(normalized_barcode, 64), device_label,
        'FAILED', '바코드 형식 아님', transaction_id, source_label, 'INVALID_BARCODE'
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'INVALID_BARCODE');
  end if;

  if normalized_barcode ~ '^2[0-9]{12}$' then
    is_scale_label := true;
    item_key := substr(normalized_barcode, 2, 6);
    embedded_value := substr(normalized_barcode, 8, 5)::numeric;
  else
    item_key := normalized_barcode;
    embedded_value := null;
  end if;

  select * into mapping
    from public.product_barcode
   where tenant_id = p_tenant_id
     and barcode_key = item_key
     and (store_id = p_store_id or store_id is null)
   order by (store_id = p_store_id) desc nulls last, updated_at desc
   limit 1;
  has_mapping := found;

  -- 수량·금액 계산
  if p_quantity is not null and p_quantity > 0 then
    sale_quantity := round(p_quantity, 3);
    sale_amount := round(coalesce(p_sale_amount,
      sale_quantity * coalesce(case when has_mapping then mapping.default_price end, 0)), 2);
  elsif has_mapping then
    if mapping.weigh_type = 'PRICE_EMBED' and embedded_value is not null then
      sale_amount := embedded_value;
      sale_quantity := case when coalesce(mapping.default_price, 0) > 0
                            then round(embedded_value / mapping.default_price, 3) end;
    elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
      sale_quantity := round(embedded_value / 1000, 3);
      sale_amount := round(sale_quantity * coalesce(mapping.default_price, 0), 2);
    elsif mapping.weigh_type = 'FIXED' then
      sale_quantity := 1;
      sale_amount := round(coalesce(p_sale_amount, mapping.default_price, 0), 2);
    elsif p_sale_amount is not null then
      sale_amount := round(p_sale_amount, 2);
    end if;
  elsif is_scale_label then
    -- 품목 미지정 저울 라벨: 라벨 금액으로 매출부터 기록 (대부분의 정육 저울은 금액 내장)
    sale_amount := embedded_value;
  elsif p_sale_amount is not null then
    sale_amount := round(p_sale_amount, 2);
  end if;

  if sale_amount is null then
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      p_tenant_id, p_company_id, p_store_id, normalized_barcode, device_label,
      'PENDING',
      case when has_mapping then '판매 금액 확인 필요' else '등록되지 않은 일반 바코드(금액 정보 없음)' end,
      transaction_id, source_label,
      case when has_mapping then 'SALE_VALUE_REQUIRED' else 'BARCODE_NOT_MAPPED' end
    );
    return jsonb_build_object('ok', false,
      'error', case when has_mapping then 'SALE_VALUE_REQUIRED' else 'BARCODE_NOT_MAPPED' end);
  end if;

  if sale_amount < 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SALE_AMOUNT');
  end if;

  unit_price := case when sale_quantity is not null and sale_quantity > 0
                     then round(sale_amount / sale_quantity, 2)
                     else case when has_mapping then mapping.default_price end end;
  item_label := case when has_mapping then mapping.raw_product_name
                     else '미분류 (' || item_key || ')' end;

  -- 재고 차감: 품목이 지정되고 중량을 알 때만. 재고가 부족해도 판매는 거부하지 않는다.
  if has_mapping and sale_quantity is not null and sale_quantity > 0 then
    select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
      into available_quantity
      from public.inventory_movement
     where tenant_id = p_tenant_id
       and store_id is not distinct from p_store_id
       and raw_product_name = mapping.raw_product_name
       and is_active;
    stock_warning := available_quantity < sale_quantity;

    insert into public.inventory_movement (
      tenant_id, company_id, store_id, movement_type, raw_product_name,
      unit, quantity, unit_price, amount, movement_date, memo
    ) values (
      p_tenant_id, p_company_id, p_store_id, 'OUT', mapping.raw_product_name,
      coalesce(mapping.unit, 'kg'), sale_quantity, coalesce(unit_price, 0), sale_amount,
      sale_day, case when source_label = 'web-scan' then '판매 스캔' else 'POS 자동 판매' end
    ) returning id into movement_id;
  end if;

  insert into public.sales_record (
    tenant_id, company_id, store_id, sale_date, item_name, quantity,
    unit_price, amount, channel, memo, barcode,
    external_transaction_id, sold_at, source, is_cancelled,
    inventory_movement_id, product_code, needs_mapping
  ) values (
    p_tenant_id, p_company_id, p_store_id, sale_day, item_label, sale_quantity,
    unit_price, sale_amount, 'STORE',
    case when source_label = 'web-scan' then '스캔 판매' else 'POS 자동 판매' end,
    normalized_barcode, transaction_id, coalesce(p_sold_at, now()), source_label, false,
    movement_id, item_key, not has_mapping
  ) returning id into sale_id;

  insert into public.scan_event (
    tenant_id, company_id, store_id, barcode, device, status,
    matched_product, quantity, sale_amount, note, external_transaction_id,
    source, error_code, processed_at
  ) values (
    p_tenant_id, p_company_id, p_store_id, normalized_barcode, device_label, 'PROCESSED',
    case when has_mapping then mapping.raw_product_name end, sale_quantity, sale_amount,
    case when has_mapping then null else '미분류 매출로 기록(품목 지정 대기)' end,
    transaction_id, source_label,
    case when has_mapping then null else 'UNMAPPED_SALE_RECORDED' end, now()
  );

  return jsonb_build_object(
    'ok', true,
    'shadowMode', false,
    'saleId', sale_id,
    'product', item_label,
    'productCode', item_key,
    'unmapped', not has_mapping,
    'quantity', sale_quantity,
    'amount', sale_amount,
    'stockWarning', stock_warning
  );
end;
$$;

alter function public.meatos_record_scan_sale(uuid,uuid,uuid,text,numeric,numeric,timestamptz,text,text,text) owner to postgres;
revoke all on function public.meatos_record_scan_sale(uuid,uuid,uuid,text,numeric,numeric,timestamptz,text,text,text)
  from public, anon, authenticated;

-- 1-a) POS 에이전트용 (기존 에이전트가 보내는 파라미터 그대로 → 설치본 주소만 바꾸면 됨)
create or replace function public.record_pos_sale_agent(
  p_agent_token text,
  p_barcode text,
  p_quantity numeric default null,
  p_sale_amount numeric default null,
  p_sold_at timestamptz default now(),
  p_external_transaction_id text default null,
  p_device text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  credential public.pos_agent_credential%rowtype;
  result jsonb;
begin
  if p_agent_token is null or length(p_agent_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  select * into credential
    from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  result := public.meatos_record_scan_sale(
    credential.tenant_id, credential.company_id, credential.store_id,
    p_barcode, p_quantity, p_sale_amount, p_sold_at, p_external_transaction_id,
    coalesce(nullif(trim(coalesce(p_device, '')), ''), credential.device), 'local-agent'
  );

  update public.pos_agent_credential set last_used_at = now() where id = credential.id;
  return result;
end;
$$;

alter function public.record_pos_sale_agent(text,text,numeric,numeric,timestamptz,text,text) owner to postgres;
revoke all on function public.record_pos_sale_agent(text,text,numeric,numeric,timestamptz,text,text) from public;
grant execute on function public.record_pos_sale_agent(text,text,numeric,numeric,timestamptz,text,text)
  to anon, authenticated;

-- 공통: 로그인 사용자의 승인된 사업장·매장 찾기
create or replace function public.meatos_current_workspace()
returns table (company_id uuid, store_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_account public.account%rowtype;
  target_store uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_account
    from public.account
   where auth_user_id = auth.uid()
     and member_status = 'APPROVED'
     and lower(status) = 'active'
   limit 1;
  if not found or current_account.company_id is null then
    raise exception 'APPROVED_COMPANY_REQUIRED';
  end if;
  if not public.company_membership_allowed(current_account.company_id) then
    raise exception 'COMPANY_ACCESS_DENIED';
  end if;
  target_store := current_account.store_id;
  if target_store is null then
    select s.id into target_store
      from public.store s
     where s.company_id = current_account.company_id and s.is_active
     order by s.is_default desc, s.created_at
     limit 1;
  end if;
  if target_store is null then raise exception 'STORE_REQUIRED'; end if;
  company_id := current_account.company_id;
  store_id := target_store;
  return next;
end;
$$;

alter function public.meatos_current_workspace() owner to postgres;
revoke all on function public.meatos_current_workspace() from public, anon;
grant execute on function public.meatos_current_workspace() to authenticated;

-- 1-b) 웹 "판매 스캔" 화면용 (로그인 사용자)
create or replace function public.record_web_scan_sale(
  p_barcode text,
  p_quantity numeric default null,
  p_sale_amount numeric default null,
  p_external_transaction_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
begin
  select * into ws from public.meatos_current_workspace();
  return public.meatos_record_scan_sale(
    ws.company_id, ws.company_id, ws.store_id,
    p_barcode, p_quantity, p_sale_amount, now(),
    coalesce(nullif(trim(coalesce(p_external_transaction_id, '')), ''), 'WEB-' || gen_random_uuid()::text),
    'WEB', 'web-scan'
  );
end;
$$;

alter function public.record_web_scan_sale(text,numeric,numeric,text) owner to postgres;
revoke all on function public.record_web_scan_sale(text,numeric,numeric,text) from public, anon;
grant execute on function public.record_web_scan_sale(text,numeric,numeric,text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2) 품목 지정 시 지난 미분류 매출 자동 반영 (+ 재고 소급 차감)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.meatos_apply_mapping_to_pending_sales()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  embedded_value numeric;
  new_qty numeric(18,3);
  new_amount numeric(18,2);
  new_price numeric(18,2);
  movement_id uuid;
begin
  for s in
    select *
      from public.sales_record
     where tenant_id = new.tenant_id
       and product_code = new.barcode_key
       and needs_mapping
       and not coalesce(is_cancelled, false)
       and (new.store_id is null or store_id = new.store_id)
     for update
  loop
    embedded_value := case when coalesce(s.barcode, '') ~ '^2[0-9]{12}$'
                           then substr(s.barcode, 8, 5)::numeric end;
    new_amount := s.amount;
    new_qty := null;

    if new.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
      new_qty := round(embedded_value / 1000, 3);
      new_amount := round(new_qty * coalesce(new.default_price, 0), 2);
    elsif new.weigh_type = 'FIXED' then
      new_qty := 1;
    elsif coalesce(new.default_price, 0) > 0 then
      new_qty := round(s.amount / new.default_price, 3);
    end if;

    new_price := case when new_qty is not null and new_qty > 0
                      then round(new_amount / new_qty, 2) else new.default_price end;

    movement_id := null;
    if new_qty is not null and new_qty > 0 and s.inventory_movement_id is null then
      insert into public.inventory_movement (
        tenant_id, company_id, store_id, movement_type, raw_product_name,
        unit, quantity, unit_price, amount, movement_date, memo
      ) values (
        s.tenant_id, s.company_id, s.store_id, 'OUT', new.raw_product_name,
        coalesce(new.unit, 'kg'), new_qty, coalesce(new_price, 0), new_amount,
        s.sale_date, '품목 지정 소급 판매'
      ) returning id into movement_id;
    end if;

    update public.sales_record
       set item_name = new.raw_product_name,
           quantity = new_qty,
           unit_price = new_price,
           amount = new_amount,
           needs_mapping = false,
           inventory_movement_id = coalesce(inventory_movement_id, movement_id)
     where id = s.id and created_at = s.created_at;

    if s.external_transaction_id is not null then
      update public.scan_event
         set matched_product = new.raw_product_name,
             quantity = new_qty,
             error_code = null,
             note = '품목 지정으로 소급 반영'
       where tenant_id = s.tenant_id
         and external_transaction_id = s.external_transaction_id;
    end if;
  end loop;
  return null;
end;
$$;

alter function public.meatos_apply_mapping_to_pending_sales() owner to postgres;

drop trigger if exists trg_apply_mapping_to_pending_sales on public.product_barcode;
create trigger trg_apply_mapping_to_pending_sales
after insert or update of raw_product_name, default_price, weigh_type, unit
on public.product_barcode
for each row execute function public.meatos_apply_mapping_to_pending_sales();

-- ─────────────────────────────────────────────────────────────────────
-- 3) 수동 판매입력: 재고 부족이어도 판매 기록 (기초재고 없이 시작 가능)
--    기존 record_manual_sale 과 같은 입력·출력. 재고 부족 차단만 제거.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.record_manual_sale(
  p_item_name text,
  p_quantity numeric,
  p_unit_price numeric default null,
  p_amount numeric default null,
  p_sale_date date default null,
  p_channel text default 'STORE',
  p_memo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ws record;
  normalized_item text := left(trim(coalesce(p_item_name, '')), 200);
  normalized_quantity numeric(18,3) := round(coalesce(p_quantity, 0), 3);
  normalized_amount numeric(18,2);
  normalized_price numeric(18,2);
  normalized_channel text := upper(coalesce(nullif(trim(p_channel), ''), 'STORE'));
  sale_day date := coalesce(p_sale_date, (now() at time zone 'Asia/Seoul')::date);
  available_quantity numeric(18,3);
  movement_id uuid;
  sale_id uuid;
begin
  select * into ws from public.meatos_current_workspace();
  if normalized_item = '' then raise exception 'ITEM_REQUIRED'; end if;
  if normalized_quantity <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;

  normalized_amount := round(coalesce(p_amount, normalized_quantity * coalesce(p_unit_price, 0)), 2);
  normalized_price := round(coalesce(p_unit_price,
    case when normalized_quantity > 0 then normalized_amount / normalized_quantity else 0 end
  ), 2);
  if normalized_amount < 0 or normalized_price < 0 then raise exception 'INVALID_SALE_AMOUNT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    ws.company_id::text || ':' || ws.store_id::text || ':' || normalized_item, 0
  ));

  select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
    into available_quantity
    from public.inventory_movement
   where tenant_id = ws.company_id
     and company_id = ws.company_id
     and store_id = ws.store_id
     and raw_product_name = normalized_item
     and is_active;

  insert into public.inventory_movement (
    tenant_id, company_id, store_id, movement_type, raw_product_name,
    unit, quantity, unit_price, amount, movement_date, memo, created_by
  ) values (
    ws.company_id, ws.company_id, ws.store_id,
    'OUT', normalized_item, 'kg', normalized_quantity, normalized_price,
    normalized_amount, sale_day,
    '수기 매출' || coalesce(' · ' || nullif(trim(p_memo), ''), ''),
    auth.uid()
  ) returning id into movement_id;

  insert into public.sales_record (
    tenant_id, company_id, store_id, sale_date, item_name, quantity,
    unit_price, amount, channel, memo, external_transaction_id,
    sold_at, source, is_cancelled, inventory_movement_id
  ) values (
    ws.company_id, ws.company_id, ws.store_id,
    sale_day, normalized_item, normalized_quantity, normalized_price,
    normalized_amount, normalized_channel, nullif(trim(p_memo), ''),
    'MANUAL:' || gen_random_uuid()::text,
    now(), 'manual-web', false, movement_id
  ) returning id into sale_id;

  return jsonb_build_object(
    'ok', true,
    'saleId', sale_id,
    'inventoryMovementId', movement_id,
    'quantity', normalized_quantity,
    'amount', normalized_amount,
    'stockWarning', available_quantity < normalized_quantity
  );
end;
$$;

revoke all on function public.record_manual_sale(text,numeric,numeric,numeric,date,text,text) from public, anon;
grant execute on function public.record_manual_sale(text,numeric,numeric,numeric,date,text,text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4) 오늘의 돈 요약
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.meatos_money_brief(
  p_company_id uuid,
  p_store_id uuid,
  p_day date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d date := coalesce(p_day, (now() at time zone 'Asia/Seoul')::date);
  month_start date := date_trunc('month', coalesce(p_day, (now() at time zone 'Asia/Seoul')::date))::date;
  result jsonb;
begin
  with sales as (
    select sale_date, amount, needs_mapping, product_code, barcode
      from public.sales_record
     where company_id = p_company_id
       and (p_store_id is null or store_id = p_store_id)
       and not coalesce(is_cancelled, false)
       and sale_date >= least(month_start, d - 8)
       and sale_date <= d
  ),
  unmapped as (
    select product_code, count(*) as cnt, sum(amount) as amt, max(barcode) as sample_barcode
      from public.sales_record
     where company_id = p_company_id
       and (p_store_id is null or store_id = p_store_id)
       and needs_mapping and not coalesce(is_cancelled, false)
     group by product_code
     order by count(*) desc
     limit 20
  ),
  deposits as (
    select deposit_date, sum(deposit_amt) as amt, count(*) as cnt
      from public.card_settlement
     where company_id = p_company_id
       and (p_store_id is null or store_id is null or store_id = p_store_id)
       and status = 'SCHEDULED'
       and deposit_date between d and d + 6
     group by deposit_date
  ),
  purchases as (
    select coalesce(sum(amount), 0) as amt
      from public.inventory_movement
     where company_id = p_company_id
       and (p_store_id is null or store_id = p_store_id)
       and movement_type = 'IN' and is_active
       and coalesce(memo, '') not like '판매취소 재고원복%'
       and movement_date between month_start and d
  )
  select jsonb_build_object(
    'day', d,
    'today', jsonb_build_object(
      'amount', coalesce((select sum(amount) from sales where sale_date = d), 0),
      'count', (select count(*) from sales where sale_date = d)),
    'yesterday', jsonb_build_object(
      'amount', coalesce((select sum(amount) from sales where sale_date = d - 1), 0),
      'count', (select count(*) from sales where sale_date = d - 1)),
    'lastWeekSameDay', jsonb_build_object(
      'amount', coalesce((select sum(amount) from sales where sale_date = d - 8), 0)),
    'month', jsonb_build_object(
      'sales', coalesce((select sum(amount) from sales where sale_date >= month_start), 0),
      'purchases', (select amt from purchases)),
    'unmapped', jsonb_build_object(
      'count', coalesce((select sum(cnt) from unmapped), 0),
      'amount', coalesce((select sum(amt) from unmapped), 0),
      'codes', coalesce((select jsonb_agg(jsonb_build_object(
          'code', product_code, 'count', cnt, 'amount', amt, 'sampleBarcode', sample_barcode))
        from unmapped), '[]'::jsonb)),
    'cardDeposits', jsonb_build_object(
      'hasData', exists (select 1 from public.card_settlement where company_id = p_company_id),
      'next7Days', coalesce((select sum(amt) from deposits), 0),
      'today', coalesce((select amt from deposits where deposit_date = d), 0),
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', deposit_date, 'amount', amt, 'count', cnt)
                                         order by deposit_date) from deposits), '[]'::jsonb)),
    'expirySoon', (select count(*) from public.inventory_movement
                    where company_id = p_company_id
                      and (p_store_id is null or store_id = p_store_id)
                      and movement_type = 'IN' and is_active
                      and expiry_date between d and d + 3)
  ) into result;
  return result;
end;
$$;

alter function public.meatos_money_brief(uuid,uuid,date) owner to postgres;
revoke all on function public.meatos_money_brief(uuid,uuid,date) from public, anon, authenticated;
grant execute on function public.meatos_money_brief(uuid,uuid,date) to service_role;

create or replace function public.get_money_brief(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
begin
  select * into ws from public.meatos_current_workspace();
  return public.meatos_money_brief(ws.company_id, ws.store_id, p_day);
end;
$$;

alter function public.get_money_brief(date) owner to postgres;
revoke all on function public.get_money_brief(date) from public, anon;
grant execute on function public.get_money_brief(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5) 매일 아침 알림 구독 (문자/알림톡 발송사는 연결 후 Edge Function이 사용)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.money_brief_subscription (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  store_id      uuid,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  phone         text not null,
  channel       text not null default 'SMS' check (channel in ('SMS', 'ALIMTALK')),
  send_hour     int  not null default 8 check (send_hour between 5 and 22),
  enabled       boolean not null default true,
  last_sent_on  date,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, auth_user_id)
);

alter table public.money_brief_subscription enable row level security;
revoke all on public.money_brief_subscription from public, anon, authenticated;
grant all on public.money_brief_subscription to service_role;

create or replace function public.get_my_brief_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
  sub public.money_brief_subscription%rowtype;
begin
  select * into ws from public.meatos_current_workspace();
  select * into sub from public.money_brief_subscription
   where company_id = ws.company_id and auth_user_id = auth.uid();
  if not found then
    return jsonb_build_object('subscribed', false);
  end if;
  return jsonb_build_object('subscribed', true, 'phone', sub.phone, 'sendHour', sub.send_hour,
    'enabled', sub.enabled, 'channel', sub.channel, 'lastSentOn', sub.last_sent_on);
end;
$$;

alter function public.get_my_brief_subscription() owner to postgres;
revoke all on function public.get_my_brief_subscription() from public, anon;
grant execute on function public.get_my_brief_subscription() to authenticated;

create or replace function public.set_my_brief_subscription(
  p_phone text,
  p_send_hour int default 8,
  p_enabled boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
  phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select * into ws from public.meatos_current_workspace();
  if phone_digits !~ '^01[016789][0-9]{7,8}$' then raise exception 'INVALID_PHONE'; end if;
  insert into public.money_brief_subscription (company_id, store_id, auth_user_id, phone, send_hour, enabled)
  values (ws.company_id, ws.store_id, auth.uid(), phone_digits, greatest(5, least(22, coalesce(p_send_hour, 8))), coalesce(p_enabled, true))
  on conflict (company_id, auth_user_id) do update
    set phone = excluded.phone, store_id = excluded.store_id, send_hour = excluded.send_hour,
        enabled = excluded.enabled, updated_at = now();
  return public.get_my_brief_subscription();
end;
$$;

alter function public.set_my_brief_subscription(text,int,boolean) owner to postgres;
revoke all on function public.set_my_brief_subscription(text,int,boolean) from public, anon;
grant execute on function public.set_my_brief_subscription(text,int,boolean) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- 실행 후 확인:
--   select proname from pg_proc where proname in
--     ('record_pos_sale_agent','record_web_scan_sale','get_money_brief','set_my_brief_subscription');
-- 되돌리기(Rev 1.1 관찰 모드로): 자동 판매연동에서 "관찰만" 설치본으로 다시 설치하면 된다.
-- =====================================================================
