-- Impact: supplier master linked to source registry; suppliers are still independent of Product Master.
create table if not exists public.supplier_master (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  supplier_name text not null,
  business_no text,
  representative_name text,
  phone text,
  address text,
  source_id uuid references public.source_registry(id) on delete set null,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_master_source_id_idx on public.supplier_master(source_id);

drop trigger if exists set_updated_at_supplier_master on public.supplier_master;

create trigger set_updated_at_supplier_master
before update on public.supplier_master
for each row execute function public.set_updated_at();
