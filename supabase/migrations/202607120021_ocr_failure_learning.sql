-- Impact: OCR provider thin slice, recapture tracking, supplier templates, and failure learning.

alter table if exists public.ocr_document
  add column if not exists provider_name text,
  add column if not exists provider_version text,
  add column if not exists quality_grade text,
  add column if not exists recapture_required boolean not null default false,
  add column if not exists recapture_reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists reconstructed_text text,
  add column if not exists reconstruction_confidence numeric(5,2) not null default 0 check (reconstruction_confidence >= 0 and reconstruction_confidence <= 100),
  add column if not exists reconstruction_basis jsonb not null default '[]'::jsonb;

create table if not exists public.supplier_document_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  supplier_id uuid references public.supplier_master(id) on delete cascade,
  template_code text not null,
  template_name text not null,
  document_type text not null default 'INVOICE',
  sample_count integer not null default 0 check (sample_count >= 0),
  header_aliases jsonb not null default '{}'::jsonb,
  column_layout jsonb not null default '{}'::jsonb,
  anchor_words jsonb not null default '[]'::jsonb,
  expected_fields jsonb not null default '{}'::jsonb,
  quality_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_id, template_code)
);

create table if not exists public.ocr_failure_case (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  ocr_document_id uuid not null references public.ocr_document(id) on delete cascade,
  ocr_line_item_id uuid references public.ocr_line_item(id) on delete set null,
  supplier_id uuid references public.supplier_master(id) on delete set null,
  template_id uuid references public.supplier_document_template(id) on delete set null,
  failure_type text not null default 'UNKNOWN',
  raw_text text not null default '',
  expected_text text,
  provider_name text not null default '',
  provider_confidence numeric(5,2) not null default 0 check (provider_confidence >= 0 and provider_confidence <= 100),
  quality_grade text not null default 'E',
  failure_reason_codes jsonb not null default '[]'::jsonb,
  image_region_path text,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'IGNORED')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.ocr_correction_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  failure_case_id uuid not null references public.ocr_failure_case(id) on delete cascade,
  before_text text not null,
  after_text text not null,
  selected_dictionary_id uuid references public.product_dictionary(id) on delete set null,
  correction_type text not null default 'MANUAL_CORRECTION',
  corrected_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ocr_pattern_learning (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  supplier_id uuid references public.supplier_master(id) on delete set null,
  template_id uuid references public.supplier_document_template(id) on delete set null,
  pattern_type text not null,
  source_pattern text not null,
  target_pattern text not null,
  sample_count integer not null default 0 check (sample_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_document_template_tenant_id_supplier_id_idx on public.supplier_document_template (tenant_id, supplier_id, template_code);
create index if not exists ocr_failure_case_tenant_id_failure_type_idx on public.ocr_failure_case (tenant_id, failure_type, created_at desc);
create index if not exists ocr_failure_case_tenant_id_status_idx on public.ocr_failure_case (tenant_id, status, created_at desc);
create index if not exists ocr_correction_history_tenant_id_failure_case_id_idx on public.ocr_correction_history (tenant_id, failure_case_id, created_at desc);
create index if not exists ocr_pattern_learning_tenant_id_supplier_id_idx on public.ocr_pattern_learning (tenant_id, supplier_id, updated_at desc);
create index if not exists ocr_pattern_learning_tenant_id_template_id_idx on public.ocr_pattern_learning (tenant_id, template_id, updated_at desc);

drop trigger if exists set_updated_at_supplier_document_template on public.supplier_document_template;
create trigger set_updated_at_supplier_document_template
before update on public.supplier_document_template
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_failure_case on public.ocr_failure_case;
create trigger set_updated_at_ocr_failure_case
before update on public.ocr_failure_case
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_correction_history on public.ocr_correction_history;
create trigger set_updated_at_ocr_correction_history
before update on public.ocr_correction_history
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_pattern_learning on public.ocr_pattern_learning;
create trigger set_updated_at_ocr_pattern_learning
before update on public.ocr_pattern_learning
for each row execute function public.set_updated_at();
