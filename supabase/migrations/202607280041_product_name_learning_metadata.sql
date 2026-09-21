-- Impact: preserve approved category/cut metadata for product-name learning
-- without replacing or deleting existing learning rows.

alter table if exists public.ocr_pattern_learning
  add column if not exists match_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.ocr_pattern_learning
  add column if not exists approval_source text;

alter table if exists public.ocr_pattern_learning
  add column if not exists approved_at timestamptz;

create index if not exists ocr_pattern_learning_exact_lookup_idx
  on public.ocr_pattern_learning (
    tenant_id,
    supplier_id,
    pattern_type,
    lower(source_pattern)
  )
  where is_active = true;

create index if not exists ocr_pattern_learning_match_metadata_idx
  on public.ocr_pattern_learning using gin (match_metadata);
