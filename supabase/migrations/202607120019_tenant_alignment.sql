-- Impact: align tenant defaults to SMARTPD_DEV, normalize existing routing status, and add Test Tenant B fixtures.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenant_master_tenant_type_check') then
    alter table public.tenant_master drop constraint tenant_master_tenant_type_check;
  end if;
  alter table public.tenant_master
    add constraint tenant_master_tenant_type_check
    check (tenant_type in ('SINGLE', 'FRANCHISE', 'ENTERPRISE', 'DEMO', 'TRIAL', 'UNKNOWN', 'INTERNAL'));
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenant_user_role_code_check') then
    alter table public.tenant_user drop constraint tenant_user_role_code_check;
  end if;
  alter table public.tenant_user
    add constraint tenant_user_role_code_check
    check (role_code in ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER', 'AUDITOR'));
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenant_user_status_check') then
    alter table public.tenant_user drop constraint tenant_user_status_check;
  end if;
  alter table public.tenant_user
    add constraint tenant_user_status_check
    check (status in ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED'));
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tenant_routing_routing_status_check') then
    alter table public.tenant_routing drop constraint tenant_routing_routing_status_check;
  end if;
end $$;

update public.tenant_routing
set routing_status = 'ACTIVE',
    updated_at = now()
where routing_status = 'READY';

do $$
begin
  alter table public.tenant_routing
    add constraint tenant_routing_routing_status_check
    check (routing_status in ('ACTIVE', 'PENDING', 'FAILED', 'DISABLED'));
end $$;

alter table public.tenant_user alter column user_id drop not null;

update public.tenant_master
set tenant_code = 'SMARTPD_DEV',
    tenant_name = 'SmartPD Labs DEV',
    tenant_type = 'INTERNAL',
    plan_code = 'DEVELOPMENT',
    status = 'ACTIVE',
    data_location = 'KR',
    updated_at = now()
where tenant_code = 'TENANT-DEFAULT';

insert into public.tenant_master (tenant_code, tenant_name, business_no, tenant_type, plan_code, status, data_location)
values ('SMARTPD_DEV', 'SmartPD Labs DEV', null, 'INTERNAL', 'DEVELOPMENT', 'ACTIVE', 'KR')
on conflict (tenant_code) do update
  set tenant_name = excluded.tenant_name,
      business_no = excluded.business_no,
      tenant_type = excluded.tenant_type,
      plan_code = excluded.plan_code,
      status = excluded.status,
      data_location = excluded.data_location,
      updated_at = now();

insert into public.tenant_setting (tenant_id, timezone, currency, ocr_provider_code, auto_apply_threshold, inventory_method, data_retention_days)
select id, 'Asia/Seoul', 'KRW', 'MOCK', 95, 'MOVING_AVERAGE', 3650
from public.tenant_master
where tenant_code = 'SMARTPD_DEV'
on conflict (tenant_id) do update
  set timezone = excluded.timezone,
      currency = excluded.currency,
      ocr_provider_code = excluded.ocr_provider_code,
      auto_apply_threshold = excluded.auto_apply_threshold,
      inventory_method = excluded.inventory_method,
      data_retention_days = excluded.data_retention_days,
      updated_at = now();

insert into public.tenant_routing (tenant_id, deployment_type, cluster_code, project_ref, database_region, routing_status)
select id, 'SHARED', 'SHARED_KR_01', null, 'ap-northeast-2', 'ACTIVE'
from public.tenant_master
where tenant_code = 'SMARTPD_DEV'
on conflict (tenant_id) do update
  set deployment_type = excluded.deployment_type,
      cluster_code = excluded.cluster_code,
      project_ref = excluded.project_ref,
      database_region = excluded.database_region,
      routing_status = excluded.routing_status,
      updated_at = now();

insert into public.tenant_master (tenant_code, tenant_name, business_no, tenant_type, plan_code, status, data_location)
values ('TEST_TENANT_B', 'Test Tenant B', null, 'DEMO', 'DEVELOPMENT', 'ACTIVE', 'KR')
on conflict (tenant_code) do update
  set tenant_name = excluded.tenant_name,
      business_no = excluded.business_no,
      tenant_type = excluded.tenant_type,
      plan_code = excluded.plan_code,
      status = excluded.status,
      data_location = excluded.data_location,
      updated_at = now();

insert into public.tenant_setting (tenant_id, timezone, currency, ocr_provider_code, auto_apply_threshold, inventory_method, data_retention_days)
select id, 'Asia/Seoul', 'KRW', 'MOCK', 90, 'MOVING_AVERAGE', 3650
from public.tenant_master
where tenant_code = 'TEST_TENANT_B'
on conflict (tenant_id) do update
  set timezone = excluded.timezone,
      currency = excluded.currency,
      ocr_provider_code = excluded.ocr_provider_code,
      auto_apply_threshold = excluded.auto_apply_threshold,
      inventory_method = excluded.inventory_method,
      data_retention_days = excluded.data_retention_days,
      updated_at = now();

insert into public.tenant_routing (tenant_id, deployment_type, cluster_code, project_ref, database_region, routing_status)
select id, 'SHARED', 'SHARED_KR_01', null, 'ap-northeast-2', 'ACTIVE'
from public.tenant_master
where tenant_code = 'TEST_TENANT_B'
on conflict (tenant_id) do update
  set deployment_type = excluded.deployment_type,
      cluster_code = excluded.cluster_code,
      project_ref = excluded.project_ref,
      database_region = excluded.database_region,
      routing_status = excluded.routing_status,
      updated_at = now();

insert into public.supplier_master (tenant_id, supplier_code, supplier_name, business_no, representative_name, phone, address, source_id)
select t.id, 'SUP-TEST-B-001', 'Test Tenant B Supplier', null, null, null, null, s.id
from public.tenant_master t
left join public.source_registry s on s.source_code = 'SRC-L5-GOOD-CHUKSAN'
where t.tenant_code = 'TEST_TENANT_B'
  and not exists (
    select 1
    from public.supplier_master sm
    where sm.tenant_id = t.id
      and sm.supplier_code = 'SUP-TEST-B-001'
  );

insert into public.product_master (
  tenant_id, product_code, product_name, dictionary_id, supplier_id, brand_attribute_id, default_unit_attribute_id, status, version_no, effective_from
)
select
  t.id,
  'PROD-TEST-B-001',
  '목전지 B',
  (select id from public.product_dictionary where dictionary_code = 'DICT-0002'),
  sm.id,
  null,
  (select id from public.product_attribute_value where attribute_type = 'UNIT' and attribute_code = 'KG'),
  'ACTIVE',
  1,
  date '2026-07-12'
from public.tenant_master t
join public.supplier_master sm on sm.tenant_id = t.id and sm.supplier_code = 'SUP-TEST-B-001'
where t.tenant_code = 'TEST_TENANT_B'
  and not exists (
    select 1
    from public.product_master pm
    where pm.tenant_id = t.id
      and pm.product_code = 'PROD-TEST-B-001'
  );

insert into public.ocr_document (
  tenant_id, document_code, source_id, supplier_id, original_file_path, original_file_hash, file_name, mime_type, document_status,
  ocr_provider_id, ocr_raw_json, parsed_json, meatos_score, provider_confidence, retry_count, next_retry_at, invoice_date, total_amount
)
select
  t.id,
  'DOC-TEST-B-001',
  s.id,
  sm.id,
  '/tenant/TEST_TENANT_B/ocr/doc-001.jpg',
  'tenant-test-b-doc-hash-001',
  'tenant-b-sample.jpg',
  'image/jpeg',
  'REVIEW_REQUIRED',
  p.id,
  jsonb_build_object(
    'providerId', 'clova-general',
    'providerConfidence', 97,
    'rawText', '목전지 B 2 10000'
  ),
  jsonb_build_object(
    'documentFields', jsonb_build_object(
      'supplierName', 'Test Tenant B Supplier',
      'invoiceDate', '2026-07-12',
      'totalAmount', 20000
    ),
    'validation', jsonb_build_object(
      'lineCount', 1,
      'calculationOk', true,
      'issues', jsonb_build_array()
    ),
    'meatosScore', 95,
    'lineItems', jsonb_build_array(
      jsonb_build_object(
        'rowNo', 1,
        'rawProductName', '목전지 B',
        'normalizedProductName', '목전지 B',
        'quantity', 2,
        'unit', 'kg',
        'unitPrice', 10000,
        'amount', 20000,
        'confidence', 95,
        'reviewStatus', 'PENDING'
      )
    )
  ),
  95,
  97,
  0,
  null,
  date '2026-07-12',
  20000
from public.tenant_master t
join public.supplier_master sm on sm.tenant_id = t.id and sm.supplier_code = 'SUP-TEST-B-001'
left join public.source_registry s on s.source_code = 'SRC-L5-GOOD-CHUKSAN'
left join public.ocr_provider_registry p on p.provider_code = 'clova-general'
where t.tenant_code = 'TEST_TENANT_B'
  and not exists (
    select 1
    from public.ocr_document od
    where od.tenant_id = t.id
      and od.document_code = 'DOC-TEST-B-001'
  );

insert into public.ocr_line_item (
  tenant_id, ocr_document_id, line_no, raw_product_name, raw_specification, raw_quantity, raw_unit, raw_unit_price, raw_amount,
  raw_origin, raw_grade, dictionary_candidate_id, selected_dictionary_id, product_master_id, confidence, review_status
)
select
  t.id,
  od.id,
  1,
  '목전지 B',
  null,
  2,
  'kg',
  10000,
  20000,
  '국내산',
  '1+',
  null,
  null,
  null,
  95,
  'PENDING'
from public.tenant_master t
join public.ocr_document od on od.tenant_id = t.id and od.document_code = 'DOC-TEST-B-001'
where t.tenant_code = 'TEST_TENANT_B'
  and not exists (
    select 1
    from public.ocr_line_item oli
    where oli.tenant_id = t.id
      and oli.ocr_document_id = od.id
      and oli.line_no = 1
  );
