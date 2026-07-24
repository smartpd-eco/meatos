-- =====================================================================
-- 기업회원 인증 + RBAC (우리 구조 맞춤 · Phase 1) — 무중단·역호환·additive
-- 기존 account(auth_user_id↔company/store, role, status) 를 확장하고,
-- 역할/권한 매트릭스 + 기업인증 신청 + 감사로그 + 초대 테이블을 추가한다.
-- RLS는 프로젝트 정책대로 off(anon). 실제 접근통제(RLS)는 인증 전환 단계에서.
-- =====================================================================

-- account 확장
alter table public.account add column if not exists member_status text not null default 'APPROVED';
  -- SOCIAL_VERIFIED/BUSINESS_REQUIRED/BUSINESS_SUBMITTED/UNDER_REVIEW/SUPPLEMENT_REQUIRED/APPROVED/REJECTED/SUSPENDED/EXPIRED/WITHDRAWN
alter table public.account add column if not exists phone text;
-- 기존 role 값(OWNER/MANAGER/STAFF)은 유지. 신규는 아래 role code 사용.

-- 역할/권한 정의
create table if not exists public.role (
  code text primary key, name text not null, sort int not null default 0
);
create table if not exists public.permission (
  code text primary key, name text not null
);
create table if not exists public.role_permission (
  role_code text not null references public.role(code) on delete cascade,
  perm_code text not null references public.permission(code) on delete cascade,
  primary key (role_code, perm_code)
);
alter table public.role disable row level security;
alter table public.permission disable row level security;
alter table public.role_permission disable row level security;
grant all on public.role, public.permission, public.role_permission to anon, authenticated;

insert into public.role(code,name,sort) values
 ('COMPANY_OWNER','기업대표관리자',1),('COMPANY_ADMIN','기업관리자',2),('STORE_MANAGER','매장관리자',3),
 ('PURCHASE_MANAGER','구매·매입담당',4),('INVENTORY_MANAGER','재고·창고담당',5),('POS_CASHIER','POS판매담당',6),
 ('ACCOUNTANT','회계·정산담당',7),('AUDITOR','조회·감사',8),('EMPLOYEE','일반직원',9),('READ_ONLY','조회전용',10)
on conflict (code) do nothing;

insert into public.permission(code,name) values
 ('sell.scan','판매 스캔/자동출고'),('connect.manage','자동연동 관리'),('purchase.view','매입 조회'),
 ('invoice.ocr','거래명세서 OCR'),('sales.view','매출 조회'),('stock.view','재고 조회'),
 ('stock.adjust','재고 출고/조정'),('alerts.view','알림 조회'),('settings.view','환경설정'),
 ('sanitation.write','정육일지 작성'),('member.manage','직원·권한 관리'),('company.edit','기업정보 수정'),
 ('verify.submit','기업인증 신청')
on conflict (code) do nothing;

-- 역할-권한 매트릭스
insert into public.role_permission(role_code,perm_code)
select r, p from (values
 -- 대표/관리자: 전체
 ('COMPANY_OWNER','sell.scan'),('COMPANY_OWNER','connect.manage'),('COMPANY_OWNER','purchase.view'),('COMPANY_OWNER','invoice.ocr'),('COMPANY_OWNER','sales.view'),('COMPANY_OWNER','stock.view'),('COMPANY_OWNER','stock.adjust'),('COMPANY_OWNER','alerts.view'),('COMPANY_OWNER','settings.view'),('COMPANY_OWNER','sanitation.write'),('COMPANY_OWNER','member.manage'),('COMPANY_OWNER','company.edit'),('COMPANY_OWNER','verify.submit'),
 ('COMPANY_ADMIN','sell.scan'),('COMPANY_ADMIN','connect.manage'),('COMPANY_ADMIN','purchase.view'),('COMPANY_ADMIN','invoice.ocr'),('COMPANY_ADMIN','sales.view'),('COMPANY_ADMIN','stock.view'),('COMPANY_ADMIN','stock.adjust'),('COMPANY_ADMIN','alerts.view'),('COMPANY_ADMIN','settings.view'),('COMPANY_ADMIN','sanitation.write'),('COMPANY_ADMIN','member.manage'),
 -- 매장관리자
 ('STORE_MANAGER','sell.scan'),('STORE_MANAGER','purchase.view'),('STORE_MANAGER','invoice.ocr'),('STORE_MANAGER','sales.view'),('STORE_MANAGER','stock.view'),('STORE_MANAGER','stock.adjust'),('STORE_MANAGER','alerts.view'),('STORE_MANAGER','sanitation.write'),
 -- 구매/매입
 ('PURCHASE_MANAGER','purchase.view'),('PURCHASE_MANAGER','invoice.ocr'),('PURCHASE_MANAGER','stock.view'),('PURCHASE_MANAGER','alerts.view'),
 -- 재고/창고
 ('INVENTORY_MANAGER','stock.view'),('INVENTORY_MANAGER','stock.adjust'),('INVENTORY_MANAGER','alerts.view'),('INVENTORY_MANAGER','sell.scan'),('INVENTORY_MANAGER','purchase.view'),
 -- POS 판매
 ('POS_CASHIER','sell.scan'),('POS_CASHIER','sales.view'),('POS_CASHIER','stock.view'),
 -- 회계
 ('ACCOUNTANT','sales.view'),('ACCOUNTANT','purchase.view'),('ACCOUNTANT','alerts.view'),
 -- 감사/조회
 ('AUDITOR','purchase.view'),('AUDITOR','sales.view'),('AUDITOR','stock.view'),('AUDITOR','alerts.view'),
 ('READ_ONLY','purchase.view'),('READ_ONLY','sales.view'),('READ_ONLY','stock.view'),('READ_ONLY','alerts.view'),
 -- 일반직원
 ('EMPLOYEE','sell.scan'),('EMPLOYEE','stock.view')
) as m(r,p)
on conflict do nothing;

-- 기업인증 신청
create table if not exists public.business_verification (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid,
  company_id uuid,
  business_number varchar(10) not null,
  business_name text not null,
  representative_name text not null,
  business_address text,
  applicant_type varchar(30) default 'OWNER',   -- OWNER/EMPLOYEE/AGENT
  requested_role varchar(50) default 'COMPANY_OWNER',
  license_type varchar(40),                      -- MEAT_RETAIL/MEAT_PROCESSING_RETAIL/...
  license_number text, license_authority text, license_store_address text,
  status varchar(30) not null default 'BUSINESS_SUBMITTED',
  risk_level varchar(20) default 'LOW',
  rejection_code varchar(50), rejection_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewer_user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists bv_applicant_idx on public.business_verification(applicant_user_id);
create index if not exists bv_bizno_idx on public.business_verification(business_number);
alter table public.business_verification disable row level security;
grant all on public.business_verification to anon, authenticated;

-- 직원 초대
create table if not exists public.user_invitation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, store_id uuid,
  email text, phone text, role_code text default 'EMPLOYEE',
  code text not null, status varchar(20) not null default 'INVITED',  -- INVITED/ACCEPTED/EXPIRED/CANCELLED
  invited_by uuid, expires_at timestamptz default (now() + interval '48 hours'),
  created_at timestamptz not null default now()
);
create index if not exists inv_company_idx on public.user_invitation(company_id);
alter table public.user_invitation disable row level security;
grant all on public.user_invitation to anon, authenticated;

-- 감사로그
create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid, actor_user_id uuid, action text, target text, detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_company_time_idx on public.access_audit_log(company_id, created_at desc);
alter table public.access_audit_log disable row level security;
grant all on public.access_audit_log to anon, authenticated;

-- 권한 헬퍼: 역할 → 권한 목록 (클라이언트/향후 RLS 공용)
create or replace function public.perms_of_role(p_role text)
returns setof text language sql stable as $$
  select perm_code from public.role_permission
  where role_code = case when p_role='OWNER' then 'COMPANY_OWNER'
                         when p_role='MANAGER' then 'STORE_MANAGER'
                         when p_role='STAFF' then 'EMPLOYEE'
                         else p_role end;
$$;
grant execute on function public.perms_of_role(text) to anon, authenticated;

-- 검증: select code,name from public.role order by sort;
--       select * from public.perms_of_role('COMPANY_OWNER');
-- =====================================================================
