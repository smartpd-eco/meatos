-- Impact: add OCR product candidate table for Dictionary/Alias routing and Unknown learning.

create table if not exists public.ocr_product_candidate (
  id uuid primary key default gen_random_uuid(),
  ocr_document_id uuid not null references public.ocr_document(id) on delete cascade,
  line_no integer not null check (line_no >= 1),
  raw_name text not null,
  normalized_name text not null,
  dictionary_id uuid references public.product_dictionary(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  status text not null default 'REVIEW_REQUIRED' check (status in ('AUTO_APPROVED', 'REVIEW_REQUIRED', 'USER_SELECT', 'UNKNOWN')),
  match_strategy text not null default 'SIMILARITY' check (match_strategy in ('EXACT', 'ALIAS', 'COMPACT', 'SYMBOL_STRIP', 'PARTIAL', 'SIMILARITY', 'UNKNOWN')),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ocr_document_id, line_no, dictionary_id)
);

create index if not exists idx_ocr_product_candidate_document_line_no
  on public.ocr_product_candidate (ocr_document_id, line_no);

create index if not exists idx_ocr_product_candidate_status_created_at
  on public.ocr_product_candidate (status, created_at desc);

create index if not exists idx_ocr_product_candidate_dictionary_id
  on public.ocr_product_candidate (dictionary_id);

create index if not exists idx_ocr_product_candidate_raw_name_trgm
  on public.ocr_product_candidate using gin (raw_name gin_trgm_ops);

create or replace function public.set_updated_at_ocr_product_candidate()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_set_updated_at_ocr_product_candidate on public.ocr_product_candidate;

create trigger trigger_set_updated_at_ocr_product_candidate
before update on public.ocr_product_candidate
for each row
execute procedure public.set_updated_at_ocr_product_candidate();
