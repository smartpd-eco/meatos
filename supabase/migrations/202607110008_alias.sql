-- Impact: separates shared product alias and supplier-specific alias learning.
create table if not exists public.product_alias (
  id uuid primary key default gen_random_uuid(),
  dictionary_id uuid not null references public.product_dictionary(id) on delete cascade,
  raw_name text not null,
  normalized_name text not null,
  source_id uuid references public.source_registry(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  use_count integer not null default 0 check (use_count >= 0),
  verified boolean not null default false,
  last_used_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dictionary_id, normalized_name)
);

create table if not exists public.supplier_alias (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_master(id) on delete cascade,
  dictionary_id uuid not null references public.product_dictionary(id) on delete cascade,
  raw_name text not null,
  normalized_name text not null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  learning_count integer not null default 0 check (learning_count >= 0),
  verified boolean not null default false,
  auto_apply boolean not null default false,
  last_used_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id, normalized_name)
);

create index if not exists product_alias_normalized_name_idx on public.product_alias(normalized_name);
create index if not exists supplier_alias_supplier_id_normalized_name_idx on public.supplier_alias(supplier_id, normalized_name);

drop trigger if exists set_updated_at_product_alias on public.product_alias;

create trigger set_updated_at_product_alias
before update on public.product_alias
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supplier_alias on public.supplier_alias;

create trigger set_updated_at_supplier_alias
before update on public.supplier_alias
for each row execute function public.set_updated_at();
