-- Impact: connect field aliases for skinless pork shoulder to the approved
-- DICT-0002 standard without deleting or replacing existing learning data.

do $$
declare
  target_dictionary_id uuid;
begin
  select id
    into target_dictionary_id
    from public.product_dictionary
   where dictionary_code = 'DICT-0002'
     and standard_name = '미박 앞다리살'
     and review_status = 'APPROVED'
     and is_active = true;

  if target_dictionary_id is null then
    raise exception 'Approved product dictionary DICT-0002 (미박 앞다리살) was not found';
  end if;

  insert into public.product_alias (
    dictionary_id, raw_name, normalized_name, confidence, use_count,
    verified, last_used_at, is_active
  )
  select
    target_dictionary_id,
    alias_name,
    lower(regexp_replace(alias_name, '[[:space:][:punct:]]+', '', 'g')),
    99,
    1,
    true,
    now(),
    true
  from unnest(array[
    '미전지', '미박 앞다리', '앞다리 미박', '미박 전지',
    '미 앞다리살', '미박 앞다리살',
    '미젼지', '미전쥐', '미전디',
    '미밖 앞다리', '미박 압다리', '앞다라 미박'
  ]::text[]) as aliases(alias_name)
  on conflict (dictionary_id, normalized_name) do update
    set raw_name = excluded.raw_name,
        confidence = greatest(public.product_alias.confidence, excluded.confidence),
        verified = true,
        is_active = true,
        last_used_at = now(),
        updated_at = now();

  insert into public.supplier_alias (
    tenant_id, supplier_id, dictionary_id, raw_name, normalized_name,
    confidence, learning_count, verified, auto_apply, last_used_at, is_active
  )
  select
    supplier.tenant_id,
    supplier.id,
    target_dictionary_id,
    aliases.alias_name,
    lower(regexp_replace(aliases.alias_name, '[[:space:][:punct:]]+', '', 'g')),
    99,
    1,
    true,
    true,
    now(),
    true
  from public.supplier_master supplier
  cross join unnest(array[
    '미전지', '미박 앞다리', '앞다리 미박', '미박 전지',
    '미 앞다리살', '미박 앞다리살',
    '미젼지', '미전쥐', '미전디',
    '미밖 앞다리', '미박 압다리', '앞다라 미박'
  ]::text[]) as aliases(alias_name)
  where supplier.supplier_code in ('DAESAN_CHUKSAN', 'SUP-GOOD-CHUKSAN')
     or supplier.supplier_name in ('대산축산', '좋은축산', '좋은축산유통', '(주)좋은축산유통', '(주) 좋은축산유통')
  on conflict (tenant_id, supplier_id, normalized_name) do update
    set dictionary_id = excluded.dictionary_id,
        raw_name = excluded.raw_name,
        confidence = greatest(public.supplier_alias.confidence, excluded.confidence),
        learning_count = greatest(public.supplier_alias.learning_count, 1),
        verified = true,
        auto_apply = true,
        is_active = true,
        last_used_at = now(),
        updated_at = now();

  update public.ocr_pattern_learning existing
     set target_pattern = '미박 앞다리살',
         sample_count = greatest(existing.sample_count, 1),
         success_count = greatest(existing.success_count, 1),
         confidence = greatest(existing.confidence, 99),
         match_metadata = coalesce(existing.match_metadata, '{}'::jsonb) || jsonb_build_object(
           'category', '돼지고기',
           'standard_cut', '앞다리살',
           'skin', '미박',
           'dictionary_code', 'DICT-0002',
           'product_code', 'PROD-0002'
         ),
         approval_source = 'USER_CONFIRMED_SKINLESS_SHOULDER_20260729',
         approved_at = coalesce(existing.approved_at, now()),
         last_used_at = now(),
         is_active = true,
         updated_at = now()
    from public.supplier_master supplier
   where existing.supplier_id = supplier.id
     and existing.tenant_id = supplier.tenant_id
     and existing.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
     and existing.source_pattern ~ '(^|냉장|냉동|[[:space:](])(미전지|미젼지|미전쥐|미전디|(미박|미밖)[[:space:]]*전지|미[[:space:]]*(앞다리|압다리|앞다라)살|(미박|미밖)[[:space:]]*(앞다리|압다리|앞다라)살?|(앞다리|압다리|앞다라)살?[[:space:]]*(미박|미밖))([[:space:]()]|$)'
     and (
       supplier.supplier_code in ('DAESAN_CHUKSAN', 'SUP-GOOD-CHUKSAN')
       or supplier.supplier_name in ('대산축산', '좋은축산', '좋은축산유통', '(주)좋은축산유통', '(주) 좋은축산유통')
     );

  insert into public.ocr_pattern_learning (
    tenant_id, supplier_id, pattern_type, source_pattern, target_pattern,
    sample_count, success_count, confidence, last_used_at, is_active,
    match_metadata, approval_source, approved_at
  )
  select
    supplier.tenant_id,
    supplier.id,
    'PRODUCT_NAME_SUBSTITUTION',
    aliases.alias_name,
    '미박 앞다리살',
    1,
    1,
    99,
    now(),
    true,
    jsonb_build_object(
      'category', '돼지고기',
      'standard_cut', '앞다리살',
      'skin', '미박',
      'dictionary_code', 'DICT-0002',
      'product_code', 'PROD-0002'
    ),
    'USER_CONFIRMED_SKINLESS_SHOULDER_20260729',
    now()
  from public.supplier_master supplier
  cross join unnest(array[
    '미전지', '미박 앞다리', '앞다리 미박', '미박 전지',
    '미 앞다리살', '미박 앞다리살',
    '미젼지', '미전쥐', '미전디',
    '미밖 앞다리', '미박 압다리', '앞다라 미박'
  ]::text[]) as aliases(alias_name)
  where (
      supplier.supplier_code in ('DAESAN_CHUKSAN', 'SUP-GOOD-CHUKSAN')
      or supplier.supplier_name in ('대산축산', '좋은축산', '좋은축산유통', '(주)좋은축산유통', '(주) 좋은축산유통')
    )
    and not exists (
      select 1
        from public.ocr_pattern_learning existing
       where existing.tenant_id = supplier.tenant_id
         and existing.supplier_id = supplier.id
         and existing.pattern_type = 'PRODUCT_NAME_SUBSTITUTION'
         and lower(regexp_replace(existing.source_pattern, '[[:space:][:punct:]]+', '', 'g'))
             = lower(regexp_replace(aliases.alias_name, '[[:space:][:punct:]]+', '', 'g'))
         and existing.is_active = true
    );
end $$;
