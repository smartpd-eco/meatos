-- Impact: add inventory ledger table for stock in/out movements (매입/판매/조정).
-- Records every stock movement so on-hand quantity = sum(IN) - sum(OUT) per product.
-- Follows existing conventions: tenant_id not null, is_active, timestamps, checks.

create table if not exists public.inventory_movement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  movement_type text not null default 'IN' check (movement_type in ('IN', 'OUT', 'ADJUST')),
  product_master_id uuid references public.product_master(id) on delete set null,
  raw_product_name text not null,
  origin text,
  unit text,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  unit_price numeric(18,2) check (unit_price >= 0),
  amount numeric(18,2) check (amount >= 0),
  trace_no text,
  supplier_name text,
  ocr_document_id uuid references public.ocr_document(id) on delete set null,
  ocr_line_no integer check (ocr_line_no >= 1),
  movement_date date,
  memo text,
  created_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_movement_tenant_date_idx
  on public.inventory_movement (tenant_id, movement_date desc);
create index if not exists inventory_movement_tenant_product_idx
  on public.inventory_movement (tenant_id, raw_product_name);
create index if not exists inventory_movement_document_idx
  on public.inventory_movement (ocr_document_id);

-- Current on-hand balance per product (IN adds, OUT subtracts).
create or replace view public.inventory_balance as
select
  tenant_id,
  raw_product_name,
  origin,
  sum(case when movement_type = 'OUT' then -quantity else quantity end) as on_hand_qty,
  sum(case when movement_type = 'OUT' then -amount else amount end) as net_amount,
  count(*) as movement_count,
  max(movement_date) as last_movement_date
from public.inventory_movement
where is_active = true
group by tenant_id, raw_product_name, origin;
