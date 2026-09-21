-- Non-destructive reference-data correction for high-risk product-name pairs:
-- 가브리살/갈비 and 미박/박피. Existing tenant learning rows are preserved.

insert into public.product_category (category_code, category_name, parent_id, depth, sort_order)
select 'PORK-RIB', '돼지갈비', parent.id, 2, 4
  from public.product_category parent
 where parent.category_code = 'PORK'
   and not exists (
     select 1
       from public.product_category existing
      where existing.category_code = 'PORK-RIB'
   );

update public.product_category
   set category_name = '돼지갈비',
       parent_id = (
         select id
           from public.product_category
          where category_code = 'PORK'
       ),
       depth = 2,
       sort_order = 4
 where category_code = 'PORK-RIB';

-- The original seed attached the label "미박" to the code PORK_SKINLESS.
-- Correct the label and introduce a separate, semantically accurate skin-on code.
update public.product_attribute_value
   set attribute_name = '박피',
       sort_order = 2
 where attribute_type = 'SKIN'
   and attribute_code = 'PORK_SKINLESS';

insert into public.product_attribute_value (
  attribute_type, attribute_code, attribute_name, sort_order
)
select 'SKIN', 'PORK_SKIN_ON', '미박', 1
where not exists (
  select 1
    from public.product_attribute_value
   where attribute_type = 'SKIN'
     and attribute_code = 'PORK_SKIN_ON'
);

update public.product_attribute_value
   set attribute_name = '미박',
       sort_order = 1
 where attribute_type = 'SKIN'
   and attribute_code = 'PORK_SKIN_ON';

update public.product_dictionary
   set skin_attribute_id = (
         select id
           from public.product_attribute_value
          where attribute_type = 'SKIN'
            and attribute_code = 'PORK_SKIN_ON'
       ),
       updated_at = now()
 where dictionary_code in ('DICT-0001', 'DICT-0002');

with dictionary_source (
  dictionary_code, standard_name, species_id, category_id,
  processing_attribute_id, skin_attribute_id, bone_attribute_id,
  storage_attribute_id, unit_attribute_id, confidence, source_count,
  alias_count, review_status, version_no, effective_from, is_active
) as (
values
(
  'DICT-PORK-GABURI', '가브리살',
  (select id from public.product_species where species_code = 'PORK'),
  (select id from public.product_category where category_code = 'PORK-LOIN'),
  (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
  (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
  (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
  (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  99, 2, 13, 'APPROVED', 1, date '2026-07-30', true
),
(
  'DICT-PORK-RIB', '돼지 갈비',
  (select id from public.product_species where species_code = 'PORK'),
  (select id from public.product_category where category_code = 'PORK-RIB'),
  (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
  null,
  null,
  (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  99, 2, 8, 'APPROVED', 1, date '2026-07-30', true
),
(
  'DICT-PORK-BACK-RIB', '등갈비',
  (select id from public.product_species where species_code = 'PORK'),
  (select id from public.product_category where category_code = 'PORK-RIB'),
  (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
  null,
  null,
  (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  99, 2, 4, 'APPROVED', 1, date '2026-07-30', true
),
(
  'DICT-PORK-SIDE-RIB', '쪽갈비',
  (select id from public.product_species where species_code = 'PORK'),
  (select id from public.product_category where category_code = 'PORK-RIB'),
  (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
  null,
  null,
  (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  99, 2, 4, 'APPROVED', 1, date '2026-07-30', true
),
(
  'DICT-PORK-BELLY-SKINLESS', '박피 삼겹',
  (select id from public.product_species where species_code = 'PORK'),
  (select id from public.product_category where category_code = 'PORK-BELLY'),
  (select id from public.product_attribute_value where attribute_type = 'PROCESSING' and attribute_code = 'RAW'),
  (select id from public.product_attribute_value where attribute_type = 'SKIN' and attribute_code = 'PORK_SKINLESS'),
  (select id from public.product_attribute_value where attribute_type = 'BONE' and attribute_code = 'BONELESS'),
  (select id from public.product_attribute_value where attribute_type = 'STORAGE' and attribute_code = 'FRESH'),
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  99, 2, 6, 'APPROVED', 1, date '2026-07-30', true
)
),
updated_dictionaries as (
  update public.product_dictionary existing
     set standard_name = source.standard_name,
         species_id = source.species_id,
         category_id = source.category_id,
         processing_attribute_id = source.processing_attribute_id,
         skin_attribute_id = source.skin_attribute_id,
         bone_attribute_id = source.bone_attribute_id,
         storage_attribute_id = source.storage_attribute_id,
         unit_attribute_id = source.unit_attribute_id,
         confidence = source.confidence,
         source_count = greatest(existing.source_count, source.source_count),
         alias_count = greatest(existing.alias_count, source.alias_count),
         review_status = 'APPROVED',
         is_active = true,
         updated_at = now()
    from dictionary_source source
   where existing.dictionary_code = source.dictionary_code
  returning existing.id
)
insert into public.product_dictionary (
  dictionary_code, standard_name, species_id, category_id,
  processing_attribute_id, skin_attribute_id, bone_attribute_id,
  storage_attribute_id, unit_attribute_id, confidence, source_count,
  alias_count, review_status, version_no, effective_from, is_active
)
select source.dictionary_code, source.standard_name, source.species_id, source.category_id,
       source.processing_attribute_id, source.skin_attribute_id, source.bone_attribute_id,
       source.storage_attribute_id, source.unit_attribute_id, source.confidence, source.source_count,
       source.alias_count, source.review_status, source.version_no, source.effective_from, source.is_active
  from dictionary_source source
 where not exists (
   select 1
     from public.product_dictionary existing
    where existing.dictionary_code = source.dictionary_code
 );

with product_source (
  product_code, tenant_id, product_name, dictionary_id, supplier_id,
  default_unit_attribute_id, status, version_no, effective_from, is_active
) as (
values
(
  'PROD-PORK-GABURI', '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid, '가브리살',
  (select id from public.product_dictionary where dictionary_code = 'DICT-PORK-GABURI'),
  null::uuid,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE', 1, date '2026-07-30', true
),
(
  'PROD-PORK-RIB', '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid, '돼지 갈비',
  (select id from public.product_dictionary where dictionary_code = 'DICT-PORK-RIB'),
  null::uuid,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE', 1, date '2026-07-30', true
),
(
  'PROD-PORK-BACK-RIB', '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid, '등갈비',
  (select id from public.product_dictionary where dictionary_code = 'DICT-PORK-BACK-RIB'),
  null::uuid,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE', 1, date '2026-07-30', true
),
(
  'PROD-PORK-SIDE-RIB', '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid, '쪽갈비',
  (select id from public.product_dictionary where dictionary_code = 'DICT-PORK-SIDE-RIB'),
  null::uuid,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE', 1, date '2026-07-30', true
),
(
  'PROD-PORK-BELLY-SKINLESS', '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid, '박피 삼겹',
  (select id from public.product_dictionary where dictionary_code = 'DICT-PORK-BELLY-SKINLESS'),
  null::uuid,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE', 1, date '2026-07-30', true
)
),
updated_products as (
  update public.product_master existing
     set product_name = source.product_name,
         dictionary_id = source.dictionary_id,
         default_unit_attribute_id = source.default_unit_attribute_id,
         status = 'ACTIVE',
         is_active = true,
         updated_at = now()
    from product_source source
   where existing.product_code = source.product_code
     and existing.tenant_id = source.tenant_id
  returning existing.id
)
insert into public.product_master (
  product_code, tenant_id, product_name, dictionary_id, supplier_id,
  default_unit_attribute_id, status, version_no, effective_from, is_active
)
select source.product_code, source.tenant_id, source.product_name, source.dictionary_id, source.supplier_id,
       source.default_unit_attribute_id, source.status, source.version_no,
       source.effective_from, source.is_active
  from product_source source
 where not exists (
   select 1
    from public.product_master existing
    where existing.product_code = source.product_code
      and existing.tenant_id = source.tenant_id
 );

with alias_source(dictionary_code, raw_name, confidence) as (
  values
    ('DICT-PORK-GABURI', '가브리살', 100::numeric),
    ('DICT-PORK-GABURI', '가브리', 99::numeric),
    ('DICT-PORK-GABURI', '등심덧살', 100::numeric),
    ('DICT-PORK-GABURI', '가브릿살', 99::numeric),
    ('DICT-PORK-GABURI', '가브리쌀', 98::numeric),
    ('DICT-PORK-GABURI', '가브리삽', 98::numeric),
    ('DICT-PORK-GABURI', '가브리샬', 98::numeric),
    ('DICT-PORK-GABURI', '가브라살', 98::numeric),
    ('DICT-PORK-GABURI', '가부리살', 98::numeric),
    ('DICT-PORK-GABURI', '가부리', 97::numeric),
    ('DICT-PORK-GABURI', '가비리살', 97::numeric),
    ('DICT-PORK-GABURI', '까브리살', 97::numeric),
    ('DICT-PORK-RIB', '돼지갈비', 100::numeric),
    ('DICT-PORK-RIB', '돼지갈비살', 100::numeric),
    ('DICT-PORK-RIB', '돈갈비', 100::numeric),
    ('DICT-PORK-RIB', '돈갈비살', 100::numeric),
    ('DICT-PORK-BACK-RIB', '등갈비', 100::numeric),
    ('DICT-PORK-BACK-RIB', '등갈비살', 99::numeric),
    ('DICT-PORK-BACK-RIB', '등갈삐', 97::numeric),
    ('DICT-PORK-BACK-RIB', '로인립', 99::numeric),
    ('DICT-PORK-SIDE-RIB', '쪽갈비', 100::numeric),
    ('DICT-PORK-SIDE-RIB', '쪽갈비살', 99::numeric),
    ('DICT-PORK-SIDE-RIB', '쪽갈삐', 97::numeric),
    ('DICT-PORK-SIDE-RIB', '스페어립', 99::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '박피 삼겹', 100::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '박피 삼겹살', 100::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '박펴 삼겹살', 98::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '박파 삼겹살', 98::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '박비 삼겹살', 97::numeric),
    ('DICT-PORK-BELLY-SKINLESS', '빅피 삼겹살', 97::numeric),
    ('DICT-0001', '미박 삼겹', 100::numeric),
    ('DICT-0001', '미박 삼겹살', 100::numeric),
    ('DICT-0001', '미빅피 삼겹살', 98::numeric),
    ('DICT-0001', '미박피 삼겹살', 98::numeric),
    ('DICT-0003', '소갈비', 100::numeric),
    ('DICT-0003', '우갈비', 99::numeric),
    ('DICT-0003', '한우갈비', 100::numeric),
    ('DICT-0003', '갈빗살', 99::numeric),
    ('DICT-0003', '갈삐', 97::numeric)
),
resolved_aliases as (
  select dictionary.id as dictionary_id,
         alias_source.raw_name,
         lower(regexp_replace(alias_source.raw_name, '[[:space:][:punct:]]+', '', 'g')) as normalized_name,
         (select id from public.source_registry where source_code = 'SRC-L1-KAPE') as source_id,
         alias_source.confidence
    from alias_source
    join public.product_dictionary dictionary
      on dictionary.dictionary_code = alias_source.dictionary_code
),
updated_aliases as (
  update public.product_alias existing
     set raw_name = resolved.raw_name,
         source_id = coalesce(resolved.source_id, existing.source_id),
         confidence = greatest(existing.confidence, resolved.confidence),
         verified = true,
         is_active = true,
         last_used_at = now(),
         updated_at = now()
    from resolved_aliases resolved
   where existing.dictionary_id = resolved.dictionary_id
     and existing.normalized_name = resolved.normalized_name
  returning existing.id
)
insert into public.product_alias (
  dictionary_id, raw_name, normalized_name, source_id,
  confidence, use_count, verified, last_used_at, is_active
)
select resolved.dictionary_id,
       resolved.raw_name,
       resolved.normalized_name,
       resolved.source_id,
       resolved.confidence,
       1,
       true,
       now(),
       true
  from resolved_aliases resolved
 where not exists (
   select 1
     from public.product_alias existing
    where existing.dictionary_id = resolved.dictionary_id
      and existing.normalized_name = resolved.normalized_name
 );
