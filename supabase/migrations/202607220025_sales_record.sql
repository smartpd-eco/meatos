-- 매출(판매) 기록 테이블
create table if not exists public.sales_record (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sale_date date not null default current_date,
  item_name text not null,
  quantity numeric,
  unit_price numeric,
  amount numeric not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_record_tenant_date
  on public.sales_record (tenant_id, sale_date desc);

-- anon(publishable) 접근 허용을 위해 RLS 비활성화 (기존 테이블과 동일 정책)
alter table public.sales_record disable row level security;
