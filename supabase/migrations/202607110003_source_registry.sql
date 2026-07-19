-- Impact: source registry and supplier intake foundation. No Auth/RLS changes.
create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  source_code text not null unique,
  source_name text not null,
  source_type text not null check (source_type in ('government', 'association', 'journal', 'distributor', 'supplier', 'butcher_shop', 'unknown')),
  organization_name text not null,
  authority_level text not null check (authority_level in ('L1', 'L2', 'L3', 'L4', 'L5', 'L6')),
  source_url text,
  description text,
  collected_at timestamptz,
  collector_name text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at_source_registry on public.source_registry;

create trigger set_updated_at_source_registry
before update on public.source_registry
for each row execute function public.set_updated_at();
