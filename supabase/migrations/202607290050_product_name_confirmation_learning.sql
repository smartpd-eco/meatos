-- Impact: persist user-confirmed AI product-name recommendations.
-- A confirmation is immediately authoritative for the same supplier, promotes
-- to the business dictionary after repeated evidence, and only promotes to the
-- shared dictionary after evidence from at least three separate tenants.

create or replace function public.confirm_product_name_learning(
  p_tenant_id uuid,
  p_store_id uuid,
  p_supplier_name text,
  p_source_pattern text,
  p_target_pattern text,
  p_category text,
  p_standard_cut text,
  p_storage text,
  p_dictionary_code text,
  p_product_code text,
  p_confidence numeric default 99
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_account public.account;
  resolved_supplier_id uuid;
  resolved_store_id uuid;
  existing_rule_id uuid;
  normalized_source text;
  normalized_target text;
  supplier_confirmations integer := 0;
  distinct_suppliers integer := 0;
  distinct_tenants integer := 0;
  promoted_business boolean := false;
  promoted_shared boolean := false;
  target_dictionary_id uuid;
  learning_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select account.*
    into current_account
    from public.account account
   where account.auth_user_id = auth.uid()
     and account.company_id = p_tenant_id
     and account.status = 'active'
     and account.member_status = 'APPROVED';
  if not found then
    raise exception 'BUSINESS_MEMBERSHIP_REQUIRED';
  end if;

  if nullif(trim(p_source_pattern), '') is null
     or nullif(trim(p_target_pattern), '') is null then
    raise exception 'SOURCE_AND_TARGET_REQUIRED';
  end if;

  normalized_source := lower(regexp_replace(p_source_pattern, '[[:space:][:punct:]]+', '', 'g'));
  normalized_target := lower(regexp_replace(p_target_pattern, '[[:space:][:punct:]]+', '', 'g'));

  if p_store_id is not null and exists (
    select 1 from public.store
     where id = p_store_id
       and company_id = current_account.company_id
  ) then
    resolved_store_id := p_store_id;
  else
    resolved_store_id := current_account.store_id;
  end if;

  if nullif(trim(p_supplier_name), '') is not null then
    select supplier.id
      into resolved_supplier_id
      from public.supplier_master supplier
      left join public.supplier_name_alias alias
        on alias.tenant_id = supplier.tenant_id
       and alias.supplier_id = supplier.id
       and alias.is_active = true
     where supplier.tenant_id = p_tenant_id
       and supplier.is_active = true
       and (
         lower(regexp_replace(supplier.supplier_name, '[[:space:][:punct:]]+', '', 'g'))
           = lower(regexp_replace(p_supplier_name, '[[:space:][:punct:]]+', '', 'g'))
         or alias.normalized_alias
           = lower(regexp_replace(p_supplier_name, '[[:space:][:punct:]]+', '', 'g'))
       )
     order by case when supplier.supplier_name = p_supplier_name then 0 else 1 end
     limit 1;
  end if;

  learning_metadata := jsonb_strip_nulls(jsonb_build_object(
    'category', nullif(trim(p_category), ''),
    'standard_cut', nullif(trim(p_standard_cut), ''),
    'storage', nullif(trim(p_storage), ''),
    'dictionary_code', nullif(trim(p_dictionary_code), ''),
    'product_code', nullif(trim(p_product_code), ''),
    'store_id', resolved_store_id,
    'learning_scope', case when resolved_supplier_id is null then 'BUSINESS' else 'SUPPLIER' end,
    'confirmed_by', auth.uid()
  ));

  select learning.id
    into existing_rule_id
    from public.ocr_pattern_learning learning
   where learning.tenant_id = p_tenant_id
     and learning.supplier_id is not distinct from resolved_supplier_id
     and learning.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
     and lower(regexp_replace(learning.source_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_source
     and lower(regexp_replace(learning.target_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_target
     and learning.is_active = true
   order by learning.updated_at desc
   limit 1
   for update;

  if existing_rule_id is null then
    insert into public.ocr_pattern_learning (
      tenant_id, supplier_id, pattern_type, source_pattern, target_pattern,
      sample_count, success_count, confidence, last_used_at, is_active,
      match_metadata, approval_source, approved_at, created_by, updated_by
    ) values (
      p_tenant_id, resolved_supplier_id, 'PRODUCT_NAME_SUBSTITUTION',
      trim(p_source_pattern), trim(p_target_pattern),
      1, 1, greatest(90, least(100, coalesce(p_confidence, 99))), now(), true,
      learning_metadata, 'USER_CONFIRMED_PRODUCT_NAME', now(), auth.uid(), auth.uid()
    );
  else
    update public.ocr_pattern_learning
       set sample_count = sample_count + 1,
           success_count = success_count + 1,
           confidence = greatest(confidence, greatest(90, least(100, coalesce(p_confidence, 99)))),
           last_used_at = now(),
           match_metadata = coalesce(match_metadata, '{}'::jsonb) || learning_metadata,
           approval_source = 'USER_CONFIRMED_PRODUCT_NAME',
           approved_at = now(),
           updated_by = auth.uid(),
           is_active = true
     where id = existing_rule_id;
  end if;

  select coalesce(sum(learning.success_count), 0)::integer,
         count(distinct learning.supplier_id) filter (where learning.supplier_id is not null)::integer
    into supplier_confirmations, distinct_suppliers
    from public.ocr_pattern_learning learning
   where learning.tenant_id = p_tenant_id
     and learning.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
     and lower(regexp_replace(learning.source_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_source
     and lower(regexp_replace(learning.target_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_target
     and learning.is_active = true
     and learning.approval_source = 'USER_CONFIRMED_PRODUCT_NAME';

  if resolved_supplier_id is null or supplier_confirmations >= 3 or distinct_suppliers >= 2 then
    promoted_business := true;
    select learning.id
      into existing_rule_id
      from public.ocr_pattern_learning learning
     where learning.tenant_id = p_tenant_id
       and learning.supplier_id is null
       and learning.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and lower(regexp_replace(learning.source_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_source
       and lower(regexp_replace(learning.target_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_target
       and learning.is_active = true
     order by learning.updated_at desc
     limit 1
     for update;

    if existing_rule_id is null then
      insert into public.ocr_pattern_learning (
        tenant_id, supplier_id, pattern_type, source_pattern, target_pattern,
        sample_count, success_count, confidence, last_used_at, is_active,
        match_metadata, approval_source, approved_at, created_by, updated_by
      ) values (
        p_tenant_id, null, 'PRODUCT_NAME_SUBSTITUTION',
        trim(p_source_pattern), trim(p_target_pattern),
        supplier_confirmations, supplier_confirmations, 99, now(), true,
        learning_metadata || jsonb_build_object('learning_scope', 'BUSINESS'),
        'BUSINESS_CONFIRMED_PRODUCT_NAME', now(), auth.uid(), auth.uid()
      );
    else
      update public.ocr_pattern_learning
         set sample_count = greatest(sample_count, supplier_confirmations),
             success_count = greatest(success_count, supplier_confirmations),
             confidence = greatest(confidence, 99),
             last_used_at = now(),
             match_metadata = coalesce(match_metadata, '{}'::jsonb)
               || learning_metadata || jsonb_build_object('learning_scope', 'BUSINESS'),
             approval_source = 'BUSINESS_CONFIRMED_PRODUCT_NAME',
             approved_at = now(),
             updated_by = auth.uid(),
             is_active = true
       where id = existing_rule_id;
    end if;
  end if;

  if nullif(trim(p_dictionary_code), '') is not null then
    select dictionary.id
      into target_dictionary_id
      from public.product_dictionary dictionary
     where dictionary.dictionary_code = p_dictionary_code
       and dictionary.review_status = 'APPROVED'
       and dictionary.is_active = true
     limit 1;
  end if;

  if target_dictionary_id is not null then
    select count(distinct learning.tenant_id)::integer
      into distinct_tenants
      from public.ocr_pattern_learning learning
     where learning.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
       and lower(regexp_replace(learning.source_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_source
       and lower(regexp_replace(learning.target_pattern, '[[:space:][:punct:]]+', '', 'g')) = normalized_target
       and learning.is_active = true
       and learning.approval_source in (
         'USER_CONFIRMED_PRODUCT_NAME',
         'BUSINESS_CONFIRMED_PRODUCT_NAME'
       );

    if distinct_tenants >= 3 then
      promoted_shared := true;
      insert into public.product_alias (
        dictionary_id, raw_name, normalized_name, confidence, use_count,
        verified, last_used_at, created_by, updated_by, is_active
      ) values (
        target_dictionary_id, trim(p_source_pattern), normalized_source,
        99, distinct_tenants, true, now(), auth.uid(), auth.uid(), true
      )
      on conflict (dictionary_id, normalized_name) do update
        set raw_name = excluded.raw_name,
            confidence = greatest(public.product_alias.confidence, excluded.confidence),
            use_count = greatest(public.product_alias.use_count, excluded.use_count),
            verified = true,
            last_used_at = now(),
            updated_by = auth.uid(),
            is_active = true,
            updated_at = now();
    end if;
  end if;

  return jsonb_build_object(
    'learned', true,
    'scope', case when resolved_supplier_id is null then 'BUSINESS' else 'SUPPLIER' end,
    'supplier_id', resolved_supplier_id,
    'supplier_confirmations', supplier_confirmations,
    'distinct_suppliers', distinct_suppliers,
    'promoted_business', promoted_business,
    'distinct_tenants', distinct_tenants,
    'promoted_shared', promoted_shared
  );
end;
$$;

revoke all on function public.confirm_product_name_learning(
  uuid, uuid, text, text, text, text, text, text, text, text, numeric
) from public, anon;
grant execute on function public.confirm_product_name_learning(
  uuid, uuid, text, text, text, text, text, text, text, text, numeric
) to authenticated;

