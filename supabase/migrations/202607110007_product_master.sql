-- Impact: operational product SKU table, always linked to approved dictionary records.
create table if not exists public.product_master (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  product_name text not null,
  dictionary_id uuid not null references public.product_dictionary(id) on delete restrict,
  supplier_id uuid references public.supplier_master(id) on delete set null,
  brand_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  default_unit_attribute_id uuid not null references public.product_attribute_value(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
  version_no integer not null default 1 check (version_no >= 1),
  effective_from date,
  effective_to date,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_master_product_name_idx on public.product_master(product_name);
create index if not exists product_master_dictionary_id_idx on public.product_master(dictionary_id);

drop trigger if exists set_updated_at_product_master on public.product_master;

create trigger set_updated_at_product_master
before update on public.product_master
for each row execute function public.set_updated_at();
