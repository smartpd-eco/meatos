-- =====================================================================
-- Reversible shadow observation for scale-label print signals.
-- Stores parsed business fields only; raw printer payload is never stored.
-- The v45 RPC remains available so installed older agents keep working.
-- =====================================================================

alter table public.delivery_capture_event
  add column if not exists raw_product_name text,
  add column if not exists printed_weight numeric(18,3),
  add column if not exists printed_unit_price numeric(18,2),
  add column if not exists printed_amount numeric(18,2),
  add column if not exists raw_format_hash text,
  add column if not exists parser_version text;

create or replace function public.capture_delivery_label_signal_agent(
  p_agent_token text,
  p_order_id uuid,
  p_barcode text,
  p_event_hash text,
  p_captured_at timestamptz default now(),
  p_raw_product_name text default null,
  p_printed_weight numeric default null,
  p_printed_unit_price numeric default null,
  p_printed_amount numeric default null,
  p_raw_format_hash text default null,
  p_parser_version text default 'label-signal-v1'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  target_order public.delivery_order%rowtype;
  result jsonb;
  normalized_hash text := left(trim(coalesce(p_event_hash, '')), 128);
  normalized_name text := left(trim(coalesce(p_raw_product_name, '')), 120);
  normalized_format_hash text := left(trim(coalesce(p_raw_format_hash, '')), 128);
  result_error text;
begin
  select * into credential from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;
  if length(normalized_hash) < 16 then
    return jsonb_build_object('ok', false, 'error', 'LABEL_CAPTURE_INVALID');
  end if;

  result := public.capture_delivery_label_agent(
    p_agent_token, p_order_id, p_barcode, normalized_hash, p_captured_at
  );
  result_error := result->>'error';

  select * into target_order from public.delivery_order
   where id = p_order_id
     and company_id = credential.company_id
     and store_id = credential.store_id;

  if not exists (
    select 1 from public.delivery_capture_event
     where credential_id = credential.id and event_hash = normalized_hash
  ) then
    insert into public.delivery_capture_event (
      tenant_id, company_id, store_id, credential_id, order_id, event_type,
      source_type, event_hash, external_order_id, barcode, amount, captured_at,
      status, error_code
    ) values (
      credential.tenant_id, credential.company_id, credential.store_id,
      credential.id, target_order.id,
      'UNMATCHED_LABEL', 'SCALE_LABEL_SIGNAL', normalized_hash,
      target_order.external_order_id,
      left(trim(coalesce(p_barcode, '')), 64), p_printed_amount,
      coalesce(p_captured_at, now()), 'REVIEW',
      coalesce(result_error, 'LABEL_SIGNAL_REVIEW')
    ) on conflict (credential_id, event_hash) do nothing;
  end if;

  update public.delivery_capture_event
     set source_type = 'SCALE_LABEL_SIGNAL',
         raw_product_name = nullif(normalized_name, ''),
         printed_weight = case when p_printed_weight > 0 then round(p_printed_weight, 3) else null end,
         printed_unit_price = case when p_printed_unit_price > 0 then round(p_printed_unit_price, 2) else null end,
         printed_amount = case when p_printed_amount >= 0 then round(p_printed_amount, 2) else null end,
         raw_format_hash = nullif(normalized_format_hash, ''),
         parser_version = left(trim(coalesce(p_parser_version, 'label-signal-v1')), 40)
   where credential_id = credential.id and event_hash = normalized_hash;

  if coalesce((result->>'ok')::boolean, false) then
    return result || jsonb_build_object('signalObserved', true);
  end if;
  if result_error in ('BARCODE_NOT_MAPPED', 'SALE_VALUE_REQUIRED', 'OPEN_ORDER_NOT_FOUND') then
    return jsonb_build_object(
      'ok', true, 'review', true, 'error', result_error,
      'orderId', p_order_id, 'signalObserved', true
    );
  end if;
  return result;
end;
$$;

revoke all on function public.capture_delivery_label_signal_agent(
  text,uuid,text,text,timestamptz,text,numeric,numeric,numeric,text,text
) from public, anon, authenticated;
grant execute on function public.capture_delivery_label_signal_agent(
  text,uuid,text,text,timestamptz,text,numeric,numeric,numeric,text,text
) to anon, authenticated;
