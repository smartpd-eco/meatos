-- MEATOS authenticated tenant isolation.
-- This migration is additive: it does not delete business data or enable Auth providers.

alter table public.account
  add column if not exists member_status text not null default 'SOCIAL_VERIFIED',
  add column if not exists phone text;

create table if not exists public.business_verification (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null,
  company_id uuid not null references public.company(id) on delete cascade,
  business_number varchar(10) not null,
  business_name text not null,
  representative_name text not null,
  business_address text,
  applicant_type varchar(30) not null default 'OWNER',
  requested_role varchar(50) not null default 'COMPANY_OWNER',
  license_type varchar(40),
  license_number text,
  status varchar(30) not null default 'APPROVED',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_verification_applicant_idx
  on public.business_verification (applicant_user_id, created_at desc);
create index if not exists business_verification_company_idx
  on public.business_verification (company_id, created_at desc);

create table if not exists public.role (
  code text primary key,
  name text not null,
  sort integer not null default 0
);

create table if not exists public.permission (
  code text primary key,
  name text not null
);

create table if not exists public.role_permission (
  role_code text not null references public.role(code) on delete cascade,
  perm_code text not null references public.permission(code) on delete cascade,
  primary key (role_code, perm_code)
);

insert into public.role (code, name, sort) values
  ('OWNER', '기업 최고 관리자', 1),
  ('ADMIN', '기업 관리자', 2),
  ('MANAGER', '매장 관리자', 3),
  ('OPERATOR', '업무 담당자', 4),
  ('VIEWER', '조회 사용자', 5),
  ('AUDITOR', '감사 사용자', 6)
on conflict (code) do update set name = excluded.name, sort = excluded.sort;

insert into public.permission (code, name) values
  ('tenant.read', '기업 데이터 조회'),
  ('tenant.write', '기업 데이터 등록 및 수정'),
  ('tenant.manage', '기업 구성원 및 설정 관리')
on conflict (code) do update set name = excluded.name;

insert into public.role_permission (role_code, perm_code) values
  ('OWNER', 'tenant.read'), ('OWNER', 'tenant.write'), ('OWNER', 'tenant.manage'),
  ('ADMIN', 'tenant.read'), ('ADMIN', 'tenant.write'), ('ADMIN', 'tenant.manage'),
  ('MANAGER', 'tenant.read'), ('MANAGER', 'tenant.write'),
  ('OPERATOR', 'tenant.read'), ('OPERATOR', 'tenant.write'),
  ('VIEWER', 'tenant.read'),
  ('AUDITOR', 'tenant.read')
on conflict do nothing;

insert into public.tenant_master (
  id, tenant_code, tenant_name, tenant_type, plan_code, status, data_location
) values (
  '881f6cc1-b552-468c-b9b4-152edb464e61',
  'SMARTPD_DEV',
  'MEATOS 체험 공간',
  'DEMO',
  'DEVELOPMENT',
  'ACTIVE',
  'SHARED_KR_01'
)
on conflict (id) do nothing;

create or replace function public.tenant_membership_allowed(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_tenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.tenant_user tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = target_tenant_id
        and tu.status = 'ACTIVE'
        and tu.is_active
    );
$$;

revoke all on function public.tenant_membership_allowed(uuid) from public, anon;
grant execute on function public.tenant_membership_allowed(uuid) to authenticated, service_role;

create or replace function public.company_membership_allowed(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_company_id is not null
    and auth.uid() is not null
    and (
      public.tenant_membership_allowed(target_company_id)
      or exists (
        select 1
        from public.account a
        where a.auth_user_id = auth.uid()
          and a.company_id = target_company_id
          and lower(a.status) = 'active'
      )
    );
$$;

revoke all on function public.company_membership_allowed(uuid) from public, anon;
grant execute on function public.company_membership_allowed(uuid) to authenticated, service_role;

create or replace function public.map_account_role_to_tenant(account_role text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(account_role, 'VIEWER'))
    when 'OWNER' then 'OWNER'
    when 'COMPANY_OWNER' then 'OWNER'
    when 'ADMIN' then 'ADMIN'
    when 'COMPANY_ADMIN' then 'ADMIN'
    when 'MANAGER' then 'MANAGER'
    when 'STORE_MANAGER' then 'MANAGER'
    when 'STAFF' then 'OPERATOR'
    when 'EMPLOYEE' then 'OPERATOR'
    when 'OPERATOR' then 'OPERATOR'
    when 'AUDITOR' then 'AUDITOR'
    else 'VIEWER'
  end;
$$;

create or replace function public.ensure_company_tenant(p_company_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null then
    raise exception 'COMPANY_ID_REQUIRED';
  end if;

  insert into public.tenant_master (
    id, tenant_code, tenant_name, tenant_type, plan_code, status, data_location
  ) values (
    p_company_id,
    'C-' || replace(p_company_id::text, '-', ''),
    coalesce(nullif(trim(p_name), ''), '정육비서 기업'),
    'SINGLE',
    'STANDARD',
    'ACTIVE',
    'SHARED_KR_01'
  )
  on conflict (id) do update
    set tenant_name = excluded.tenant_name,
        updated_at = now();
end;
$$;

revoke all on function public.ensure_company_tenant(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_company_tenant(uuid, text) to service_role;

create or replace function public.sync_account_tenant_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant uuid := '881f6cc1-b552-468c-b9b4-152edb464e61';
  target_role text;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  if new.member_status = 'APPROVED' and new.company_id is not null then
    perform public.ensure_company_tenant(new.company_id, (
      select c.name from public.company c where c.id = new.company_id
    ));
    target_tenant := new.company_id;
  end if;

  target_role := public.map_account_role_to_tenant(new.role);

  update public.tenant_user
     set status = 'INACTIVE',
         is_default = false,
         updated_at = now()
   where user_id = new.auth_user_id
     and tenant_id <> target_tenant
     and status = 'ACTIVE';

  insert into public.tenant_user (
    tenant_id, user_id, role_code, status, is_default, is_active
  ) values (
    target_tenant, new.auth_user_id, target_role, 'ACTIVE', true, true
  )
  on conflict (tenant_id, user_id) do update
    set role_code = excluded.role_code,
        status = 'ACTIVE',
        is_default = true,
        is_active = true,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_account_tenant_membership_trigger on public.account;
create trigger sync_account_tenant_membership_trigger
after insert or update of auth_user_id, company_id, member_status, role, status
on public.account
for each row execute function public.sync_account_tenant_membership();

create or replace function public.signup_company_account(
  p_auth_user_id uuid,
  p_email text,
  p_name text,
  p_company_name text
) returns public.account
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  new_store_id uuid;
  result public.account;
begin
  if auth.uid() is null or auth.uid() <> p_auth_user_id then
    raise exception 'AUTH_USER_MISMATCH';
  end if;

  select * into result
  from public.account
  where auth_user_id = auth.uid();
  if found then
    return result;
  end if;

  insert into public.company (name)
  values (coalesce(nullif(trim(p_company_name), ''), '정육비서 체험 기업'))
  returning id into new_company_id;

  perform public.ensure_company_tenant(new_company_id, p_company_name);

  insert into public.store (company_id, name, is_default)
  values (new_company_id, '기본매장', true)
  returning id into new_store_id;

  insert into public.account (
    auth_user_id, company_id, store_id, email, name, role, status, member_status
  ) values (
    auth.uid(), new_company_id, new_store_id, p_email, p_name,
    'OWNER', 'active', 'SOCIAL_VERIFIED'
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.signup_company_account(uuid, text, text, text) from public, anon;
grant execute on function public.signup_company_account(uuid, text, text, text) to authenticated;

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
  current_account public.account;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if regexp_replace(coalesce(p_business_number, ''), '\D', '', 'g') !~ '^[0-9]{10}$' then
    raise exception 'INVALID_BUSINESS_NUMBER';
  end if;

  select * into current_account
  from public.account
  where auth_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  update public.company
     set name = coalesce(nullif(trim(p_business_name), ''), name),
         biz_no = regexp_replace(p_business_number, '\D', '', 'g'),
         updated_at = now()
   where id = current_account.company_id;

  insert into public.business_verification (
    applicant_user_id, company_id, business_number, business_name,
    representative_name, business_address, license_type, license_number,
    status, reviewed_at
  ) values (
    auth.uid(), current_account.company_id,
    regexp_replace(p_business_number, '\D', '', 'g'),
    p_business_name, p_representative_name, p_business_address,
    p_license_type, p_license_number, 'APPROVED', now()
  );

  update public.account
     set member_status = 'APPROVED',
         updated_at = now()
   where id = current_account.id
  returning * into current_account;

  return current_account;
end;
$$;

revoke all on function public.activate_own_business_tenant(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.activate_own_business_tenant(text, text, text, text, text, text)
  to authenticated;

-- Backfill memberships without changing operational data.
update public.account
set updated_at = updated_at
where auth_user_id is not null;

-- Every table carrying tenant_id is protected, including directly-addressable
-- partitions. tenant_user is handled separately to prevent member escalation.
do $$
declare
  table_record record;
begin
  for table_record in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'tenant_id'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'tenant_user'
  loop
    execute format('alter table public.%I enable row level security', table_record.table_name);
    execute format('revoke all on table public.%I from anon', table_record.table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_record.table_name);
    execute format('drop policy if exists tenant_member_all on public.%I', table_record.table_name);
    execute format(
      'create policy tenant_member_all on public.%I for all to authenticated using (public.tenant_membership_allowed(tenant_id)) with check (public.tenant_membership_allowed(tenant_id))',
      table_record.table_name
    );
  end loop;
end;
$$;

-- Aggregate tables use company_id rather than tenant_id.
do $$
declare
  table_record record;
begin
  for table_record in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns company_col
      on company_col.table_schema = n.nspname
     and company_col.table_name = c.relname
     and company_col.column_name = 'company_id'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from information_schema.columns tenant_col
        where tenant_col.table_schema = n.nspname
          and tenant_col.table_name = c.relname
          and tenant_col.column_name = 'tenant_id'
      )
      and c.relname not in (
        'account', 'company', 'store', 'business_verification'
      )
  loop
    execute format('alter table public.%I enable row level security', table_record.table_name);
    execute format('revoke all on table public.%I from anon', table_record.table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_record.table_name);
    execute format('drop policy if exists company_member_all on public.%I', table_record.table_name);
    execute format(
      'create policy company_member_all on public.%I for all to authenticated using (public.company_membership_allowed(company_id)) with check (public.company_membership_allowed(company_id))',
      table_record.table_name
    );
  end loop;
end;
$$;

alter table public.tenant_user enable row level security;
revoke all on public.tenant_user from anon;
revoke insert, update, delete on public.tenant_user from authenticated;
grant select on public.tenant_user to authenticated;
drop policy if exists tenant_user_member_select on public.tenant_user;
create policy tenant_user_member_select
on public.tenant_user for select to authenticated
using (public.tenant_membership_allowed(tenant_id));

alter table public.account enable row level security;
revoke all on public.account from anon;
revoke insert, update, delete on public.account from authenticated;
grant select on public.account to authenticated;
drop policy if exists account_self_select on public.account;
create policy account_self_select
on public.account for select to authenticated
using (auth_user_id = auth.uid());

alter table public.company enable row level security;
revoke all on public.company from anon;
revoke insert, update, delete on public.company from authenticated;
grant select on public.company to authenticated;
drop policy if exists company_member_select on public.company;
create policy company_member_select
on public.company for select to authenticated
using (public.company_membership_allowed(id));

alter table public.store enable row level security;
revoke all on public.store from anon;
revoke insert, update, delete on public.store from authenticated;
grant select on public.store to authenticated;
drop policy if exists store_company_member_select on public.store;
create policy store_company_member_select
on public.store for select to authenticated
using (public.company_membership_allowed(company_id));

alter table public.tenant_master enable row level security;
revoke all on public.tenant_master from anon;
revoke insert, update, delete on public.tenant_master from authenticated;
grant select on public.tenant_master to authenticated;
drop policy if exists tenant_master_member_select on public.tenant_master;
create policy tenant_master_member_select
on public.tenant_master for select to authenticated
using (public.tenant_membership_allowed(id));

alter table public.business_verification enable row level security;
revoke all on public.business_verification from anon;
revoke insert, update, delete on public.business_verification from authenticated;
grant select on public.business_verification to authenticated;
drop policy if exists business_verification_self_select on public.business_verification;
create policy business_verification_self_select
on public.business_verification for select to authenticated
using (applicant_user_id = auth.uid());

-- Global standards remain readable, but anonymous and authenticated clients
-- cannot change the shared dictionary directly.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'product_species', 'product_category', 'product_attribute_value',
    'product_dictionary', 'product_alias', 'ocr_provider_registry',
    'source_registry', 'role', 'permission', 'role_permission'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
      execute format('grant select on table public.%I to anon, authenticated', table_name);
    end if;
  end loop;
end;
$$;

comment on function public.tenant_membership_allowed(uuid) is
'Authoritative RLS membership check backed by tenant_user and auth.uid().';
