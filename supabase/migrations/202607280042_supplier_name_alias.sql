-- Impact: add verified supplier-name aliases so OCR/vendor names such as
-- "(주)좋은축산유통" resolve to the existing "좋은축산" supplier.

create table if not exists public.supplier_name_alias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  supplier_id uuid not null references public.supplier_master(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null,
  confidence numeric(5,2) not null default 100
    check (confidence >= 0 and confidence <= 100),
  verified boolean not null default true,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, normalized_alias)
);

create index if not exists supplier_name_alias_supplier_idx
  on public.supplier_name_alias (tenant_id, supplier_id, is_active);

drop trigger if exists set_updated_at_supplier_name_alias
  on public.supplier_name_alias;
create trigger set_updated_at_supplier_name_alias
before update on public.supplier_name_alias
for each row execute function public.set_updated_at();

alter table public.supplier_name_alias enable row level security;
revoke all on public.supplier_name_alias from anon;
grant select, insert, update, delete on public.supplier_name_alias to authenticated;

drop policy if exists supplier_name_alias_tenant_member_all
  on public.supplier_name_alias;
create policy supplier_name_alias_tenant_member_all
on public.supplier_name_alias for all to authenticated
using (public.tenant_membership_allowed(tenant_id))
with check (public.tenant_membership_allowed(tenant_id));
