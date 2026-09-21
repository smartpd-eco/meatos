-- Standardize ordinary/skinless pork belly display names as 삼겹살.
-- DICT-0001 remains the distinct skin-on 오겹살 product.
do $$
declare
  belly_dictionary_id uuid;
begin
  select id into belly_dictionary_id
    from public.product_dictionary
   where dictionary_code = 'DICT-PORK-BELLY-SKINLESS'
   limit 1;

  if belly_dictionary_id is null then
    raise exception 'DICT-PORK-BELLY-SKINLESS was not found';
  end if;

  update public.product_dictionary
     set standard_name = '삼겹살',
         alias_count = greatest(alias_count, 10),
         review_status = 'APPROVED',
         is_active = true,
         updated_at = now()
   where id = belly_dictionary_id;

  update public.product_master
     set product_name = '삼겹살',
         status = 'ACTIVE',
         is_active = true,
         updated_at = now()
   where dictionary_id = belly_dictionary_id
      or product_code = 'PROD-PORK-BELLY-SKINLESS';

  insert into public.product_alias (
    dictionary_id, raw_name, normalized_name, confidence,
    use_count, verified, last_used_at, is_active
  )
  select belly_dictionary_id,
         source.raw_name,
         lower(regexp_replace(source.raw_name, '[[:space:][:punct:]]+', '', 'g')),
         source.confidence,
         1,
         true,
         now(),
         true
    from (values
      ('삼겹살', 100::numeric),
      ('삼겹', 100::numeric),
      ('삼겸살', 99::numeric),
      ('삼겹쌀', 98::numeric),
      ('삼겹삽', 98::numeric),
      ('박피 삼겹', 100::numeric),
      ('박피 삼겹살', 100::numeric),
      ('박펴 삼겹살', 98::numeric),
      ('박파 삼겹살', 98::numeric),
      ('박비 삼겹살', 97::numeric),
      ('빅피 삼겹살', 97::numeric),
      ('밖피 삼겹살', 97::numeric)
    ) as source(raw_name, confidence)
  on conflict (dictionary_id, normalized_name) do update
    set raw_name = excluded.raw_name,
        confidence = greatest(public.product_alias.confidence, excluded.confidence),
        verified = true,
        is_active = true,
        last_used_at = now(),
        updated_at = now();

  update public.ocr_pattern_learning
     set target_pattern = case
           when coalesce(match_metadata->>'storage', '') in ('냉장', '냉동')
             then match_metadata->>'storage' || ' 삼겹살'
           else '삼겹살'
         end,
         match_metadata = coalesce(match_metadata, '{}'::jsonb)
           || jsonb_build_object(
             'standard_name', '삼겹살',
             'standard_cut', '삼겹',
             'dictionary_code', 'DICT-PORK-BELLY-SKINLESS',
             'product_code', 'PROD-PORK-BELLY-SKINLESS'
           ),
         updated_at = now()
   where is_active = true
     and match_metadata->>'dictionary_code' = 'DICT-PORK-BELLY-SKINLESS';
end $$;
