-- Inventory direct registration and auditable sales cancellation.
-- No destructive deletes: cancelled sales remain for audit, while stock is
-- restored only when the original sales path deducted inventory.

alter table public.sales_record
  add column if not exists inventory_movement_id uuid,
  add column if not exists reversal_movement_id uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text,
  add column if not exists stock_reversed boolean not null default false;

create index if not exists sales_record_inventory_movement_idx
  on public.sales_record (inventory_movement_id)
  where inventory_movement_id is not null;

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
  current_account public.account%rowtype;
  target_store_id uuid;
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

  target_store_id := current_account.store_id;
  if target_store_id is null then
    select id into target_store_id
      from public.store
     where company_id = current_account.company_id and is_active
     order by is_default desc, created_at
     limit 1;
  end if;
  if target_store_id is null then raise exception 'STORE_REQUIRED'; end if;
  if normalized_item = '' then raise exception 'ITEM_REQUIRED'; end if;
  if normalized_quantity <= 0 then raise exception 'QUANTITY_REQUIRED'; end if;

  normalized_amount := round(coalesce(p_amount, normalized_quantity * coalesce(p_unit_price, 0)), 2);
  normalized_price := round(coalesce(p_unit_price,
    case when normalized_quantity > 0 then normalized_amount / normalized_quantity else 0 end
  ), 2);
  if normalized_amount < 0 or normalized_price < 0 then raise exception 'INVALID_SALE_AMOUNT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_account.company_id::text || ':' || target_store_id::text || ':' || normalized_item, 0
  ));

  select coalesce(sum(case when movement_type = 'OUT' then -quantity else quantity end), 0)
    into available_quantity
    from public.inventory_movement
   where tenant_id = current_account.company_id
     and company_id = current_account.company_id
     and store_id = target_store_id
     and raw_product_name = normalized_item
     and is_active;
  if available_quantity < normalized_quantity then
    raise exception 'INSUFFICIENT_STOCK_AVAILABLE_%', available_quantity;
  end if;

  insert into public.inventory_movement (
    tenant_id, company_id, store_id, movement_type, raw_product_name,
    unit, quantity, unit_price, amount, movement_date, memo, created_by
  ) values (
    current_account.company_id, current_account.company_id, target_store_id,
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
    current_account.company_id, current_account.company_id, target_store_id,
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
    'amount', normalized_amount
  );
end;
$$;

revoke all on function public.record_manual_sale(text,numeric,numeric,numeric,date,text,text)
  from public, anon;
grant execute on function public.record_manual_sale(text,numeric,numeric,numeric,date,text,text)
  to authenticated;

create or replace function public.cancel_sales_record(
  p_sale_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale public.sales_record%rowtype;
  linked_movement public.inventory_movement%rowtype;
  target_line public.delivery_order_line%rowtype;
  target_order_id uuid;
  reversal_id uuid;
  should_restore boolean := false;
  reversal_unit text := 'kg';
  reason_text text := left(coalesce(nullif(trim(p_reason), ''), '사용자 판매취소'), 300);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_sale_id is null then raise exception 'SALE_ID_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_sale_id::text, 0));

  select * into target_sale
    from public.sales_record
   where id = p_sale_id
     and public.company_membership_allowed(company_id)
   order by created_at desc
   limit 1
   for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if target_sale.is_cancelled then
    return jsonb_build_object(
      'ok', true, 'alreadyCancelled', true,
      'stockRestored', target_sale.stock_reversed,
      'restoredQuantity', case when target_sale.stock_reversed then coalesce(target_sale.quantity, 0) else 0 end
    );
  end if;

  select * into target_line
    from public.delivery_order_line
   where sales_record_id = target_sale.id
   order by line_no
   limit 1;
  if found then
    target_order_id := target_line.order_id;
  end if;

  select * into linked_movement
    from public.inventory_movement
   where id = coalesce(target_sale.inventory_movement_id, target_line.inventory_movement_id)
     and tenant_id = target_sale.tenant_id
   order by created_at desc
   limit 1;
  if found then
    should_restore := linked_movement.movement_type = 'OUT' and linked_movement.is_active;
    reversal_unit := coalesce(linked_movement.unit, 'kg');
  elsif coalesce(target_sale.source, '') in (
    'manual-web', 'web-scan', 'local-agent', 'delivery-scale', 'delivery-auto-capture'
  ) then
    should_restore := coalesce(target_sale.quantity, 0) > 0;
  end if;

  if should_restore then
    insert into public.inventory_movement (
      tenant_id, company_id, store_id, movement_type, raw_product_name,
      unit, quantity, unit_price, amount, movement_date, memo, created_by
    ) values (
      target_sale.tenant_id, target_sale.company_id, target_sale.store_id,
      'IN', target_sale.item_name, reversal_unit, target_sale.quantity,
      target_sale.unit_price, target_sale.amount,
      (now() at time zone 'Asia/Seoul')::date,
      '판매취소 재고원복 · ' || reason_text,
      auth.uid()
    ) returning id into reversal_id;
  end if;

  update public.sales_record
     set is_cancelled = true,
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = reason_text,
         stock_reversed = should_restore,
         reversal_movement_id = reversal_id,
         memo = concat_ws(' · ', nullif(memo, ''), '판매취소: ' || reason_text)
   where id = target_sale.id and created_at = target_sale.created_at;

  if target_line.id is not null then
    update public.delivery_order_line
       set reversed_at = coalesce(reversed_at, now())
     where id = target_line.id;

    if exists (
      select 1 from public.delivery_order_line
       where order_id = target_order_id and reversed_at is null
    ) then
      update public.delivery_order
         set status = 'REVIEW', updated_at = now()
       where id = target_order_id and status <> 'CANCELLED';
    else
      update public.delivery_order
         set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
       where id = target_order_id;
    end if;
  end if;

  if target_sale.external_transaction_id is not null then
    update public.scan_event
       set status = 'REVERSED',
           note = concat_ws(' · ', nullif(note, ''), '판매취소: ' || reason_text)
     where tenant_id = target_sale.tenant_id
       and external_transaction_id = target_sale.external_transaction_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'saleId', target_sale.id,
    'stockRestored', should_restore,
    'restoredQuantity', case when should_restore then coalesce(target_sale.quantity, 0) else 0 end,
    'reversalMovementId', reversal_id,
    'deliveryOrderId', target_order_id
  );
end;
$$;

revoke all on function public.cancel_sales_record(uuid,text) from public, anon;
grant execute on function public.cancel_sales_record(uuid,text) to authenticated;

notify pgrst, 'reload schema';
