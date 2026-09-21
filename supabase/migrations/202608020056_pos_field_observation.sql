-- POS field-test observation path. This function never changes sales or inventory.

create or replace function public.capture_pos_sale_observation_agent(
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
  item_key text;
  embedded_value numeric;
  observed_quantity numeric(18,3);
  observed_amount numeric(18,2);
  available_quantity numeric(18,3);
  transaction_id text := nullif(trim(coalesce(p_external_transaction_id, '')), '');
begin
  if p_agent_token is null or length(p_agent_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;
  select * into credential
    from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;
  if transaction_id is not null and exists (
    select 1 from public.scan_event
     where tenant_id = credential.tenant_id and external_transaction_id = transaction_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'shadowMode', true);
  end if;
  if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_BARCODE');
  end if;
  if normalized_barcode ~ '^2[0-9]{12}$' then
    item_key := substr(normalized_barcode, 2, 6);
    embedded_value := substr(normalized_barcode, 8, 5)::numeric;
  else
    item_key := normalized_barcode;
    embedded_value := null;
  end if;
  select * into mapping
    from public.product_barcode
   where tenant_id = credential.tenant_id
     and barcode_key = item_key
     and (store_id = credential.store_id or store_id is null)
   order by (store_id = credential.store_id) desc, updated_at desc limit 1;
  if not found then
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
      'PENDING', 'POS 현장 검증 · 미등록 바코드', transaction_id,
      'pos-field-observation', 'BARCODE_NOT_MAPPED'
    );
    return jsonb_build_object('ok', false, 'error', 'BARCODE_NOT_MAPPED', 'shadowMode', true);
  end if;
  if p_quantity is not null and p_quantity > 0 then
    observed_quantity := round(p_quantity, 3);
    observed_amount := round(coalesce(p_sale_amount, observed_quantity * coalesce(mapping.default_price, 0)), 2);
  elsif mapping.weigh_type = 'PRICE_EMBED' and embedded_value is not null
      and coalesce(mapping.default_price, 0) > 0 then
    observed_amount := embedded_value;
    observed_quantity := round(embedded_value / mapping.default_price, 3);
  elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null
      and coalesce(mapping.default_price, 0) > 0 then
    observed_quantity := round(embedded_value / 1000, 3);
    observed_amount := round(observed_quantity * mapping.default_price, 2);
  elsif mapping.weigh_type = 'FIXED' and coalesce(mapping.default_price, 0) > 0 then
    observed_quantity := 1;
    observed_amount := round(mapping.default_price, 2);
  else
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status,
      matched_product, external_transaction_id, source, error_code, note
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
      'PENDING', mapping.raw_product_name, transaction_id,
      'pos-field-observation', 'SALE_VALUE_REQUIRED',
      'POS 현장 검증 · 중량 또는 판매금액 계산 불가'
    );
    return jsonb_build_object('ok', false, 'error', 'SALE_VALUE_REQUIRED', 'shadowMode', true);
  end if;
  select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
    into available_quantity
    from public.inventory_movement
   where tenant_id = credential.tenant_id and company_id = credential.company_id
     and store_id = credential.store_id and raw_product_name = mapping.raw_product_name
     and coalesce(unit, '') = coalesce(mapping.unit, 'kg') and is_active;
  insert into public.scan_event (
    tenant_id, company_id, store_id, barcode, device, status,
    matched_product, quantity, sale_amount, note,
    external_transaction_id, source, processed_at
  ) values (
    credential.tenant_id, credential.company_id, credential.store_id,
    normalized_barcode, coalesce(nullif(trim(p_device), ''), credential.device),
    'OBSERVED', mapping.raw_product_name, observed_quantity, observed_amount,
    '현장 검증 모드 · 매출/재고 미반영', transaction_id,
    'pos-field-observation', now()
  );
  update public.pos_agent_credential set last_used_at = now() where id = credential.id;
  return jsonb_build_object(
    'ok', true, 'shadowMode', true, 'product', mapping.raw_product_name,
    'quantity', observed_quantity, 'amount', observed_amount,
    'availableQuantity', available_quantity,
    'externalTransactionId', transaction_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true, 'shadowMode', true);
  when others then
    return jsonb_build_object('ok', false, 'error', 'SERVER_ERROR', 'shadowMode', true);
end;
$$;

revoke all on function public.capture_pos_sale_observation_agent(
  text, text, numeric, numeric, timestamptz, text, text
) from public;
grant execute on function public.capture_pos_sale_observation_agent(
  text, text, numeric, numeric, timestamptz, text, text
) to anon, authenticated;

comment on function public.capture_pos_sale_observation_agent(
  text, text, numeric, numeric, timestamptz, text, text
) is 'Field-test-only POS observation. It never changes sales or inventory.';
