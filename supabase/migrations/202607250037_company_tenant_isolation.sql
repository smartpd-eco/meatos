-- =====================================================================
-- 회사별 데이터 격리 — 기업전환(사업장 연동) 시 회사 = 독립 테넌트(빈 DB)로 시작.
-- 일반/체험 회원(member_status != APPROVED)은 데모 테넌트를 그대로 사용(테스트 데이터 유지).
-- company.id 를 tenant_master 에도 등록해 tenant_id FK를 충족(무결성).
-- =====================================================================

-- 회사를 유효한 테넌트로 등록(있으면 무시)
create or replace function public.ensure_company_tenant(p_company_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.tenant_master (id, tenant_code, tenant_name)
  values (p_company_id, 'C-' || replace(p_company_id::text, '-', ''), coalesce(nullif(p_name, ''), '정육점'))
  on conflict (id) do nothing;
end $$;
grant execute on function public.ensure_company_tenant(uuid, text) to anon, authenticated;

-- 회원가입 시: 회사+테넌트+기본매장+계정 생성. 계정은 SOCIAL_VERIFIED(체험) 상태로 시작.
create or replace function public.signup_company_account(
  p_auth_user_id uuid, p_email text, p_name text, p_company_name text
) returns public.account language plpgsql as $$
declare v_company_id uuid; v_store_id uuid; v_acct public.account;
begin
  select * into v_acct from public.account where auth_user_id = p_auth_user_id;
  if found then return v_acct; end if;

  insert into public.company (name) values (coalesce(nullif(p_company_name, ''), '내 정육점'))
    returning id into v_company_id;
  perform public.ensure_company_tenant(v_company_id, p_company_name);
  insert into public.store (company_id, name, is_default) values (v_company_id, '기본매장', true)
    returning id into v_store_id;
  insert into public.account (auth_user_id, company_id, store_id, email, name, role, status, member_status)
    values (p_auth_user_id, v_company_id, v_store_id, p_email, p_name, 'OWNER', 'active', 'SOCIAL_VERIFIED')
    returning * into v_acct;
  return v_acct;
end $$;
grant execute on function public.signup_company_account(uuid, text, text, text) to anon, authenticated;

-- 검증:
--   select id, member_status, company_id from public.account order by created_at desc limit 5;
--   select id, tenant_name from public.tenant_master order by created_at desc limit 5;
-- =====================================================================
