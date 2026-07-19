-- Impact: add tenant_id columns to operational tables and backfill default tenant.

alter table if exists public.supplier_master add column if not exists tenant_id uuid;
alter table if exists public.product_master add column if not exists tenant_id uuid;
alter table if exists public.supplier_alias add column if not exists tenant_id uuid;
alter table if exists public.import_batch add column if not exists tenant_id uuid;
alter table if exists public.product_source_row add column if not exists tenant_id uuid;
alter table if exists public.import_queue add column if not exists tenant_id uuid;
alter table if exists public.review_queue add column if not exists tenant_id uuid;
alter table if exists public.learning_history add column if not exists tenant_id uuid;
alter table if exists public.ocr_document add column if not exists tenant_id uuid;
alter table if exists public.ocr_line_item add column if not exists tenant_id uuid;
alter table if exists public.ocr_processing_history add column if not exists tenant_id uuid;
alter table if exists public.audit_event add column if not exists tenant_id uuid;
alter table if exists public.ocr_product_candidate add column if not exists tenant_id uuid;

do $$
declare
  default_tenant_id uuid;
begin
  insert into public.tenant_master (tenant_code, tenant_name, tenant_type, plan_code, status, data_location)
  values ('TENANT-DEFAULT', 'MEATOS Default Tenant', 'SINGLE', 'STANDARD', 'ACTIVE', 'SHARED_KR_01')
  on conflict (tenant_code) do update
    set tenant_name = excluded.tenant_name,
        tenant_type = excluded.tenant_type,
        plan_code = excluded.plan_code,
        status = excluded.status,
        data_location = excluded.data_location,
        updated_at = now()
  returning id into default_tenant_id;

  insert into public.tenant_setting (tenant_id, timezone, currency, ocr_provider_code, auto_apply_threshold, inventory_method, data_retention_days)
  values (default_tenant_id, 'Asia/Seoul', 'KRW', 'clova-general', 95, 'LEDGER', 365)
  on conflict (tenant_id) do update
    set timezone = excluded.timezone,
        currency = excluded.currency,
        ocr_provider_code = excluded.ocr_provider_code,
        auto_apply_threshold = excluded.auto_apply_threshold,
        inventory_method = excluded.inventory_method,
        data_retention_days = excluded.data_retention_days,
        updated_at = now();

  insert into public.tenant_routing (tenant_id, deployment_type, cluster_code, project_ref, database_region, routing_status)
  values (default_tenant_id, 'SHARED', 'SHARED_KR_01', null, 'ap-northeast-2', 'READY')
  on conflict (tenant_id) do update
    set deployment_type = excluded.deployment_type,
        cluster_code = excluded.cluster_code,
        project_ref = excluded.project_ref,
        database_region = excluded.database_region,
        routing_status = excluded.routing_status,
        updated_at = now();

  update public.supplier_master
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.product_master pm
  set tenant_id = coalesce(sm.tenant_id, default_tenant_id)
  from public.supplier_master sm
  where pm.supplier_id = sm.id
    and pm.tenant_id is null;

  update public.product_master
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.supplier_alias sa
  set tenant_id = coalesce(sm.tenant_id, default_tenant_id)
  from public.supplier_master sm
  where sa.supplier_id = sm.id
    and sa.tenant_id is null;

  update public.supplier_alias
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.import_batch ib
  set tenant_id = coalesce(sm.tenant_id, default_tenant_id)
  from public.supplier_master sm
  where ib.supplier_id = sm.id
    and ib.tenant_id is null;

  update public.import_batch
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.product_source_row psr
  set tenant_id = ib.tenant_id
  from public.import_batch ib
  where psr.batch_id = ib.id
    and psr.tenant_id is null;

  update public.product_source_row
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.import_queue iq
  set tenant_id = ib.tenant_id
  from public.product_source_row psr
  join public.import_batch ib on ib.id = psr.batch_id
  where iq.source_row_id = psr.id
    and iq.tenant_id is null;

  update public.import_queue
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.review_queue
  set tenant_id = psr.tenant_id
  from public.product_source_row psr
  where public.review_queue.source_row_id = psr.id
    and public.review_queue.tenant_id is null;

  update public.review_queue
  set tenant_id = od.tenant_id
  from public.ocr_line_item oli
  join public.ocr_document od on od.id = oli.ocr_document_id
  where public.review_queue.ocr_line_item_id = oli.id
    and public.review_queue.tenant_id is null;

  update public.review_queue
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.learning_history lh
  set tenant_id = coalesce(sm.tenant_id, default_tenant_id)
  from public.supplier_master sm
  where lh.supplier_id = sm.id
    and lh.tenant_id is null;

  update public.learning_history
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.ocr_document od
  set tenant_id = coalesce(sm.tenant_id, default_tenant_id)
  from public.supplier_master sm
  where od.supplier_id = sm.id
    and od.tenant_id is null;

  update public.ocr_document
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.ocr_line_item oli
  set tenant_id = od.tenant_id
  from public.ocr_document od
  where oli.ocr_document_id = od.id
    and oli.tenant_id is null;

  update public.ocr_line_item
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.ocr_processing_history oph
  set tenant_id = od.tenant_id
  from public.ocr_document od
  where oph.ocr_document_id = od.id
    and oph.tenant_id is null;

  update public.ocr_processing_history
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.audit_event
  set tenant_id = default_tenant_id
  where tenant_id is null;

  update public.ocr_product_candidate opc
  set tenant_id = od.tenant_id
  from public.ocr_document od
  where opc.ocr_document_id = od.id
    and opc.tenant_id is null;

  update public.ocr_product_candidate
  set tenant_id = default_tenant_id
  where tenant_id is null;

  insert into public.tenant_usage_daily (
    tenant_id, usage_date, active_users, api_requests, write_transactions, ocr_documents, storage_bytes, database_rows, error_count, p95_latency_ms
  )
  values (default_tenant_id, current_date, 0, 0, 0, 0, 0, 0, 0, 0)
  on conflict (tenant_id, usage_date) do nothing;
end $$;
