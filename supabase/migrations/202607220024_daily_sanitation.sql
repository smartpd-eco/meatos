-- Impact: daily sanitation / work log (정육일지). Checklist sections stored as
-- jsonb; RLS off to match schema so the app (anon) can read/write.

create table if not exists public.daily_sanitation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  work_date date not null,
  worker_name text,
  work_shift text,
  check_personal jsonb,
  check_equipment jsonb,
  check_refrigerator jsonb,
  fridge_temp numeric(5,1),
  freezer_temp numeric(5,1),
  check_inventory jsonb,
  check_store jsonb,
  check_sale jsonb,
  ai_snapshot jsonb,
  memo text,
  signature jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_sanitation_logs disable row level security;

create index if not exists dsl_tenant_date_idx on public.daily_sanitation_logs (tenant_id, work_date desc);
