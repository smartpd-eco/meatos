-- Impact: review queue and append-only learning history for manual approval flows.
create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  review_type text not null check (review_type in ('SOURCE_ROW', 'OCR_LINE_ITEM', 'MANUAL_REVIEW', 'DUPLICATE_CHECK')),
  source_row_id uuid references public.product_source_row(id) on delete set null,
  ocr_line_item_id uuid,
  suggested_dictionary_id uuid references public.product_dictionary(id) on delete set null,
  selected_dictionary_id uuid references public.product_dictionary(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  reason_codes jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED')),
  reviewer_id uuid,
  review_note text,
  reviewed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_history (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier_master(id) on delete set null,
  raw_name text not null,
  normalized_name text not null,
  dictionary_id uuid not null references public.product_dictionary(id) on delete restrict,
  source_type text not null check (source_type in ('OCR', 'MANUAL', 'IMPORT', 'POS', 'GLOBAL')),
  previous_confidence numeric(5,2) not null default 0 check (previous_confidence >= 0 and previous_confidence <= 100),
  new_confidence numeric(5,2) not null default 0 check (new_confidence >= 0 and new_confidence <= 100),
  learning_count integer not null default 1 check (learning_count >= 1),
  decision_type text not null check (decision_type in ('MANUAL_APPROVAL', 'MANUAL_CORRECTION', 'REPEATED_MATCH', 'GLOBAL_CANDIDATE')),
  review_id uuid references public.review_queue(id) on delete set null,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_queue_status_created_at_idx on public.review_queue(status, created_at);
create index if not exists learning_history_supplier_id_raw_name_idx on public.learning_history(supplier_id, raw_name);

drop trigger if exists set_updated_at_review_queue on public.review_queue;

create trigger set_updated_at_review_queue
before update on public.review_queue
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_learning_history on public.learning_history;

create trigger set_updated_at_learning_history
before update on public.learning_history
for each row execute function public.set_updated_at();
