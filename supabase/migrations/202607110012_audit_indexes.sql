-- Impact: audit log plus core search indexes for the first migration wave.
create table if not exists public.audit_event (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action_type text not null check (action_type in ('CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'LINK', 'UNLINK', 'ACTIVATE', 'DEACTIVATE', 'POST')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid,
  reason text,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_dictionary_search_idx on public.product_dictionary using gin (standard_name gin_trgm_ops);
create index if not exists product_master_search_idx on public.product_master using gin (product_name gin_trgm_ops);
create index if not exists product_alias_search_idx on public.product_alias using gin (normalized_name gin_trgm_ops);
create index if not exists supplier_alias_search_idx on public.supplier_alias using gin (normalized_name gin_trgm_ops);
create index if not exists review_queue_status_created_idx on public.review_queue(status, created_at);
create index if not exists import_queue_status_created_idx on public.import_queue(queue_status, created_at);
create index if not exists audit_event_entity_created_idx on public.audit_event(entity_type, entity_id, created_at);

drop trigger if exists set_updated_at_audit_event on public.audit_event;

create trigger set_updated_at_audit_event
before update on public.audit_event
for each row execute function public.set_updated_at();
