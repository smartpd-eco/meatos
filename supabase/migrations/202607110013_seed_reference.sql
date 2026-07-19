-- Impact: reference seed only. Full Good Chuksan import remains PM-approved later.

insert into public.source_registry (source_code, source_name, source_type, organization_name, authority_level, collector_name)
values
  ('SRC-L1-MOFA', '농림축산식품부', 'government', '농림축산식품부', 'L1', 'system'),
  ('SRC-L1-KAPE', '축산물품질평가원', 'government', '축산물품질평가원', 'L1', 'system'),
  ('SRC-L5-GOOD-CHUKSAN', '좋은축산', 'supplier', '좋은축산', 'L5', 'PM')
on conflict (source_code) do nothing;

insert into public.supplier_master (supplier_code, supplier_name, business_no, representative_name, phone, address, source_id)
select 'SUP-GOOD-CHUKSAN', '좋은축산', '123-45-67890', '담당자', '010-1111-2222', '서울', s.id
from public.source_registry s
where s.source_code = 'SRC-L5-GOOD-CHUKSAN'
on conflict (supplier_code) do nothing;

insert into public.product_species (species_code, species_name, sort_order)
values
  ('PORK', '돼지', 1),
  ('HANWOO', '한우', 2),
  ('BEEF', '소고기', 3),
  ('IMPORTED_BEEF', '수입산우육', 4),
  ('CHICKEN', '닭', 5),
  ('DUCK', '오리', 6),
  ('OTHER', '기타', 99)
on conflict (species_code) do nothing;

insert into public.product_category (category_code, category_name, parent_id, depth, sort_order)
values
  ('PORK', '돼지고기', null, 1, 1),
  ('BEEF', '소고기', null, 1, 2),
  ('PROCESSED', '가공품', null, 1, 3)
on conflict (category_code) do nothing;

insert into public.product_category (category_code, category_name, parent_id, depth, sort_order)
select x.category_code, x.category_name, p.id, x.depth, x.sort_order
from (
  values
    ('PORK-LOIN', '등심', 'PORK', 2, 1),
    ('PORK-BELLY', '삼겹', 'PORK', 2, 2),
    ('PORK-SHOULDER', '앞다리', 'PORK', 2, 3),
    ('BEEF-RIB', '갈비', 'BEEF', 2, 1),
    ('BEEF-BRISKET', '양지', 'BEEF', 2, 2)
) as x(category_code, category_name, parent_code, depth, sort_order)
join public.product_category p on p.category_code = x.parent_code
on conflict (category_code) do nothing;

insert into public.product_attribute_value (attribute_type, attribute_code, attribute_name, sort_order)
values
  ('UNIT', 'KG', 'kg', 1),
  ('UNIT', 'G', 'g', 2),
  ('UNIT', 'EA', 'ea', 3),
  ('STORAGE', 'FRESH', 'fresh', 1),
  ('STORAGE', 'FROZEN', 'frozen', 2),
  ('PROCESSING', 'RAW', '생', 1),
  ('PROCESSING', 'CUT', '절단', 2),
  ('PROCESSING', 'PACKED', '포장', 3),
  ('SKIN', 'PORK_SKINLESS', '미박', 1),
  ('BONE', 'BONELESS', '무골', 1),
  ('ORIGIN', 'KOREA', '국내산', 1),
  ('ORIGIN', 'USA', '미국산', 2),
  ('ORIGIN', 'AUSTRALIA', '호주산', 3),
  ('GRADE', '1PLUS', '1+', 1),
  ('GRADE', '1PLUSPLUS', '1++', 2),
  ('GRADE', 'PRIME', 'PRIME', 3),
  ('BRAND', 'GOOD_CHUKSAN', '좋은축산', 1)
on conflict (attribute_type, attribute_code) do nothing;

insert into public.product_dictionary (
  dictionary_code, standard_name, species_id, category_id, part_attribute_id, processing_attribute_id,
  skin_attribute_id, bone_attribute_id, storage_attribute_id, origin_attribute_id, grade_attribute_id,
  unit_attribute_id, confidence, source_count, alias_count, review_status, version_no, effective_from
)
values
  (
    'DICT-0001', '삼겹살',
    (select id from public.product_species where species_code = 'PORK'),
    (select id from public.product_category where category_code = 'PORK-BELLY'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    96, 3, 5, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0002', '미박 앞다리살',
    (select id from public.product_species where species_code = 'PORK'),
    (select id from public.product_category where category_code = 'PORK-SHOULDER'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    94, 2, 4, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0003', '갈비',
    (select id from public.product_species where species_code = 'BEEF'),
    (select id from public.product_category where category_code = 'BEEF-RIB'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    91, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0004', '양지',
    (select id from public.product_species where species_code = 'BEEF'),
    (select id from public.product_category where category_code = 'BEEF-BRISKET'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    90, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0005', '등심',
    (select id from public.product_species where species_code = 'BEEF'),
    (select id from public.product_category where category_code = 'BEEF-RIB'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    90, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0006', '안심',
    (select id from public.product_species where species_code = 'BEEF'),
    (select id from public.product_category where category_code = 'BEEF-RIB'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    89, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0007', '목살',
    (select id from public.product_species where species_code = 'PORK'),
    (select id from public.product_category where category_code = 'PORK-LOIN'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
    (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    88, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0008', '삼겹 구이용',
    (select id from public.product_species where species_code = 'PORK'),
    (select id from public.product_category where category_code = 'PORK-BELLY'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'CUT'),
    (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    87, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0009', '갈비탕용 갈비',
    (select id from public.product_species where species_code = 'BEEF'),
    (select id from public.product_category where category_code = 'BEEF-RIB'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'CUT'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
    (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
    (select id from public.product_attribute_value where attribute_type = 'ORIGIN' and attribute_code = 'KOREA'),
    (select id from public.product_attribute_value where attribute_type = 'GRADE' and attribute_code = '1PLUS'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    86, 2, 3, 'APPROVED', 1, date '2026-07-11'
  ),
  (
    'DICT-0010', '가공비',
    (select id from public.product_species where species_code = 'OTHER'),
    (select id from public.product_category where category_code = 'PROCESSED'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'PACKED'),
    null,
    null,
    null,
    null,
    null,
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'EA'),
    80, 1, 1, 'APPROVED', 1, date '2026-07-11'
  )
on conflict (dictionary_code) do nothing;

insert into public.product_master (
  product_code, product_name, dictionary_id, supplier_id, brand_attribute_id, default_unit_attribute_id,
  status, version_no, effective_from
)
values
  (
    'PROD-0001', '삼겹살',
    (select id from public.product_dictionary where dictionary_code = 'DICT-0001'),
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    (select id from public.product_attribute_value where attribute_type = 'BRAND' and attribute_code = 'GOOD_CHUKSAN'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    'ACTIVE', 1, date '2026-07-11'
  ),
  (
    'PROD-0002', '미박 앞다리살',
    (select id from public.product_dictionary where dictionary_code = 'DICT-0002'),
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    (select id from public.product_attribute_value where attribute_type = 'BRAND' and attribute_code = 'GOOD_CHUKSAN'),
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    'ACTIVE', 1, date '2026-07-11'
  ),
  (
    'PROD-0003', '갈비',
    (select id from public.product_dictionary where dictionary_code = 'DICT-0003'),
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    null,
    (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
    'ACTIVE', 1, date '2026-07-11'
  )
on conflict (product_code) do nothing;

insert into public.product_alias (dictionary_id, raw_name, normalized_name, source_id, confidence, use_count, verified, last_used_at)
values
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0001'),
    '삼겹', '삼겹',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    96, 18, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0001'),
    '생삼겹', '생삼겹',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    94, 11, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0001'),
    '냉장 삼겹', '냉장삼겹',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    92, 9, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0002'),
    '미삼', '미삼',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    91, 7, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0002'),
    '미전지', '미전지',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    90, 6, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0003'),
    '갈비살', '갈비살',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    88, 5, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0004'),
    '양지머리', '양지머리',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    87, 4, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0005'),
    '등심', '등심',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    86, 4, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0006'),
    '안심', '안심',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    85, 4, true, timestamptz '2026-07-10T11:00:00Z'
  ),
  (
    (select id from public.product_dictionary where dictionary_code = 'DICT-0007'),
    '목살', '목살',
    (select id from public.source_registry where source_code = 'SRC-L5-GOOD-CHUKSAN'),
    84, 4, true, timestamptz '2026-07-10T11:00:00Z'
  )
on conflict (dictionary_id, normalized_name) do nothing;

insert into public.supplier_alias (supplier_id, dictionary_id, raw_name, normalized_name, confidence, learning_count, verified, auto_apply, last_used_at)
values
  (
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    (select id from public.product_dictionary where dictionary_code = 'DICT-0001'),
    '미삼', '미삼', 95, 42, true, true, timestamptz '2026-07-10T11:30:00Z'
  ),
  (
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    (select id from public.product_dictionary where dictionary_code = 'DICT-0002'),
    '미전지', '미전지', 92, 29, true, true, timestamptz '2026-07-10T11:30:00Z'
  ),
  (
    (select id from public.supplier_master where supplier_code = 'SUP-GOOD-CHUKSAN'),
    (select id from public.product_dictionary where dictionary_code = 'DICT-0003'),
    '갈비', '갈비', 90, 18, true, true, timestamptz '2026-07-10T11:30:00Z'
  )
on conflict (supplier_id, normalized_name) do nothing;

insert into public.ocr_provider_registry (provider_code, provider_name, provider_type, priority, is_enabled, configuration)
values
  ('clova-general', 'NAVER CLOVA OCR General', 'PRIMARY', 1, true, '{"mode":"general"}'::jsonb),
  ('meatos-parser', 'MEATOS Parser', 'PARSER', 2, true, '{"mode":"parser"}'::jsonb),
  ('azure-doc-intelligence', 'Azure Document Intelligence', 'FALLBACK', 3, true, '{"mode":"invoice"}'::jsonb),
  ('google-document-ai', 'Google Document AI', 'FALLBACK', 4, true, '{"mode":"invoice"}'::jsonb)
on conflict (provider_code) do nothing;
