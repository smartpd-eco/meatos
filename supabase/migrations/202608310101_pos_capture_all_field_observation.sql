-- POS 현장 검증(shadow) 수집 보강 — 202608310101
--
-- 목적: 자동 판매연동 현장 검증에서 "규격에 맞지 않아도 POS 데이터는 전부 올라오도록" 한다.
--   1) 형식(규격) 미준수 코드도 원본 그대로 scan_event에 남긴다(전송 데이터 무손실).
--      단, 거래ID가 없는 입력은 에이전트의 연결 확인용 프로브(barcode='x' 등)이므로
--      기존과 동일하게 INVALID_BARCODE만 반환하고 기록하지 않는다.
--   2) 매핑된 스캔은 수량/금액 산출 가능 여부와 무관하게 항상 OBSERVED로 올라오게 한다
--      (단가 미설정 등으로 계산이 안 돼도 관찰기록은 남기고 note로 사유를 표기).
-- 이 함수는 매출/재고를 절대 변경하지 않는다(기존과 동일한 shadow 전용).

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
  device_label text := coalesce(nullif(trim(p_device), ''), '');
  item_key text;
  embedded_value numeric;
  observed_quantity numeric(18,3);
  observed_amount numeric(18,2);
  available_quantity numeric(18,3);
  value_note text := null;
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
  device_label := coalesce(nullif(device_label, ''), credential.device);

  if transaction_id is not null and exists (
    select 1 from public.scan_event
     where tenant_id = credential.tenant_id and external_transaction_id = transaction_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'shadowMode', true);
  end if;

  -- (1) 형식(규격) 미준수 코드 처리
  if normalized_barcode !~ '^[0-9A-Za-z._-]{6,64}$' then
    -- 거래ID 없는 입력은 연결 확인용 프로브로 보고 기존 동작을 유지한다.
    if transaction_id is null then
      return jsonb_build_object('ok', false, 'error', 'INVALID_BARCODE');
    end if;
    -- 실제 현장 스캔이면 원본 코드를 그대로 수집한다(무손실).
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      left(normalized_barcode, 64), device_label,
      'PENDING', 'POS 현장 검증 · 규격외 원본 데이터',
      transaction_id, 'pos-field-observation', 'INVALID_BARCODE'
    );
    update public.pos_agent_credential set last_used_at = now() where id = credential.id;
    return jsonb_build_object('ok', true, 'shadowMode', true, 'raw', true,
      'note', 'INVALID_BARCODE_CAPTURED');
  end if;

  -- KR 매장 바코드: 13자리, '2' 시작 → 품목코드(2~7) + 내장값(8~12)
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

  -- (2a) 미등록 바코드도 기록(기존과 동일)
  if not found then
    insert into public.scan_event (
      tenant_id, company_id, store_id, barcode, device, status, note,
      external_transaction_id, source, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      normalized_barcode, device_label,
      'PENDING', 'POS 현장 검증 · 미등록 바코드', transaction_id,
      'pos-field-observation', 'BARCODE_NOT_MAPPED'
    );
    return jsonb_build_object('ok', false, 'error', 'BARCODE_NOT_MAPPED', 'shadowMode', true);
  end if;

  -- (2b) 매핑된 스캔: 산출 가능 여부와 무관하게 항상 관찰기록을 남긴다.
  if p_quantity is not null and p_quantity > 0 then
    observed_quantity := round(p_quantity, 3);
    observed_amount := round(coalesce(p_sale_amount, observed_quantity * coalesce(mapping.default_price, 0)), 2);
  elsif mapping.weigh_type = 'PRICE_EMBED' and embedded_value is not null then
    observed_amount := round(embedded_value, 2);
    if coalesce(mapping.default_price, 0) > 0 then
      observed_quantity := round(embedded_value / mapping.default_price, 3);
    else
      observed_quantity := null;
      value_note := '단가 미설정 · 수량 미산출';
    end if;
  elsif mapping.weigh_type = 'WEIGHT_EMBED' and embedded_value is not null then
    observed_quantity := round(embedded_value / 1000, 3);
    observed_amount := round(observed_quantity * coalesce(mapping.default_price, 0), 2);
    if coalesce(mapping.default_price, 0) = 0 then
      value_note := '단가 미설정 · 금액 미산출';
    end if;
  elsif mapping.weigh_type = 'FIXED' then
    observed_quantity := 1;
    observed_amount := round(coalesce(mapping.default_price, 0), 2);
    if coalesce(mapping.default_price, 0) = 0 then
      value_note := '단가 미설정 · 금액 미산출';
    end if;
  else
    -- MANUAL 등 즉시 산출이 불가한 경우에도 매핑됐으므로 관찰기록은 남긴다.
    observed_quantity := case when p_quantity is not null then round(p_quantity, 3) else null end;
    observed_amount := case when p_sale_amount is not null then round(p_sale_amount, 2) else null end;
    value_note := '수량/단가 확인 필요';
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
    normalized_barcode, device_label,
    'OBSERVED', mapping.raw_product_name, observed_quantity, observed_amount,
    coalesce('현장 검증 모드 · 매출/재고 미반영 · ' || value_note, '현장 검증 모드 · 매출/재고 미반영'),
    transaction_id, 'pos-field-observation', now()
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
) is 'Field-test-only POS observation. Captures every agent scan (non-standard and unmapped codes included) into scan_event and never changes sales or inventory.';
