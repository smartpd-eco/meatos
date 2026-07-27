-- POS agent authentication and atomic barcode sale processing.
-- Existing receipt trace numbers stay untouched. Sales and stock aggregation
-- do not require trace_no.

alter table public.scan_event
  add column if not exists company_id uuid,
  add column if not exists store_id uuid,
  add column if not exists quantity numeric(18,3),
  add column if not exists sale_amount numeric(18,2),
  add column if not exists external_transaction_id text,
  add column if not exists source text not null default 'local-agent',
  add column if not exists error_code text,
  add column if not exists processed_at timestamptz;

create unique index if not exists scan_event_external_transaction_uidx
  on public.scan_event (tenant_id, external_transaction_id)
  where external_transaction_id is not null;

alter table public.sales_record
  add column if not exists barcode text,
  add column if not exists external_transaction_id text,
  add column if not exists sold_at timestamptz,
  add column if not exists source text,
  add column if not exists is_cancelled boolean not null default false;

create index if not exists sales_record_pos_transaction_idx
  on public.sales_record (company_id, store_id, external_transaction_id, created_at desc);

create table if not exists public.pos_agent_credential (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid not null references public.store(id) on delete cascade,
  key_hash text not null unique,
  device text not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists pos_agent_credential_store_idx
  on public.pos_agent_credential (company_id, store_id, is_active);

alter table public.pos_agent_credential enable row level security;
revoke all on public.pos_agent_credential from public, anon, authenticated;
grant all on public.pos_agent_credential to service_role;

create or replace function public.issue_pos_agent_key(
  p_store_id uuid,
  p_device text default 'POS01'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_store public.store%rowtype;
  raw_key text;
  normalized_device text := left(coalesce(nullif(trim(p_device), ''), 'POS01'), 80);
begin
  if auth.uid() is null then
    raise exception 'AGENT_NOT_AUTHENTICATED';
  end if;

  select *
    into target_store
    from public.store
   where id = p_store_id
     and is_active
     and public.company_membership_allowed(company_id);

  if not found then
    raise exception 'STORE_NOT_FOUND';
  end if;

  raw_key := 'pos_' || encode(extensions.gen_random_bytes(32), 'hex');

  update public.pos_agent_credential
     set is_active = false,
         revoked_at = now()
   where store_id = target_store.id
     and device = normalized_device
     and is_active;

  insert into public.pos_agent_credential (
    tenant_id, company_id, store_id, key_hash, device, created_by
  ) values (
    target_store.company_id,
    target_store.company_id,
    target_store.id,
    encode(extensions.digest(raw_key, 'sha256'), 'hex'),
    normalized_device,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'agentKey', raw_key,
    'companyId', target_store.company_id,
    'storeId', target_store.id,
    'storeName', target_store.name,
    'device', normalized_device
  );
end;
$$;

revoke all on function public.issue_pos_agent_key(uuid, text) from public, anon;
grant execute on function public.issue_pos_agent_key(uuid, text) to authenticated;

-- The former scan_event trigger accepted anonymous table INSERTs. RLS now
-- blocks those writes, so the authenticated RPC below is the only agent path.
drop trigger if exists trg_process_scan on public.scan_event;

create or replace function public.process_pos_sale_event(
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
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  mapping public.product_barcode%rowtype;
  normalized_barcode text := trim(coalesce(p_barcode, ''));
  digits text;
  item_key text;
  embedded_value numeric;
  sale_quantity numeric(18,3);
  sale_amount numeric(18,2);
  unit_price numeric(18,2);
  available_quantity numeric(18,3);
  transaction_id text := nullif(trim(coalesce(p_external_transaction_id, '')), '');
  sale_day date := (coalesce(p_sold_at, now()) at time zone 'Asia/Seoul')::date;
begin
  if p_agent_token is null or length(p_agent_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  select *
    into credential
    from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  if transaction_id is not null and exists (
    select 1
      from public.scan_event
     where tenant_id = credential.tenant_id
       and external_transaction_id = transaction_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_EVENT');
  end if;

  if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_BARCODE');
  end if;

  digits := regexp_replace(normalized_barcode, '\D', '', 'g');
  if normalized_barcode ~ '^[0-9]{13}$' and normalized_barcode ~ '^2' then
    item_key := substr(normalized_barcode, 2, 6);
    embedded_value := substr(normalized_barcode, 8, 5)::numeric;
  else
    item_key := normalized_barcode;
    embedded_value := null;
  end if;

  select *
    into mapping
    from public.product_barcode
   where tenant_id = credential.tenant_id
     and barcode_key = item_key
     and (store_id = credential.store_id or store_id is null)
   order by (store_id = credential.store_id) desc, updated_at desc
   limit 1;

  if not found then
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
      'PENDING', '등록되지 않은 바코드', transaction_id, 'local-agent',
      'BARCODE_NOT_MAPPED'
    );
    return jsonb_build_object('ok', false, 'error', 'BARCODE_NOT_MAPPED');
  end if;

  if p_quantity is not null and p_quantity > 0 then
    sale_quantity := round(p_quantity, 3);
    sale_amount := round(coalesce(p_sale_amount, sale_quantity * coalesce(mapping.default_price, 0)), 2);
  elsif mapping.weigh_type = 'PRICE_EMBED'
      and embedded_value is not null
      and coalesce(mapping.default_price, 0) > 0 then
    sale_amount := embedded_value;
    sale_quantity := round(embedded_value / mapping.default_price, 3);
  elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
    sale_quantity := round(embedded_value / 1000, 3);
    sale_amount := round(sale_quantity * coalesce(mapping.default_price, 0), 2);
  elsif mapping.weigh_type = 'FIXED' then
    sale_quantity := 1;
    sale_amount := round(coalesce(mapping.default_price, 0), 2);
  else
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
      'PENDING', '판매 수량 또는 단가 확인 필요', transaction_id,
      'local-agent', 'SALE_VALUE_REQUIRED'
    );
    return jsonb_build_object('ok', false, 'error', 'SALE_VALUE_REQUIRED');
  end if;

  unit_price := case
    when sale_quantity > 0 then round(sale_amount / sale_quantity, 2)
    else coalesce(mapping.default_price, 0)
  end;

  select coalesce(sum(
    case when movement_type = 'OUT' then -quantity else quantity end
  ), 0)
    into available_quantity
    from public.inventory_movement
   where tenant_id = credential.tenant_id
     and company_id = credential.company_id
     and store_id = credential.store_id
     and raw_product_name = mapping.raw_product_name
     and coalesce(unit, '') = coalesce(mapping.unit, 'kg')
     and is_active;

  if available_quantity < sale_quantity then
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status,
      matched_product, quantity, sale_amount, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
      'FAILED', mapping.raw_product_name, sale_quantity, sale_amount,
      '재고 부족', transaction_id, 'local-agent', 'INSUFFICIENT_STOCK'
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_STOCK',
      'availableQuantity', available_quantity
    );
  end if;

  insert into public.inventory_movement (
    tenant_id, company_id, store_id, movement_type, raw_product_name,
    unit, quantity, unit_price, amount, movement_date, memo
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    'OUT', mapping.raw_product_name, coalesce(mapping.unit, 'kg'),
    sale_quantity, unit_price, sale_amount, sale_day, 'POS 자동 판매'
  );

  insert into public.sales_record (
    tenant_id, company_id, store_id, sale_date, item_name, quantity,
    unit_price, amount, channel, memo, barcode,
    external_transaction_id, sold_at, source, is_cancelled
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    sale_day, mapping.raw_product_name, sale_quantity, unit_price,
    sale_amount, 'STORE', 'POS 자동 판매', normalized_barcode,
    transaction_id, coalesce(p_sold_at, now()), 'local-agent', false
  );

  insert into public.scan_event (
    tenant_id, company_id, store_id, barcode, device, status,
    matched_product, quantity, sale_amount, external_transaction_id,
    source, processed_at
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
    'PROCESSED', mapping.raw_product_name, sale_quantity, sale_amount,
    transaction_id, 'local-agent', now()
  );

  update public.pos_agent_credential
     set last_used_at = now()
   where id = credential.id;

  return jsonb_build_object(
    'ok', true,
    'product', mapping.raw_product_name,
    'quantity', sale_quantity,
    'amount', sale_amount,
    'externalTransactionId', transaction_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_EVENT');
  when others then
    return jsonb_build_object('ok', false, 'error', 'SERVER_ERROR');
end;
$$;

revoke all on function public.process_pos_sale_event(
  text, text, numeric, numeric, timestamptz, text, text
) from public;
grant execute on function public.process_pos_sale_event(
  text, text, numeric, numeric, timestamptz, text, text
) to anon, authenticated;

comment on function public.process_pos_sale_event(
  text, text, numeric, numeric, timestamptz, text, text
) is 'Validates a revocable POS agent key and atomically records sale and stock OUT without trace-number dependency.';
