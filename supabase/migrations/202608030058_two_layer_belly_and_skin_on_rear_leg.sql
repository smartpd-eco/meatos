-- Add operator-confirmed standard products without changing existing inventory rows.
-- 냉동 is kept as a storage attribute by the application; the canonical product is 이겹살.
do $$
declare
  two_layer_id uuid;
  skin_on_rear_id uuid;
begin
  insert into public.product_dictionary (
    dictionary_code, standard_name, confidence, source_count, alias_count,
    review_status, version_no, effective_from, is_active
  ) values
    ('DICT-PORK-BELLY-TWO-LAYER', '이겹살', 100, 1, 2, 'APPROVED', 1, date '2026-08-03', true),
    ('DICT-PORK-LEG-SKIN-ON', '미박 뒷다리살', 100, 1, 5, 'APPROVED', 1, date '2026-08-03', true)
  on conflict (dictionary_code) do update
    set standard_name = excluded.standard_name,
        confidence = greatest(public.product_dictionary.confidence, excluded.confidence),
        source_count = greatest(public.product_dictionary.source_count, excluded.source_count),
        alias_count = greatest(public.product_dictionary.alias_count, excluded.alias_count),
        review_status = 'APPROVED',
        is_active = true,
        updated_at = now();

  select id into two_layer_id
    from public.product_dictionary
   where dictionary_code = 'DICT-PORK-BELLY-TWO-LAYER';

  select id into skin_on_rear_id
    from public.product_dictionary
   where dictionary_code = 'DICT-PORK-LEG-SKIN-ON';

  insert into public.product_alias (
    dictionary_id, raw_name, normalized_name, confidence,
    use_count, verified, last_used_at, is_active
  )
  select source.dictionary_id,
         source.raw_name,
         lower(regexp_replace(source.raw_name, '[[:space:][:punct:]]+', '', 'g')),
         source.confidence,
         1,
         true,
         now(),
         true
    from (values
      (two_layer_id, '이겹살', 100::numeric),
      (two_layer_id, '이겹', 99::numeric),
      (skin_on_rear_id, '미후지', 100::numeric),
      (skin_on_rear_id, '미박 후지', 100::numeric),
      (skin_on_rear_id, '미 뒷다리', 99::numeric),
      (skin_on_rear_id, '미박 뒷다리', 100::numeric)
    ) as source(dictionary_id, raw_name, confidence)
  on conflict (dictionary_id, normalized_name) do update
    set raw_name = excluded.raw_name,
        confidence = greatest(public.product_alias.confidence, excluded.confidence),
        verified = true,
        is_active = true,
        last_used_at = now(),
        updated_at = now();
end $$;
