-- Impact: tenant foundation for shared multi-tenant operation.

create table if not exists public.tenant_master (
  id uuid primary key default gen_random_uuid(),
  tenant_code text not null unique,
  tenant_name text not null,
  business_no text,
  tenant_type text not null default 'SINGLE' check (tenant_type in ('SINGLE', 'FRANCHISE', 'ENTERPRISE', 'DEMO', 'TRIAL', 'UNKNOWN')),
  plan_code text not null default 'STANDARD',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING')),
  data_location text not null default 'SHARED_KR_01',
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_user (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  user_id uuid not null,
  role_code text not null default 'VIEWER',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED')),
  is_default boolean not null default false,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.tenant_setting (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade unique,
  timezone text not null default 'Asia/Seoul',
  currency text not null default 'KRW',
  ocr_provider_code text not null default 'clova-general',
  auto_apply_threshold numeric(5,2) not null default 95 check (auto_apply_threshold >= 0 and auto_apply_threshold <= 100),
  inventory_method text not null default 'LEDGER',
  data_retention_days integer not null default 365 check (data_retention_days >= 1),
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_routing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade unique,
  deployment_type text not null default 'SHARED' check (deployment_type in ('SHARED', 'DEDICATED', 'MIGRATING')),
  cluster_code text not null default 'SHARED_KR_01',
  project_ref text,
  database_region text not null default 'ap-northeast-2',
  routing_status text not null default 'READY' check (routing_status in ('READY', 'MIGRATING', 'PAUSED', 'ARCHIVED')),
  migrated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_usage_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  usage_date date not null,
  active_users integer not null default 0 check (active_users >= 0),
  api_requests bigint not null default 0 check (api_requests >= 0),
  write_transactions bigint not null default 0 check (write_transactions >= 0),
  ocr_documents bigint not null default 0 check (ocr_documents >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  database_rows bigint not null default 0 check (database_rows >= 0),
  error_count bigint not null default 0 check (error_count >= 0),
  p95_latency_ms numeric(10,2) not null default 0 check (p95_latency_ms >= 0),
  created_by uuid,
  updated_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, usage_date)
);

drop trigger if exists set_updated_at_tenant_master on public.tenant_master;
drop trigger if exists set_updated_at_tenant_user on public.tenant_user;
drop trigger if exists set_updated_at_tenant_setting on public.tenant_setting;
drop trigger if exists set_updated_at_tenant_routing on public.tenant_routing;
drop trigger if exists set_updated_at_tenant_usage_daily on public.tenant_usage_daily;

create trigger set_updated_at_tenant_master
before update on public.tenant_master
for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_user
before update on public.tenant_user
for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_setting
before update on public.tenant_setting
for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_routing
before update on public.tenant_routing
for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_usage_daily
before update on public.tenant_usage_daily
for each row execute function public.set_updated_at();
