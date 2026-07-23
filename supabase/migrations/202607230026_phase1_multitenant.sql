-- =====================================================================
-- Enterprise DB v2.1 · Phase 0~1 — 2단계 멀티테넌트 도입 (무중단·역호환)
-- 원칙: 기존 컬럼/데이터 삭제 없음. tenant_id 유지. company/store 덧붙이기.
--       company.id = tenant_master.id (동일 UUID) → company_id = tenant_id.
--       BEFORE INSERT 트리거로 신규 행 자동 채움 → 앱 코드 무변경.
--       OCR 인식 파이프라인과 무관 (정확도·속도 영향 없음).
-- 재실행 안전(idempotent). 명시적 구문(동적 SQL 미사용).
-- =====================================================================

-- ── Phase 0: 조직 계층 ────────────────────────────────────────────────
create table if not exists public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  biz_no text,
  plan_code text not null default 'STANDARD',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company disable row level security;

create table if not exists public.store (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text not null,
  addr text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_company_idx on public.store (company_id);
alter table public.store disable row level security;

-- 기존 tenant_master → company (같은 id 재사용)
insert into public.company (id, name, biz_no)
select t.id, coalesce(t.tenant_name, '기본회사'), t.business_no
from public.tenant_master t
on conflict (id) do nothing;

-- 회사별 기본 매장 1개 보장
insert into public.store (company_id, name, is_default)
select c.id, '기본매장', true
from public.company c
where not exists (select 1 from public.store s where s.company_id = c.id);

-- ── 공통 자동 채움 함수 (신규 insert 시 company_id/store_id 보정) ──────
create or replace function public.fill_company_store()
returns trigger language plpgsql as $$
begin
  if new.company_id is null then
    new.company_id := new.tenant_id;
  end if;
  if new.store_id is null and new.company_id is not null then
    select s.id into new.store_id
    from public.store s
    where s.company_id = new.company_id and s.is_default
    order by s.created_at limit 1;
  end if;
  return new;
end;
$$;

-- ── Phase 1: 운영 테이블별 company_id/store_id 덧붙이기 + 백필 + 트리거 ──

-- 1) ocr_document
alter table public.ocr_document add column if not exists company_id uuid;
alter table public.ocr_document add column if not exists store_id uuid;
update public.ocr_document set company_id = tenant_id where company_id is null;
update public.ocr_document x set store_id = s.id
  from public.store s
  where x.store_id is null and s.company_id = x.company_id and s.is_default;
create index if not exists ocr_document_company_created_idx
  on public.ocr_document (company_id, created_at desc);
drop trigger if exists trg_fill_cs on public.ocr_document;
create trigger trg_fill_cs before insert on public.ocr_document
  for each row execute function public.fill_company_store();

-- 2) inventory_movement
alter table public.inventory_movement add column if not exists company_id uuid;
alter table public.inventory_movement add column if not exists store_id uuid;
update public.inventory_movement set company_id = tenant_id where company_id is null;
update public.inventory_movement x set store_id = s.id
  from public.store s
  where x.store_id is null and s.company_id = x.company_id and s.is_default;
create index if not exists inventory_movement_company_created_idx
  on public.inventory_movement (company_id, created_at desc);
create index if not exists inventory_movement_store_date_idx
  on public.inventory_movement (company_id, store_id, movement_date desc);
drop trigger if exists trg_fill_cs on public.inventory_movement;
create trigger trg_fill_cs before insert on public.inventory_movement
  for each row execute function public.fill_company_store();

-- 3) sales_record
alter table public.sales_record add column if not exists company_id uuid;
alter table public.sales_record add column if not exists store_id uuid;
update public.sales_record set company_id = tenant_id where company_id is null;
update public.sales_record x set store_id = s.id
  from public.store s
  where x.store_id is null and s.company_id = x.company_id and s.is_default;
create index if not exists sales_record_company_created_idx
  on public.sales_record (company_id, created_at desc);
create index if not exists sales_record_store_date_idx
  on public.sales_record (company_id, store_id, sale_date desc);
drop trigger if exists trg_fill_cs on public.sales_record;
create trigger trg_fill_cs before insert on public.sales_record
  for each row execute function public.fill_company_store();

-- 4) daily_sanitation_logs
alter table public.daily_sanitation_logs add column if not exists company_id uuid;
alter table public.daily_sanitation_logs add column if not exists store_id uuid;
update public.daily_sanitation_logs set company_id = tenant_id where company_id is null;
update public.daily_sanitation_logs x set store_id = s.id
  from public.store s
  where x.store_id is null and s.company_id = x.company_id and s.is_default;
create index if not exists daily_sanitation_logs_company_created_idx
  on public.daily_sanitation_logs (company_id, created_at desc);
drop trigger if exists trg_fill_cs on public.daily_sanitation_logs;
create trigger trg_fill_cs before insert on public.daily_sanitation_logs
  for each row execute function public.fill_company_store();

-- 5) expiry_policy
alter table public.expiry_policy add column if not exists company_id uuid;
alter table public.expiry_policy add column if not exists store_id uuid;
update public.expiry_policy set company_id = tenant_id where company_id is null;
update public.expiry_policy x set store_id = s.id
  from public.store s
  where x.store_id is null and s.company_id = x.company_id and s.is_default;
create index if not exists expiry_policy_company_created_idx
  on public.expiry_policy (company_id, created_at desc);
drop trigger if exists trg_fill_cs on public.expiry_policy;
create trigger trg_fill_cs before insert on public.expiry_policy
  for each row execute function public.fill_company_store();

-- =====================================================================
-- 검증(실행 후 확인):
--   select count(*) from public.company;                                  -- 1 이상
--   select count(*) from public.store;                                    -- 1 이상
--   select count(*) filter (where company_id is null) as null_company
--     from public.inventory_movement;                                     -- 0
-- =====================================================================
