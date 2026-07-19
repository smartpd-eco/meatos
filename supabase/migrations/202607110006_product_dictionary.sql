-- Impact: product dictionary holds approved or pending canonical knowledge only.
create table if not exists public.product_dictionary (
  id uuid primary key default gen_random_uuid(),
  dictionary_code text not null unique,
  standard_name text not null,
  species_id uuid references public.product_species(id) on delete set null,
  category_id uuid references public.product_category(id) on delete set null,
  part_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  processing_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  skin_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  bone_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  storage_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  origin_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  grade_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  unit_attribute_id uuid references public.product_attribute_value(id) on delete set null,
  confidence numeric(5,2) not null default 0 check (confidence >= 0 and confidence <= 100),
  source_count integer not null default 0 check (source_count >= 0),
  alias_count integer not null default 0 check (alias_count >= 0),
  review_status text not null default 'PENDING' check (review_status in ('PENDING', 'REVIEW', 'APPROVED', 'REJECTED')),
  version_no integer not null default 1 check (version_no >= 1),
  effective_from date,
  effective_to date,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_dictionary_standard_name_idx on public.product_dictionary(standard_name);
create index if not exists product_dictionary_species_category_idx on public.product_dictionary(species_id, category_id);

drop trigger if exists set_updated_at_product_dictionary on public.product_dictionary;

create trigger set_updated_at_product_dictionary
before update on public.product_dictionary
for each row execute function public.set_updated_at();
