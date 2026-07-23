-- =====================================================================
-- 계정/로그인 — Supabase Auth 연동 (account = auth.users ↔ company/store)
-- 회원가입 시: auth 사용자 생성 → company 생성 → account 행 생성.
-- 데이터 변경 없음(신규 테이블). RLS off + anon 접근(프로젝트 정책과 동일).
-- =====================================================================

create table if not exists public.account (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                       -- supabase auth.users.id
  company_id uuid references public.company(id) on delete set null,
  store_id uuid references public.store(id) on delete set null,
  email text,
  name text,                                       -- 담당자명
  role text not null default 'OWNER',              -- OWNER/MANAGER/STAFF
  status text not null default 'active',           -- active/pending/blocked
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists account_auth_idx on public.account (auth_user_id);
create index if not exists account_company_idx on public.account (company_id);
create index if not exists account_email_idx on public.account (email);

alter table public.account disable row level security;
grant all on public.account to anon, authenticated;

-- 회원가입 원자 처리 함수: 회사 + 기본매장 + 계정 생성 (이미 있으면 재사용)
create or replace function public.signup_company_account(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_company_name text
) returns public.account
language plpgsql
as $$
declare
  v_company_id uuid;
  v_store_id uuid;
  v_acct public.account;
begin
  -- 이미 계정이 있으면 반환
  select * into v_acct from public.account where auth_user_id = p_auth_user_id;
  if found then
    return v_acct;
  end if;

  insert into public.company (name) values (coalesce(nullif(p_company_name,''),'내 정육점'))
  returning id into v_company_id;

  insert into public.store (company_id, name, is_default)
  values (v_company_id, '기본매장', true)
  returning id into v_store_id;

  insert into public.account (auth_user_id, company_id, store_id, email, name, role, status)
  values (p_auth_user_id, v_company_id, v_store_id, p_email, p_name, 'OWNER', 'active')
  returning * into v_acct;

  return v_acct;
end $$;

grant execute on function public.signup_company_account(uuid,text,text,text) to anon, authenticated;

-- 검증:
--   select * from public.account;
-- =====================================================================
