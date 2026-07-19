-- Impact: OCR provider registry, OCR documents, line items, and processing history.
create table if not exists public.ocr_provider_registry (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null unique,
  provider_name text not null,
  provider_type text not null check (provider_type in ('PRIMARY', 'FALLBACK', 'PARSER', 'MOCK')),
  priority integer not null default 1 check (priority >= 1),
  is_enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ocr_document (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  source_id uuid references public.source_registry(id) on delete set null,
  supplier_id uuid references public.supplier_master(id) on delete set null,
  original_file_path text not null,
  original_file_hash text not null,
  file_name text not null,
  mime_type text not null,
  document_status text not null default 'CAPTURED' check (document_status in ('CAPTURED', 'UPLOADED', 'OCR_PENDING', 'OCR_COMPLETED', 'PARSE_COMPLETED', 'REVIEW_REQUIRED', 'APPROVED', 'POSTED', 'OCR_FAILED', 'PARSE_FAILED')),
  ocr_provider_id uuid references public.ocr_provider_registry(id) on delete set null,
  ocr_raw_json jsonb,
  parsed_json jsonb,
  meatos_score numeric(5,2) not null default 0 check (meatos_score >= 0 and meatos_score <= 100),
  provider_confidence numeric(5,2) not null default 0 check (provider_confidence >= 0 and provider_confidence <= 100),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  invoice_date date,
  total_amount numeric(18,2) check (total_amount >= 0),
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ocr_line_item (
  id uuid primary key default gen_random_uuid(),
  ocr_document_id uuid not null references public.ocr_document(id) on delete cascade,
  line_no integer not null check (line_no >= 1),
  raw_product_name text not null,
  raw_specification text,
  raw_quantity numeric(18,3) check (raw_quantity >= 0),
  raw_unit text,
  raw_unit_price numeric(18,2) check (raw_unit_price >= 0),
  raw_amount numeric(18,2) check (raw_amount >= 0),
  raw_origin text,
  raw_grade text,
  dictionary_candidate_id uuid references public.product_dictionary(id) on delete set null,
  selected_dictionary_id uuid references public.product_dictionary(id) on delete set null,
  product_master_id uuid references public.product_master(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  review_status text not null default 'PENDING' check (review_status in ('PENDING', 'SELECTED', 'APPROVED', 'REJECTED')),
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ocr_document_id, line_no)
);

create table if not exists public.ocr_processing_history (
  id uuid primary key default gen_random_uuid(),
  ocr_document_id uuid not null references public.ocr_document(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  provider_id uuid references public.ocr_provider_registry(id) on delete set null,
  result_code text,
  result_message text,
  processing_ms integer not null default 0 check (processing_ms >= 0),
  retry_no integer not null default 0 check (retry_no >= 0),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ocr_document_status_created_at_idx on public.ocr_document(document_status, created_at);
create index if not exists ocr_document_original_file_hash_idx on public.ocr_document(original_file_hash);
create index if not exists ocr_line_item_ocr_document_id_idx on public.ocr_line_item(ocr_document_id);
create index if not exists ocr_processing_history_ocr_document_id_idx on public.ocr_processing_history(ocr_document_id);

drop trigger if exists set_updated_at_ocr_provider_registry on public.ocr_provider_registry;

create trigger set_updated_at_ocr_provider_registry
before update on public.ocr_provider_registry
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_document on public.ocr_document;

create trigger set_updated_at_ocr_document
before update on public.ocr_document
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_line_item on public.ocr_line_item;

create trigger set_updated_at_ocr_line_item
before update on public.ocr_line_item
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_ocr_processing_history on public.ocr_processing_history;

create trigger set_updated_at_ocr_processing_history
before update on public.ocr_processing_history
for each row execute function public.set_updated_at();
