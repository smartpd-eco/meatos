-- Fill all previously missing representative aliases with reviewed government,
-- distribution-market and OCR-safe names. Distinct formal cuts stay separate:
-- 업진살 is intentionally not an alias of 우삼겹.
do $$
declare
  pork_id uuid;
  beef_id uuid;
begin
  select id into pork_id from public.product_species where species_code = 'PORK' limit 1;
  select id into beef_id from public.product_species where species_code = 'BEEF' limit 1;

  if pork_id is null or beef_id is null then
    raise exception 'Required PORK/BEEF species reference was not found';
  end if;

  insert into public.product_dictionary (
    dictionary_code, standard_name, species_id, confidence, source_count,
    alias_count, review_status, version_no, effective_from, is_active
  ) values
    ('DICT-PORK-CHEEK', '볼살', pork_id, 100, 3, 4, 'APPROVED', 1, date '2026-08-03', true),
    ('DICT-BEEF-SHORT-PLATE', '우삼겹', beef_id, 100, 3, 4, 'APPROVED', 1, date '2026-08-03', true),
    ('DICT-BEEF-CHUCK', '우목심', beef_id, 100, 3, 4, 'APPROVED', 1, date '2026-08-03', true)
  on conflict (dictionary_code) do update
    set standard_name = excluded.standard_name,
        species_id = excluded.species_id,
        confidence = greatest(public.product_dictionary.confidence, excluded.confidence),
        source_count = greatest(public.product_dictionary.source_count, excluded.source_count),
        alias_count = greatest(public.product_dictionary.alias_count, excluded.alias_count),
        review_status = 'APPROVED',
        is_active = true,
        updated_at = now();

  update public.product_dictionary
     set species_id = case
           when dictionary_code in ('DICT-PORK-BELLY-TWO-LAYER', 'DAESAN-22E90F9F530500B3') then pork_id
           else beef_id
         end,
         alias_count = greatest(alias_count, 4),
         review_status = 'APPROVED',
         is_active = true,
         updated_at = now()
   where dictionary_code in (
     'DICT-PORK-BELLY-TWO-LAYER', 'DAESAN-22E90F9F530500B3',
     'DICT-0005', 'DICT-0006', 'DAESAN-F309B87BA29496EC',
     'DAESAN-85AED3CE1E08F569', 'DAESAN-6C63251DBE395A0E',
     'DAESAN-04F0CA79C528A779', 'DAESAN-5556EB246FDF159F',
     'DAESAN-87492A06F2D19472', 'DAESAN-CC088CCCACD6750F'
   );

  insert into public.product_alias (
    dictionary_id, raw_name, normalized_name, confidence,
    use_count, verified, last_used_at, is_active
  )
  select dictionary.id,
         aliases.raw_name,
         lower(regexp_replace(aliases.raw_name, '[[:space:][:punct:]]+', '', 'g')),
         aliases.confidence,
         1,
         true,
         now(),
         true
    from (values
      ('DICT-PORK-BELLY-TWO-LAYER', '이겹살', 100::numeric),
      ('DICT-PORK-BELLY-TWO-LAYER', '이겹', 100::numeric),
      ('DICT-PORK-BELLY-TWO-LAYER', '이겹쌀', 97::numeric),
      ('DICT-PORK-BELLY-TWO-LAYER', '이겹삽', 97::numeric),
      ('DAESAN-22E90F9F530500B3', '갈매기살', 100::numeric),
      ('DAESAN-22E90F9F530500B3', '갈매기', 99::numeric),
      ('DAESAN-22E90F9F530500B3', '갈매기삽', 97::numeric),
      ('DAESAN-22E90F9F530500B3', '갈매기쌀', 97::numeric),
      ('DICT-PORK-CHEEK', '볼살', 100::numeric),
      ('DICT-PORK-CHEEK', '뽈살', 99::numeric),
      ('DICT-PORK-CHEEK', '돼지볼살', 100::numeric),
      ('DICT-PORK-CHEEK', '돈볼살', 99::numeric),
      ('DICT-BEEF-SHORT-PLATE', '우삼겹', 100::numeric),
      ('DICT-BEEF-SHORT-PLATE', '우삼겹살', 100::numeric),
      ('DICT-BEEF-SHORT-PLATE', '소삼겹', 99::numeric),
      ('DICT-BEEF-SHORT-PLATE', '소삼겹살', 99::numeric),
      ('DICT-BEEF-CHUCK', '우목심', 100::numeric),
      ('DICT-BEEF-CHUCK', '우목살', 100::numeric),
      ('DICT-BEEF-CHUCK', '소목심', 100::numeric),
      ('DICT-BEEF-CHUCK', '소목살', 99::numeric),
      ('DAESAN-F309B87BA29496EC', '차돌박이', 100::numeric),
      ('DAESAN-F309B87BA29496EC', '차돌바기', 98::numeric),
      ('DAESAN-F309B87BA29496EC', '차돌박히', 97::numeric),
      ('DAESAN-F309B87BA29496EC', '우차돌', 99::numeric),
      ('DAESAN-85AED3CE1E08F569', '도가니', 100::numeric),
      ('DAESAN-85AED3CE1E08F569', '소도가니', 100::numeric),
      ('DAESAN-85AED3CE1E08F569', '우도가니', 99::numeric),
      ('DAESAN-85AED3CE1E08F569', '도가니뼈', 98::numeric),
      ('DAESAN-6C63251DBE395A0E', '채끝', 100::numeric),
      ('DAESAN-6C63251DBE395A0E', '채끝살', 100::numeric),
      ('DAESAN-6C63251DBE395A0E', '소채끝', 99::numeric),
      ('DAESAN-6C63251DBE395A0E', '스트립로인', 99::numeric),
      ('DICT-0006', '안심', 100::numeric),
      ('DICT-0006', '소안심', 100::numeric),
      ('DICT-0006', '우안심', 99::numeric),
      ('DICT-0006', '텐더로인', 99::numeric),
      ('DICT-0005', '등심', 100::numeric),
      ('DICT-0005', '소등심', 100::numeric),
      ('DICT-0005', '우등심', 99::numeric),
      ('DICT-0005', '등심살', 99::numeric),
      ('DAESAN-04F0CA79C528A779', '사태', 100::numeric),
      ('DAESAN-04F0CA79C528A779', '소사태', 100::numeric),
      ('DAESAN-04F0CA79C528A779', '우사태', 99::numeric),
      ('DAESAN-04F0CA79C528A779', '사태살', 99::numeric),
      ('DAESAN-5556EB246FDF159F', '우족', 100::numeric),
      ('DAESAN-5556EB246FDF159F', '소족', 99::numeric),
      ('DAESAN-5556EB246FDF159F', '쇠족', 99::numeric),
      ('DAESAN-5556EB246FDF159F', '소발', 98::numeric),
      ('DAESAN-87492A06F2D19472', '사골', 100::numeric),
      ('DAESAN-87492A06F2D19472', '소사골', 100::numeric),
      ('DAESAN-87492A06F2D19472', '우사골', 99::numeric),
      ('DAESAN-87492A06F2D19472', '사골뼈', 99::numeric),
      ('DAESAN-CC088CCCACD6750F', '스지', 100::numeric),
      ('DAESAN-CC088CCCACD6750F', '소힘줄', 100::numeric),
      ('DAESAN-CC088CCCACD6750F', '쇠심줄', 99::numeric),
      ('DAESAN-CC088CCCACD6750F', '우근', 98::numeric)
    ) as aliases(dictionary_code, raw_name, confidence)
    join public.product_dictionary dictionary
      on dictionary.dictionary_code = aliases.dictionary_code
  on conflict (dictionary_id, normalized_name) do update
    set raw_name = excluded.raw_name,
        confidence = greatest(public.product_alias.confidence, excluded.confidence),
        verified = true,
        is_active = true,
        last_used_at = now(),
        updated_at = now();

  update public.product_dictionary dictionary
     set alias_count = alias_totals.alias_count,
         updated_at = now()
    from (
      select dictionary_id, count(*)::integer as alias_count
        from public.product_alias
       where is_active = true
       group by dictionary_id
    ) alias_totals
   where dictionary.id = alias_totals.dictionary_id
     and dictionary.dictionary_code in (
       'DICT-PORK-BELLY-TWO-LAYER', 'DAESAN-22E90F9F530500B3',
       'DICT-PORK-CHEEK', 'DICT-BEEF-SHORT-PLATE', 'DICT-BEEF-CHUCK',
       'DICT-0005', 'DICT-0006', 'DAESAN-F309B87BA29496EC',
       'DAESAN-85AED3CE1E08F569', 'DAESAN-6C63251DBE395A0E',
       'DAESAN-04F0CA79C528A779', 'DAESAN-5556EB246FDF159F',
       'DAESAN-87492A06F2D19472', 'DAESAN-CC088CCCACD6750F'
     );
end $$;
