-- =====================================================================
-- Delivery-platform fulfillment ledger.
-- Physical inventory is consumed from scale labels, while gross platform
-- sales are confirmed from the platform order amount. The entire order is
-- committed atomically so abandoned scans never change stock or sales.
-- =====================================================================

create table if not exists public.delivery_order (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid not null references public.store(id) on delete cascade,
  channel text not null default 'COUPANG_EATS',
  external_order_id text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'FULFILLED', 'SETTLED', 'CANCELLED', 'REVIEW')),
  order_amount numeric(18,2) not null check (order_amount > 0),
  scale_amount numeric(18,2) not null default 0,
  settlement_amount numeric(18,2),
  platform_fee numeric(18,2),
  fulfilled_at timestamptz,
  settled_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, external_order_id)
);

create index if not exists delivery_order_store_created_idx
  on public.delivery_order (company_id, store_id, created_at desc);

create table if not exists public.delivery_order_line (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_order(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  barcode text not null,
  product_name text not null,
  unit text not null default 'kg',
  quantity numeric(18,3) not null check (quantity > 0),
  scale_amount numeric(18,2) not null check (scale_amount >= 0),
  allocated_sales_amount numeric(18,2) not null default 0,
  -- Partitioned ledgers use (id, created_at) as their primary key, so these
  -- audit pointers intentionally remain UUID references without an FK.
  inventory_movement_id uuid,
  sales_record_id uuid,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, line_no)
);

alter table public.delivery_order enable row level security;
alter table public.delivery_order_line enable row level security;

drop policy if exists delivery_order_select_member on public.delivery_order;
create policy delivery_order_select_member on public.delivery_order
  for select to authenticated
  using (public.company_membership_allowed(company_id));

drop policy if exists delivery_order_line_select_member on public.delivery_order_line;
create policy delivery_order_line_select_member on public.delivery_order_line
  for select to authenticated
  using (
    exists (
      select 1 from public.delivery_order o
       where o.id = order_id
         and public.company_membership_allowed(o.company_id)
    )
  );

revoke all on public.delivery_order, public.delivery_order_line from public, anon;
grant select on public.delivery_order, public.delivery_order_line to authenticated;
grant all on public.delivery_order, public.delivery_order_line to service_role;

create or replace function public.process_delivery_fulfillment(
  p_store_id uuid,
  p_channel text,
  p_external_order_id text,
  p_order_amount numeric,
  p_lines jsonb,
  p_fulfilled_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_store public.store%rowtype;
  new_order public.delivery_order%rowtype;
  mapping public.product_barcode%rowtype;
  payload jsonb;
  normalized_channel text := upper(trim(coalesce(p_channel, '')));
  normalized_order_id text := left(trim(coalesce(p_external_order_id, '')), 80);
  normalized_barcode text;
  item_key text;
  embedded_value numeric;
  line_quantity numeric(18,3);
  line_scale_amount numeric(18,2);
  total_scale_amount numeric(18,2) := 0;
  available_quantity numeric(18,3);
  allocated_amount numeric(18,2);
  allocated_so_far numeric(18,2) := 0;
  line_count integer;
  current_no integer := 0;
  movement_id uuid;
  sale_id uuid;
  saved_line public.delivery_order_line%rowtype;
  sale_channel text;
  sale_day date := (coalesce(p_fulfilled_at, now()) at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception 'DELIVERY_NOT_AUTHENTICATED'; end if;
  if normalized_channel not in ('COUPANG_EATS') then raise exception 'DELIVERY_CHANNEL_NOT_SUPPORTED'; end if;
  if length(normalized_order_id) < 3 then raise exception 'DELIVERY_ORDER_ID_REQUIRED'; end if;
  if p_order_amount is null or p_order_amount <= 0 then raise exception 'DELIVERY_ORDER_AMOUNT_REQUIRED'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'DELIVERY_LINES_REQUIRED'; end if;

  line_count := jsonb_array_length(p_lines);
  if line_count < 1 or line_count > 50 then raise exception 'DELIVERY_LINE_COUNT_INVALID'; end if;

  select * into target_store
    from public.store
   where id = p_store_id
     and is_active
     and public.company_membership_allowed(company_id);
  if not found then raise exception 'STORE_NOT_FOUND'; end if;

  if exists (
    select 1 from public.delivery_order
     where tenant_id = target_store.company_id
       and channel = normalized_channel
       and external_order_id = normalized_order_id
  ) then
    raise exception 'DUPLICATE_DELIVERY_ORDER';
  end if;

  insert into public.delivery_order (
    tenant_id, company_id, store_id, channel, external_order_id,
    status, order_amount, created_by
  ) values (
    target_store.company_id, target_store.company_id, target_store.id,
    normalized_channel, normalized_order_id, 'OPEN', round(p_order_amount, 2),
    auth.uid()
  ) returning * into new_order;

  for payload in select value from jsonb_array_elements(p_lines)
  loop
    current_no := current_no + 1;
    normalized_barcode := trim(coalesce(payload->>'barcode', ''));
    if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' then
      raise exception 'INVALID_BARCODE_LINE_%', current_no;
    end if;

    if normalized_barcode ~ '^[0-9]{13}$' and normalized_barcode ~ '^2' then
      item_key := substr(normalized_barcode, 2, 6);
      embedded_value := substr(normalized_barcode, 8, 5)::numeric;
    else
      item_key := normalized_barcode;
      embedded_value := null;
    end if;

    select * into mapping
      from public.product_barcode
     where tenant_id = target_store.company_id
       and barcode_key = item_key
       and (store_id = target_store.id or store_id is null)
     order by (store_id = target_store.id) desc, updated_at desc
     limit 1;
    if not found then raise exception 'BARCODE_NOT_MAPPED_LINE_%', current_no; end if;

    if mapping.weigh_type = 'PRICE_EMBED'
       and embedded_value is not null
       and coalesce(mapping.default_price, 0) > 0 then
      line_scale_amount := round(embedded_value, 2);
      line_quantity := round(embedded_value / mapping.default_price, 3);
    elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
      line_quantity := round(embedded_value / 1000, 3);
      line_scale_amount := round(line_quantity * coalesce(mapping.default_price, 0), 2);
    elsif mapping.weigh_type = 'FIXED' and coalesce(mapping.default_price, 0) > 0 then
      line_quantity := 1;
      line_scale_amount := round(mapping.default_price, 2);
    elsif mapping.weigh_type = 'MANUAL'
       and coalesce((payload->>'quantity')::numeric, 0) > 0
       and coalesce((payload->>'scaleAmount')::numeric, 0) >= 0 then
      line_quantity := round((payload->>'quantity')::numeric, 3);
      line_scale_amount := round((payload->>'scaleAmount')::numeric, 2);
    else
      raise exception 'SALE_VALUE_REQUIRED_LINE_%', current_no;
    end if;

    if line_quantity <= 0 then raise exception 'INVALID_QUANTITY_LINE_%', current_no; end if;

    insert into public.delivery_order_line (
      order_id, line_no, barcode, product_name, unit, quantity, scale_amount
    ) values (
      new_order.id, current_no, normalized_barcode, mapping.raw_product_name,
      coalesce(mapping.unit, 'kg'), line_quantity, line_scale_amount
    );
    total_scale_amount := total_scale_amount + line_scale_amount;
  end loop;

  if total_scale_amount <= 0 then raise exception 'DELIVERY_SCALE_AMOUNT_REQUIRED'; end if;

  current_no := 0;
  for saved_line in
    select * from public.delivery_order_line
     where order_id = new_order.id order by line_no
  loop
    current_no := current_no + 1;
    if current_no = line_count then
      allocated_amount := round(p_order_amount, 2) - allocated_so_far;
    else
      allocated_amount := round(p_order_amount * saved_line.scale_amount / total_scale_amount, 2);
      allocated_so_far := allocated_so_far + allocated_amount;
    end if;

    select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
      into available_quantity
      from public.inventory_movement
     where tenant_id = target_store.company_id
       and company_id = target_store.company_id
       and store_id = target_store.id
       and raw_product_name = saved_line.product_name
       and coalesce(unit, '') = coalesce(saved_line.unit, '')
       and is_active;
    if available_quantity < saved_line.quantity then
      raise exception 'INSUFFICIENT_STOCK_LINE_%_AVAILABLE_%', saved_line.line_no, available_quantity;
    end if;

    insert into public.inventory_movement (
      tenant_id, company_id, store_id, movement_type, raw_product_name,
      unit, quantity, unit_price, amount, movement_date, memo, created_by
    ) values (
      target_store.company_id, target_store.company_id, target_store.id,
      'OUT', saved_line.product_name, saved_line.unit, saved_line.quantity,
      round(allocated_amount / saved_line.quantity, 2), allocated_amount,
      sale_day, '쿠팡이츠 출고 주문 ' || normalized_order_id, auth.uid()
    ) returning id into movement_id;

    sale_channel := 'COUPANG';
    insert into public.sales_record (
      tenant_id, company_id, store_id, sale_date, item_name, quantity,
      unit_price, amount, channel, memo, barcode, external_transaction_id,
      sold_at, source, is_cancelled
    ) values (
      target_store.company_id, target_store.company_id, target_store.id,
      sale_day, saved_line.product_name, saved_line.quantity,
      round(allocated_amount / saved_line.quantity, 2), allocated_amount,
      sale_channel, '쿠팡이츠 주문 ' || normalized_order_id,
      saved_line.barcode, normalized_channel || ':' || normalized_order_id || ':' || saved_line.line_no,
      coalesce(p_fulfilled_at, now()), 'delivery-scale', false
    ) returning id into sale_id;

    update public.delivery_order_line
       set allocated_sales_amount = allocated_amount,
           inventory_movement_id = movement_id,
           sales_record_id = sale_id
     where id = saved_line.id;
  end loop;

  update public.delivery_order
     set status = 'FULFILLED',
         scale_amount = total_scale_amount,
         fulfilled_at = coalesce(p_fulfilled_at, now()),
         updated_at = now()
   where id = new_order.id;

  return jsonb_build_object(
    'ok', true,
    'orderId', new_order.id,
    'externalOrderId', normalized_order_id,
    'lineCount', line_count,
    'orderAmount', round(p_order_amount, 2),
    'scaleAmount', total_scale_amount
  );
end;
$$;

revoke all on function public.process_delivery_fulfillment(uuid, text, text, numeric, jsonb, timestamptz)
  from public, anon;
grant execute on function public.process_delivery_fulfillment(uuid, text, text, numeric, jsonb, timestamptz)
  to authenticated;

create or replace function public.cancel_delivery_fulfillment(
  p_order_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.delivery_order%rowtype;
  target_line public.delivery_order_line%rowtype;
begin
  if auth.uid() is null then raise exception 'DELIVERY_NOT_AUTHENTICATED'; end if;
  select * into target_order from public.delivery_order
   where id = p_order_id and public.company_membership_allowed(company_id)
   for update;
  if not found then raise exception 'DELIVERY_ORDER_NOT_FOUND'; end if;
  if target_order.status = 'CANCELLED' then
    return jsonb_build_object('ok', true, 'alreadyCancelled', true);
  end if;
  if target_order.status not in ('FULFILLED', 'REVIEW') then
    raise exception 'DELIVERY_ORDER_NOT_CANCELLABLE';
  end if;

  for target_line in
    select * from public.delivery_order_line
     where order_id = target_order.id and reversed_at is null
     order by line_no
  loop
    insert into public.inventory_movement (
      tenant_id, company_id, store_id, movement_type, raw_product_name,
      unit, quantity, unit_price, amount, movement_date, memo, created_by
    ) values (
      target_order.tenant_id, target_order.company_id, target_order.store_id,
      'IN', target_line.product_name, target_line.unit, target_line.quantity,
      round(target_line.allocated_sales_amount / target_line.quantity, 2),
      target_line.allocated_sales_amount,
      (now() at time zone 'Asia/Seoul')::date,
      '쿠팡이츠 주문 취소 ' || target_order.external_order_id ||
        coalesce(' · ' || nullif(trim(p_reason), ''), ''),
      auth.uid()
    );
    update public.sales_record
       set is_cancelled = true,
           memo = coalesce(memo, '') || coalesce(' · 취소: ' || nullif(trim(p_reason), ''), ' · 취소')
     where id = target_line.sales_record_id;
    update public.delivery_order_line set reversed_at = now() where id = target_line.id;
  end loop;

  update public.delivery_order
     set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
   where id = target_order.id;
  return jsonb_build_object('ok', true, 'orderId', target_order.id);
end;
$$;

revoke all on function public.cancel_delivery_fulfillment(uuid, text) from public, anon;
grant execute on function public.cancel_delivery_fulfillment(uuid, text) to authenticated;

-- Cancelled sales must not remain in dashboard totals.
create or replace function public.sync_sales_summary()
returns trigger language plpgsql as $$
begin
  insert into public.daily_sales_summary (company_id, store_id, day, order_cnt, amount)
  select new.company_id, new.store_id, new.sale_date, count(*), coalesce(sum(amount),0)
    from public.sales_record
   where company_id = new.company_id
     and store_id is not distinct from new.store_id
     and sale_date = new.sale_date
     and not coalesce(is_cancelled, false)
  on conflict (company_id, store_id, day)
    do update set order_cnt = excluded.order_cnt, amount = excluded.amount, updated_at = now();

  insert into public.monthly_sales_summary (company_id, store_id, ym, order_cnt, amount)
  select new.company_id, new.store_id, to_char(new.sale_date,'YYYY-MM'), count(*), coalesce(sum(amount),0)
    from public.sales_record
   where company_id = new.company_id
     and store_id is not distinct from new.store_id
     and to_char(sale_date,'YYYY-MM') = to_char(new.sale_date,'YYYY-MM')
     and not coalesce(is_cancelled, false)
  on conflict (company_id, store_id, ym)
    do update set order_cnt = excluded.order_cnt, amount = excluded.amount, updated_at = now();
  return null;
end $$;
