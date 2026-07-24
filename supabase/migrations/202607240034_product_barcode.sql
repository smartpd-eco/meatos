-- =====================================================================
-- 바코드 → 품목 매핑 (전자저울 라벨/상품 바코드 스캔 자동 출고용)
-- 스캔 순간 이 매핑으로 품목을 찾아 재고 OUT + 매출 자동 기록.
-- 데이터 변경 없음. RLS off·anon 접근(기존과 동일).
-- =====================================================================

create table if not exists public.product_barcode (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid,
  store_id uuid,
  barcode_key text not null,          -- 매핑 키(품목코드 부분 또는 전체 바코드)
  raw_product_name text not null,     -- inventory_movement.raw_product_name 과 매칭
  unit text default 'kg',
  default_price numeric,              -- 단가(원). 무게 미인식 시 금액 계산 참고
  weigh_type text default 'MANUAL',   -- MANUAL(무게 직접) / PRICE_EMBED(가격내장) / WEIGHT_EMBED(중량내장) / FIXED(개당)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, barcode_key)
);
create index if not exists product_barcode_tenant_idx on public.product_barcode (tenant_id, barcode_key);
alter table public.product_barcode disable row level security;
grant all on public.product_barcode to anon, authenticated;

-- 검증: select * from public.product_barcode;
-- =====================================================================
