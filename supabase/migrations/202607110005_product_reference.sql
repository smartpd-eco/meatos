-- Impact: shared reference tables for species, category tree, and attribute vocabulary.
create table if not exists public.product_species (
  id uuid primary key default gen_random_uuid(),
  species_code text not null unique,
  species_name text not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_category (
  id uuid primary key default gen_random_uuid(),
  category_code text not null unique,
  category_name text not null,
  parent_id uuid references public.product_category(id) on delete set null,
  depth integer not null check (depth >= 1),
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_attribute_value (
  id uuid primary key default gen_random_uuid(),
  attribute_type text not null check (attribute_type in ('SPECIES', 'CATEGORY', 'PART', 'PROCESSING', 'SKIN', 'BONE', 'STORAGE', 'ORIGIN', 'GRADE', 'UNIT', 'BRAND')),
  attribute_code text not null,
  attribute_name text not null,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attribute_type, attribute_code)
);

create index if not exists product_category_parent_id_idx on public.product_category(parent_id);
create index if not exists product_attribute_value_type_name_idx on public.product_attribute_value(attribute_type, attribute_name);

drop trigger if exists set_updated_at_product_species on public.product_species;

create trigger set_updated_at_product_species
before update on public.product_species
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_product_category on public.product_category;

create trigger set_updated_at_product_category
before update on public.product_category
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_product_attribute_value on public.product_attribute_value;

create trigger set_updated_at_product_attribute_value
before update on public.product_attribute_value
for each row execute function public.set_updated_at();
