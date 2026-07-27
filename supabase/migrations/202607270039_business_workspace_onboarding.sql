-- =====================================================================
-- 사업자 인증 후 최초 회사 공간 연결 보완
-- - auth.uid()를 유일한 사용자 기준으로 사용한다.
-- - 회사가 없는 account 또는 account 자체가 없는 최초 사용자를 지원한다.
-- - 사업자번호는 숫자 10자리로 정규화하고 기존 회사 중복 생성을 차단한다.
-- - company/store/account/business_verification 변경을 한 트랜잭션에서 처리한다.
-- - tenant_user는 기존 sync_account_tenant_membership_trigger가 OWNER 멤버십으로 동기화한다.
-- =====================================================================

create or replace function public.activate_own_business_tenant(
  p_business_number text,
  p_business_name text,
  p_representative_name text,
  p_business_address text default null,
  p_license_type text default null,
  p_license_number text default null
) returns public.account
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_business_number text;
  current_account public.account;
  matched_company public.company;
  target_company_id uuid;
  target_store_id uuid;
  jwt_claims jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  normalized_business_number :=
    regexp_replace(coalesce(p_business_number, ''), '\D', '', 'g');
  if normalized_business_number !~ '^[0-9]{10}$' then
    raise exception 'INVALID_BUSINESS_NUMBER';
  end if;

  -- 동일 사업자번호의 동시 온보딩 요청을 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(normalized_business_number, 0));

  select *
    into current_account
    from public.account
   where auth_user_id = auth.uid()
   for update;

  select c.*
    into matched_company
    from public.company c
   where regexp_replace(coalesce(c.biz_no, ''), '\D', '', 'g')
         = normalized_business_number
   order by c.created_at
   limit 1
   for update;

  if found
     and (current_account.id is null
          or current_account.company_id is distinct from matched_company.id) then
    raise exception 'BUSINESS_ALREADY_REGISTERED';
  end if;

  if current_account.company_id is not null then
    target_company_id := current_account.company_id;
  elsif matched_company.id is not null then
    -- 위 중복 분기 때문에 현재 사용자 소유 회사인 경우에만 도달한다.
    target_company_id := matched_company.id;
  else
    insert into public.company (name, biz_no)
    values (
      coalesce(nullif(trim(p_business_name), ''), '정육비서 기업'),
      normalized_business_number
    )
    returning id into target_company_id;
  end if;

  update public.company
     set name = coalesce(nullif(trim(p_business_name), ''), name),
         biz_no = normalized_business_number,
         updated_at = now()
   where id = target_company_id;

  perform public.ensure_company_tenant(target_company_id, p_business_name);

  select s.id
    into target_store_id
    from public.store s
   where s.company_id = target_company_id
     and s.is_default
     and s.is_active
   order by s.created_at
   limit 1
   for update;

  if target_store_id is null then
    insert into public.store (company_id, name, addr, is_default, is_active)
    values (target_company_id, '기본매장', p_business_address, true, true)
    returning id into target_store_id;
  elsif nullif(trim(coalesce(p_business_address, '')), '') is not null then
    update public.store
       set addr = p_business_address,
           updated_at = now()
     where id = target_store_id
       and nullif(trim(coalesce(addr, '')), '') is null;
  end if;

  if current_account.id is null then
    jwt_claims := coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb;

    insert into public.account (
      auth_user_id, company_id, store_id, email, name,
      role, status, member_status
    ) values (
      auth.uid(), target_company_id, target_store_id,
      nullif(jwt_claims ->> 'email', ''),
      coalesce(nullif(trim(p_representative_name), ''), '대표자'),
      'OWNER', 'active', 'APPROVED'
    )
    returning * into current_account;
  else
    update public.account
       set company_id = target_company_id,
           store_id = coalesce(store_id, target_store_id),
           role = case
             when company_id is null then 'OWNER'
             else role
           end,
           status = 'active',
           member_status = 'APPROVED',
           updated_at = now()
     where id = current_account.id
    returning * into current_account;
  end if;

  insert into public.business_verification (
    applicant_user_id, company_id, business_number, business_name,
    representative_name, business_address, license_type, license_number,
    status, reviewed_at
  )
  select
    auth.uid(), target_company_id, normalized_business_number,
    p_business_name, p_representative_name, p_business_address,
    p_license_type, p_license_number, 'APPROVED', now()
  where not exists (
    select 1
      from public.business_verification bv
     where bv.applicant_user_id = auth.uid()
       and bv.company_id = target_company_id
       and bv.business_number = normalized_business_number
       and bv.status = 'APPROVED'
  );

  return current_account;
end;
$$;

revoke all on function public.activate_own_business_tenant(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.activate_own_business_tenant(text, text, text, text, text, text)
  to authenticated;

comment on function public.activate_own_business_tenant(text, text, text, text, text, text) is
'Atomically links an authenticated user to a verified, normalized business workspace without exposing service-role credentials.';
