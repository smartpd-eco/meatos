-- =====================================================================
-- Enterprise DB v2.1 · Phase 0~1 — 2단계 멀티테넌트 도입 (무중단·역호환)
-- 원칙: 기존 컬럼/데이터 삭제 없음. tenant_id 유지. company/store 덧붙이기.
--       company.id = tenant_master.id (동일 UUID) → company_id = tenant_id.
--       BEFORE INSERT 트리거로 신규 행 자동 채움 → 앱 코드 무변경.
--       OCR 로직·인식 파이프라인과 무관 (정확도·속도 영향 없음).
-- 재실행 안전(idempotent).
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

-- ── Phase 1: 운영 테이블에 company_id/store_id 덧붙이기 + 백필 + 트리거 ──
do $$
declare
  t text;
  tbls text[] := array[
    'ocr_document','inventory_movement','sales_record',
    'daily_sanitation_logs','expiry_policy'
  ];
begin
  foreach t in array tbls loop
    -- 컬럼 추가(nullable 유지: 앱은 아직 tenant_id만 기록)
    execute format('alter table public.%I add column if not exists company_id uuid;', t);
    execute format('alter table public.%I add column if not exists store_id uuid;', t);

    -- 백필: company_id = tenant_id, store_id = 회사 기본매장
    execute format('update public.%I set company_id = tenant_id where company_id is null;', t);
    execute format($f$
      update public.%I x
      set store_id = s.id
      from public.store s
      where x.store_id is null
        and s.company_id = x.company_id and s.is_default;
    $f$, t);

    -- 조회 인덱스(선두 company_id)
    execute format('create index if not exists %I on public.%I (company_id, created_at desc);', t||'_company_created_idx', t);

    -- 신규 insert 자동 채움 트리거
    execute format('drop trigger if exists trg_fill_cs on public.%I;', t);
    execute format('create trigger trg_fill_cs before insert on public.%I for each row execute function public.fill_company_store();', t);
  end loop;
end $$;

-- store_id 조회 보조 인덱스(매장 단위 대시보드 대비)
create index if not exists inventory_movement_store_date_idx on public.inventory_movement (company_id, store_id, movement_date desc);
create index if not exists sales_record_store_date_idx on public.sales_record (company_id, store_id, sale_date desc);

-- =====================================================================
-- 검증 쿼리(수동 확인용):
--   select count(*) filter (where company_id is null) as null_company from public.inventory_movement;
--   select count(*) from public.company;  select count(*) from public.store;
-- 모두 null_company = 0 이어야 정상.
-- =====================================================================
