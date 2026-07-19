-- Impact: import batch, source rows, and import queue for raw data preservation.
create table if not exists public.import_batch (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  source_id uuid not null references public.source_registry(id) on delete restrict,
  supplier_id uuid references public.supplier_master(id) on delete set null,
  file_name text not null,
  file_hash text not null,
  total_rows integer not null default 0 check (total_rows >= 0),
  success_rows integer not null default 0 check (success_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'VALIDATING', 'IMPORTED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_source_row (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batch(id) on delete cascade,
  row_no integer not null check (row_no >= 1),
  raw_payload jsonb not null,
  raw_product_name text,
  raw_specification text,
  raw_quantity numeric(18,3) check (raw_quantity >= 0),
  raw_unit text,
  raw_origin text,
  raw_grade text,
  raw_amount numeric(18,2) check (raw_amount >= 0),
  row_hash text not null,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, row_no)
);

create table if not exists public.import_queue (
  id uuid primary key default gen_random_uuid(),
  source_row_id uuid not null references public.product_source_row(id) on delete cascade,
  queue_status text not null default 'NEW' check (queue_status in ('NEW', 'REVIEW', 'APPROVED', 'REJECTED', 'ON_HOLD', 'DICTIONARY_LINKED', 'MASTER_LINKED')),
  dictionary_candidate_id uuid references public.product_dictionary(id) on delete set null,
  product_master_id uuid references public.product_master(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  validation_result jsonb,
  assigned_to uuid,
  reviewed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_source_row_batch_id_idx on public.product_source_row(batch_id);
create index if not exists import_batch_file_hash_idx on public.import_batch(file_hash);
create index if not exists import_queue_status_created_at_idx on public.import_queue(queue_status, created_at);

drop trigger if exists set_updated_at_import_batch on public.import_batch;

create trigger set_updated_at_import_batch
before update on public.import_batch
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_product_source_row on public.product_source_row;

create trigger set_updated_at_product_source_row
before update on public.product_source_row
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_import_queue on public.import_queue;

create trigger set_updated_at_import_queue
before update on public.import_queue
for each row execute function public.set_updated_at();
