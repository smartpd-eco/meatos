-- =====================================================================
-- Zero-touch Coupang Eats capture.
-- A receive-only serial tap captures the Coupang POS receipt stream and the
-- scale-label stream. Shadow mode records and matches without touching stock.
-- =====================================================================

alter table public.delivery_order
  add column if not exists capture_mode text not null default 'MANUAL',
  add column if not exists shadow_mode boolean not null default false,
  add column if not exists match_confidence numeric(5,4),
  add column if not exists captured_receipt_hash text,
  add column if not exists last_capture_at timestamptz;

create table if not exists public.delivery_capture_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid not null references public.store(id) on delete cascade,
  credential_id uuid not null references public.pos_agent_credential(id) on delete cascade,
  order_id uuid references public.delivery_order(id) on delete set null,
  event_type text not null check (event_type in ('ORDER_RECEIPT', 'SCALE_LABEL', 'UNMATCHED_LABEL', 'FINALIZE')),
  source_type text not null,
  event_hash text not null,
  external_order_id text,
  barcode text,
  amount numeric(18,2),
  captured_at timestamptz not null,
  match_confidence numeric(5,4),
  status text not null default 'CAPTURED'
    check (status in ('CAPTURED', 'MATCHED', 'DUPLICATE', 'REVIEW', 'PROCESSED', 'FAILED')),
  error_code text,
  created_at timestamptz not null default now(),
  unique (credential_id, event_hash)
);

create index if not exists delivery_capture_event_store_idx
  on public.delivery_capture_event (company_id, store_id, captured_at desc);

alter table public.delivery_capture_event enable row level security;
drop policy if exists delivery_capture_event_select_member on public.delivery_capture_event;
create policy delivery_capture_event_select_member on public.delivery_capture_event
  for select to authenticated
  using (public.company_membership_allowed(company_id));
revoke all on public.delivery_capture_event from public, anon;
grant select on public.delivery_capture_event to authenticated;
grant all on public.delivery_capture_event to service_role;

create or replace function public.capture_delivery_order_agent(
  p_agent_token text,
  p_external_order_id text,
  p_order_amount numeric,
  p_event_hash text,
  p_captured_at timestamptz default now(),
  p_shadow_mode boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  target_order public.delivery_order%rowtype;
  normalized_order_id text := left(trim(coalesce(p_external_order_id, '')), 80);
  normalized_hash text := left(trim(coalesce(p_event_hash, '')), 128);
begin
  select * into credential from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED'); end if;
  if length(normalized_order_id) < 3 or coalesce(p_order_amount, 0) <= 0 or length(normalized_hash) < 16 then
    return jsonb_build_object('ok', false, 'error', 'ORDER_CAPTURE_INVALID');
  end if;

  select * into target_order from public.delivery_order
   where tenant_id = credential.tenant_id
     and channel = 'COUPANG_EATS'
     and external_order_id = normalized_order_id;

  if found and target_order.status <> 'OPEN' then
    return jsonb_build_object('ok', false, 'error', 'ORDER_ALREADY_CLOSED');
  end if;

  if not found then
    insert into public.delivery_order (
      tenant_id, company_id, store_id, channel, external_order_id, status,
      order_amount, created_by, capture_mode, shadow_mode, match_confidence,
      captured_receipt_hash, last_capture_at
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      'COUPANG_EATS', normalized_order_id, 'OPEN', round(p_order_amount, 2),
      credential.created_by, 'SERIAL_RECEIPT', coalesce(p_shadow_mode, true),
      1.0000, normalized_hash, coalesce(p_captured_at, now())
    ) returning * into target_order;
  end if;

  insert into public.delivery_capture_event (
    tenant_id, company_id, store_id, credential_id, order_id, event_type,
    source_type, event_hash, external_order_id, amount, captured_at,
    match_confidence, status
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    credential.id, target_order.id, 'ORDER_RECEIPT', 'COUPANG_ESC_POS',
    normalized_hash, normalized_order_id, round(p_order_amount, 2),
    coalesce(p_captured_at, now()), 1.0000, 'MATCHED'
  ) on conflict (credential_id, event_hash) do nothing;

  update public.pos_agent_credential set last_used_at = now() where id = credential.id;
  return jsonb_build_object(
    'ok', true, 'orderId', target_order.id, 'externalOrderId', normalized_order_id,
    'shadowMode', target_order.shadow_mode
  );
end;
$$;

revoke all on function public.capture_delivery_order_agent(text,text,numeric,text,timestamptz,boolean)
  from public, anon, authenticated;
grant execute on function public.capture_delivery_order_agent(text,text,numeric,text,timestamptz,boolean)
  to anon, authenticated;

create or replace function public.capture_delivery_label_agent(
  p_agent_token text,
  p_order_id uuid,
  p_barcode text,
  p_event_hash text,
  p_captured_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  target_order public.delivery_order%rowtype;
  mapping public.product_barcode%rowtype;
  normalized_barcode text := trim(coalesce(p_barcode, ''));
  normalized_hash text := left(trim(coalesce(p_event_hash, '')), 128);
  item_key text;
  embedded_value numeric;
  line_quantity numeric(18,3);
  line_scale_amount numeric(18,2);
  available_quantity numeric(18,3);
  next_line integer;
  movement_id uuid;
begin
  select * into credential from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED'); end if;
  if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' or length(normalized_hash) < 16 then
    return jsonb_build_object('ok', false, 'error', 'LABEL_CAPTURE_INVALID');
  end if;

  select * into target_order from public.delivery_order
   where id = p_order_id
     and company_id = credential.company_id
     and store_id = credential.store_id
     and status = 'OPEN'
   for update;
  if not found then
    insert into public.delivery_capture_event (
      tenant_id, company_id, store_id, credential_id, event_type, source_type,
      event_hash, barcode, captured_at, status, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      credential.id, 'UNMATCHED_LABEL', 'SCALE_LABEL', normalized_hash,
      normalized_barcode, coalesce(p_captured_at, now()), 'REVIEW', 'OPEN_ORDER_NOT_FOUND'
    ) on conflict (credential_id, event_hash) do nothing;
    return jsonb_build_object('ok', false, 'error', 'OPEN_ORDER_NOT_FOUND');
  end if;

  if exists (
    select 1 from public.delivery_capture_event
     where credential_id = credential.id and event_hash = normalized_hash
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'orderId', target_order.id);
  end if;

  if normalized_barcode ~ '^[0-9]{13}$' and normalized_barcode ~ '^2' then
    item_key := substr(normalized_barcode, 2, 6);
    embedded_value := substr(normalized_barcode, 8, 5)::numeric;
  else
    item_key := normalized_barcode;
    embedded_value := null;
  end if;

  select * into mapping from public.product_barcode
   where tenant_id = credential.tenant_id
     and barcode_key = item_key
     and (store_id = credential.store_id or store_id is null)
   order by (store_id = credential.store_id) desc, updated_at desc limit 1;
  if not found then
    insert into public.delivery_capture_event (
      tenant_id, company_id, store_id, credential_id, order_id, event_type,
      source_type, event_hash, external_order_id, barcode, captured_at,
      status, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      credential.id, target_order.id, 'UNMATCHED_LABEL', 'SCALE_LABEL',
      normalized_hash, target_order.external_order_id, normalized_barcode,
      coalesce(p_captured_at, now()), 'REVIEW', 'BARCODE_NOT_MAPPED'
    ) on conflict (credential_id, event_hash) do nothing;
    return jsonb_build_object('ok', false, 'error', 'BARCODE_NOT_MAPPED');
  end if;

  if mapping.weigh_type = 'PRICE_EMBED' and embedded_value is not null
     and coalesce(mapping.default_price, 0) > 0 then
    line_scale_amount := round(embedded_value, 2);
    line_quantity := round(embedded_value / mapping.default_price, 3);
  elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
    line_quantity := round(embedded_value / 1000, 3);
    line_scale_amount := round(line_quantity * coalesce(mapping.default_price, 0), 2);
  elsif mapping.weigh_type = 'FIXED' and coalesce(mapping.default_price, 0) > 0 then
    line_quantity := 1;
    line_scale_amount := round(mapping.default_price, 2);
  else
    return jsonb_build_object('ok', false, 'error', 'SALE_VALUE_REQUIRED');
  end if;

  select coalesce(max(line_no), 0) + 1 into next_line
    from public.delivery_order_line where order_id = target_order.id;

  if not target_order.shadow_mode then
    select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
      into available_quantity from public.inventory_movement
     where tenant_id = credential.tenant_id and company_id = credential.company_id
       and store_id = credential.store_id and raw_product_name = mapping.raw_product_name
       and coalesce(unit, '') = coalesce(mapping.unit, 'kg') and is_active;
    if available_quantity < line_quantity then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_STOCK');
    end if;
    insert into public.inventory_movement (
      tenant_id, company_id, store_id, movement_type, raw_product_name,
      unit, quantity, unit_price, amount, movement_date, memo, created_by
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id, 'OUT',
      mapping.raw_product_name, coalesce(mapping.unit, 'kg'), line_quantity,
      mapping.default_price, line_scale_amount,
      (coalesce(p_captured_at, now()) at time zone 'Asia/Seoul')::date,
      '쿠팡이츠 자동출고 ' || target_order.external_order_id, credential.created_by
    ) returning id into movement_id;
  end if;

  insert into public.delivery_order_line (
    order_id, line_no, barcode, product_name, unit, quantity, scale_amount,
    inventory_movement_id
  ) values (
    target_order.id, next_line, normalized_barcode, mapping.raw_product_name,
    coalesce(mapping.unit, 'kg'), line_quantity, line_scale_amount, movement_id
  );

  insert into public.delivery_capture_event (
    tenant_id, company_id, store_id, credential_id, order_id, event_type,
    source_type, event_hash, external_order_id, barcode, amount, captured_at,
    match_confidence, status
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    credential.id, target_order.id, 'SCALE_LABEL', 'SCALE_LABEL',
    normalized_hash, target_order.external_order_id, normalized_barcode,
    line_scale_amount, coalesce(p_captured_at, now()), 1.0000,
    case when target_order.shadow_mode then 'MATCHED' else 'PROCESSED' end
  );

  update public.delivery_order
     set scale_amount = scale_amount + line_scale_amount,
         last_capture_at = coalesce(p_captured_at, now()), updated_at = now()
   where id = target_order.id;
  return jsonb_build_object(
    'ok', true, 'orderId', target_order.id, 'product', mapping.raw_product_name,
    'quantity', line_quantity, 'scaleAmount', line_scale_amount,
    'shadowMode', target_order.shadow_mode
  );
end;
$$;

revoke all on function public.capture_delivery_label_agent(text,uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.capture_delivery_label_agent(text,uuid,text,text,timestamptz)
  to anon, authenticated;

create or replace function public.finalize_delivery_order_agent(
  p_agent_token text,
  p_order_id uuid,
  p_event_hash text,
  p_finalized_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  target_order public.delivery_order%rowtype;
  target_line public.delivery_order_line%rowtype;
  total_scale numeric(18,2);
  allocated numeric(18,2);
  allocated_so_far numeric(18,2) := 0;
  line_count integer;
  current_no integer := 0;
  sale_id uuid;
begin
  select * into credential from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED'); end if;
  if length(trim(coalesce(p_event_hash, ''))) < 16 then
    return jsonb_build_object('ok', false, 'error', 'FINALIZE_CAPTURE_INVALID');
  end if;

  select * into target_order from public.delivery_order
   where id = p_order_id and company_id = credential.company_id
     and store_id = credential.store_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND'); end if;
  if target_order.status in ('REVIEW', 'FULFILLED')
     and exists (
       select 1 from public.delivery_capture_event
        where credential_id = credential.id
          and event_hash = left(trim(p_event_hash), 128)
          and event_type = 'FINALIZE'
     ) then
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'orderId', target_order.id,
      'shadowMode', target_order.shadow_mode
    );
  end if;
  if target_order.status <> 'OPEN' then
    return jsonb_build_object('ok', false, 'error', 'OPEN_ORDER_NOT_FOUND');
  end if;

  select count(*)::int, coalesce(sum(scale_amount), 0)
    into line_count, total_scale from public.delivery_order_line
   where order_id = target_order.id;
  if line_count = 0 or total_scale <= 0 then
    return jsonb_build_object('ok', false, 'error', 'ORDER_HAS_NO_LABEL');
  end if;

  if target_order.shadow_mode then
    update public.delivery_order
       set status = 'REVIEW', match_confidence = 1.0000,
           fulfilled_at = coalesce(p_finalized_at, now()), updated_at = now()
     where id = target_order.id;
  else
    if exists (
      select 1 from public.delivery_order_line
       where order_id = target_order.id and inventory_movement_id is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'INVENTORY_CAPTURE_INCOMPLETE');
    end if;
    for target_line in
      select * from public.delivery_order_line where order_id = target_order.id order by line_no
    loop
      current_no := current_no + 1;
      if current_no = line_count then
        allocated := target_order.order_amount - allocated_so_far;
      else
        allocated := round(target_order.order_amount * target_line.scale_amount / total_scale, 2);
        allocated_so_far := allocated_so_far + allocated;
      end if;
      insert into public.sales_record (
        tenant_id, company_id, store_id, sale_date, item_name, quantity,
        unit_price, amount, channel, memo, barcode, external_transaction_id,
        sold_at, source, is_cancelled
      ) values (
        credential.tenant_id, credential.company_id, credential.store_id,
        (coalesce(p_finalized_at, now()) at time zone 'Asia/Seoul')::date,
        target_line.product_name, target_line.quantity,
        round(allocated / target_line.quantity, 2), allocated, 'COUPANG',
        '쿠팡이츠 자동수집 ' || target_order.external_order_id,
        target_line.barcode,
        'COUPANG_EATS:' || target_order.external_order_id || ':' || target_line.line_no,
        coalesce(p_finalized_at, now()), 'delivery-auto-capture', false
      ) returning id into sale_id;
      update public.delivery_order_line
         set allocated_sales_amount = allocated, sales_record_id = sale_id
       where id = target_line.id;
    end loop;
    update public.delivery_order
       set status = 'FULFILLED', match_confidence = 1.0000,
           fulfilled_at = coalesce(p_finalized_at, now()), updated_at = now()
     where id = target_order.id;
  end if;

  insert into public.delivery_capture_event (
    tenant_id, company_id, store_id, credential_id, order_id, event_type,
    source_type, event_hash, external_order_id, amount, captured_at,
    match_confidence, status
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    credential.id, target_order.id, 'FINALIZE', 'AUTO_TIMER',
    left(trim(p_event_hash), 128), target_order.external_order_id,
    target_order.order_amount, coalesce(p_finalized_at, now()), 1.0000,
    case when target_order.shadow_mode then 'REVIEW' else 'PROCESSED' end
  ) on conflict (credential_id, event_hash) do nothing;

  return jsonb_build_object(
    'ok', true, 'orderId', target_order.id, 'lineCount', line_count,
    'shadowMode', target_order.shadow_mode
  );
end;
$$;

revoke all on function public.finalize_delivery_order_agent(text,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_delivery_order_agent(text,uuid,text,timestamptz)
  to anon, authenticated;

-- Migration 44 allowed REVIEW cancellation. An automatic shadow REVIEW has
-- never consumed inventory, so it must never create a compensating IN row.
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

  if not target_order.shadow_mode then
    for target_line in
      select * from public.delivery_order_line
       where order_id = target_order.id
         and inventory_movement_id is not null
         and reversed_at is null
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
  end if;

  update public.delivery_order
     set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
   where id = target_order.id;
  return jsonb_build_object(
    'ok', true, 'orderId', target_order.id, 'shadowMode', target_order.shadow_mode
  );
end;
$$;

revoke all on function public.cancel_delivery_fulfillment(uuid, text) from public, anon;
grant execute on function public.cancel_delivery_fulfillment(uuid, text) to authenticated;
