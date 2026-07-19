-- Impact: enforce tenant-scoped uniqueness and add tenant-first indexes.

alter table if exists public.supplier_master alter column tenant_id set not null;
alter table if exists public.product_master alter column tenant_id set not null;
alter table if exists public.supplier_alias alter column tenant_id set not null;
alter table if exists public.import_batch alter column tenant_id set not null;
alter table if exists public.product_source_row alter column tenant_id set not null;
alter table if exists public.import_queue alter column tenant_id set not null;
alter table if exists public.review_queue alter column tenant_id set not null;
alter table if exists public.learning_history alter column tenant_id set not null;
alter table if exists public.ocr_document alter column tenant_id set not null;
alter table if exists public.ocr_line_item alter column tenant_id set not null;
alter table if exists public.ocr_processing_history alter column tenant_id set not null;
alter table if exists public.audit_event alter column tenant_id set not null;
alter table if exists public.ocr_product_candidate alter column tenant_id set not null;

alter table if exists public.supplier_master drop constraint if exists supplier_master_supplier_code_key;
alter table if exists public.product_master drop constraint if exists product_master_product_code_key;
alter table if exists public.supplier_alias drop constraint if exists supplier_alias_supplier_id_normalized_name_key;
alter table if exists public.import_batch drop constraint if exists import_batch_batch_code_key;
alter table if exists public.ocr_document drop constraint if exists ocr_document_document_code_key;
alter table if exists public.ocr_line_item drop constraint if exists ocr_line_item_ocr_document_id_line_no_key;
alter table if exists public.ocr_product_candidate drop constraint if exists ocr_product_candidate_ocr_document_id_line_no_dictionary_id_key;

alter table if exists public.supplier_master
  add constraint supplier_master_tenant_id_supplier_code_key unique (tenant_id, supplier_code);

alter table if exists public.product_master
  add constraint product_master_tenant_id_product_code_key unique (tenant_id, product_code);

alter table if exists public.supplier_alias
  add constraint supplier_alias_tenant_id_supplier_id_normalized_name_key unique (tenant_id, supplier_id, normalized_name);

alter table if exists public.import_batch
  add constraint import_batch_tenant_id_batch_code_key unique (tenant_id, batch_code);

alter table if exists public.ocr_document
  add constraint ocr_document_tenant_id_document_code_key unique (tenant_id, document_code);

alter table if exists public.ocr_line_item
  add constraint ocr_line_item_tenant_id_ocr_document_id_line_no_key unique (tenant_id, ocr_document_id, line_no);

alter table if exists public.ocr_product_candidate
  add constraint ocr_product_candidate_tenant_id_ocr_document_id_line_no_dictionary_id_key unique (tenant_id, ocr_document_id, line_no, dictionary_id);

create index if not exists supplier_master_tenant_id_supplier_name_idx on public.supplier_master (tenant_id, supplier_name);
create index if not exists product_master_tenant_id_product_name_idx on public.product_master (tenant_id, product_name);
create index if not exists supplier_alias_tenant_id_supplier_id_normalized_name_idx on public.supplier_alias (tenant_id, supplier_id, normalized_name);
create index if not exists import_batch_tenant_id_queue_idx on public.import_batch (tenant_id, created_at desc);
create index if not exists product_source_row_tenant_id_batch_id_row_no_idx on public.product_source_row (tenant_id, batch_id, row_no);
create index if not exists import_queue_tenant_id_queue_status_created_at_idx on public.import_queue (tenant_id, queue_status, created_at desc);
create index if not exists review_queue_tenant_id_status_created_at_idx on public.review_queue (tenant_id, status, created_at desc);
create index if not exists learning_history_tenant_id_supplier_id_raw_name_idx on public.learning_history (tenant_id, supplier_id, raw_name);
create index if not exists ocr_document_tenant_id_document_status_created_at_idx on public.ocr_document (tenant_id, document_status, created_at desc);
create index if not exists ocr_line_item_tenant_id_ocr_document_id_line_no_idx on public.ocr_line_item (tenant_id, ocr_document_id, line_no);
create index if not exists ocr_processing_history_tenant_id_ocr_document_id_created_at_idx on public.ocr_processing_history (tenant_id, ocr_document_id, created_at desc);
create index if not exists ocr_product_candidate_tenant_id_status_created_at_idx on public.ocr_product_candidate (tenant_id, status, created_at desc);
create index if not exists audit_event_tenant_id_entity_type_entity_id_created_at_idx on public.audit_event (tenant_id, entity_type, entity_id, created_at desc);
create index if not exists tenant_usage_daily_tenant_id_usage_date_idx on public.tenant_usage_daily (tenant_id, usage_date desc);
create index if not exists tenant_routing_tenant_id_cluster_code_idx on public.tenant_routing (tenant_id, cluster_code);
create index if not exists tenant_routing_tenant_id_deployment_type_idx on public.tenant_routing (tenant_id, deployment_type);
