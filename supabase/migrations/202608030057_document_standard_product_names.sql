-- Apply the operator-reviewed DOCX standard names without merging distinct
-- skin-on (오겹살) and skinless (박피 삼겹) pork belly identities.
do $$
declare
  skin_on_dictionary_id uuid;
begin
  select id
    into skin_on_dictionary_id
    from public.product_dictionary
   where dictionary_code = 'DICT-0001'
   limit 1;

  if skin_on_dictionary_id is null then
    raise exception 'Approved product dictionary DICT-0001 was not found';
  end if;

  update public.product_dictionary
     set standard_name = '오겹살',
         alias_count = greatest(alias_count, 6),
         review_status = 'APPROVED',
         is_active = true,
         updated_at = now()
   where id = skin_on_dictionary_id;

  update public.product_master
     set product_name = '오겹살',
         status = 'ACTIVE',
         is_active = true,
         updated_at = now()
   where dictionary_id = skin_on_dictionary_id
      or product_code = 'PROD-0001';

  insert into public.product_alias (
    dictionary_id, raw_name, normalized_name, confidence,
    use_count, verified, last_used_at, is_active
  )
  select skin_on_dictionary_id,
         source.raw_name,
         lower(regexp_replace(source.raw_name, '[[:space:][:punct:]]+', '', 'g')),
         source.confidence,
         1,
         true,
         now(),
         true
    from (values
      ('오겹살', 100::numeric),
      ('미박 삼겹살', 100::numeric),
      ('미삼겹', 99::numeric),
      ('미빅피 삼겹살', 98::numeric),
      ('미박피 삼겹살', 98::numeric),
      ('미밖 삼겹살', 98::numeric)
    ) as source(raw_name, confidence)
  on conflict (dictionary_id, normalized_name)
  do update set
    raw_name = excluded.raw_name,
    confidence = greatest(public.product_alias.confidence, excluded.confidence),
    verified = true,
    is_active = true,
    last_used_at = now(),
    updated_at = now();

  update public.ocr_pattern_learning
     set target_pattern = regexp_replace(
           target_pattern,
           '(미박[[:space:]]*삼겹살?|미삼겹)',
           '오겹살',
           'g'
         ),
         match_metadata = coalesce(match_metadata, '{}'::jsonb)
           || jsonb_build_object(
             'standard_name', '오겹살',
             'standard_cut', '삼겹',
             'skin', '미박',
             'dictionary_code', 'DICT-0001',
             'product_code', 'PROD-0001'
           ),
         updated_at = now()
   where is_active = true
     and (
       match_metadata->>'dictionary_code' = 'DICT-0001'
       or target_pattern ~ '(미박[[:space:]]*삼겹살?|미삼겹)'
     );
end $$;
