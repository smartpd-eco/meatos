-- Strict company tenant isolation.
-- Unlinked users use browser-only sample data and have no operational DB tenant.

create or replace function public.tenant_membership_allowed(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_tenant_id is not null
    and auth.uid() is not null
    and target_tenant_id <> '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid
    and exists (
      select 1
        from public.account a
        join public.tenant_user tu
          on tu.user_id = a.auth_user_id
         and tu.tenant_id = a.company_id
       where a.auth_user_id = auth.uid()
         and a.company_id = target_tenant_id
         and a.member_status = 'APPROVED'
         and lower(a.status) = 'active'
         and tu.status = 'ACTIVE'
         and tu.is_active
    );
$$;

alter function public.tenant_membership_allowed(uuid) owner to postgres;
revoke all on function public.tenant_membership_allowed(uuid) from public, anon;
grant execute on function public.tenant_membership_allowed(uuid) to authenticated, service_role;

create or replace function public.company_membership_allowed(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_company_id is not null
    and auth.uid() is not null
    and public.tenant_membership_allowed(target_company_id);
$$;

alter function public.company_membership_allowed(uuid) owner to postgres;
revoke all on function public.company_membership_allowed(uuid) from public, anon;
grant execute on function public.company_membership_allowed(uuid) to authenticated, service_role;

create or replace function public.sync_account_tenant_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_role text;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  update public.tenant_user
     set status = 'INACTIVE',
         is_default = false,
         is_active = false,
         updated_at = now()
   where user_id = new.auth_user_id
     and (new.member_status <> 'APPROVED'
          or new.company_id is null
          or tenant_id <> new.company_id);

  if new.member_status <> 'APPROVED'
     or lower(new.status) <> 'active'
     or new.company_id is null then
    return new;
  end if;

  perform public.ensure_company_tenant(new.company_id, (
    select c.name from public.company c where c.id = new.company_id
  ));
  target_role := public.map_account_role_to_tenant(new.role);

  insert into public.tenant_user (
    tenant_id, user_id, role_code, status, is_default, is_active
  ) values (
    new.company_id, new.auth_user_id, target_role, 'ACTIVE', true, true
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

alter function public.sync_account_tenant_membership() owner to postgres;

-- Remove stale/demo memberships without deleting any business records.
update public.tenant_user tu
   set status = 'INACTIVE',
       is_default = false,
       is_active = false,
       updated_at = now()
 where tu.tenant_id = '881f6cc1-b552-468c-b9b4-152edb464e61'::uuid
    or not exists (
      select 1
        from public.account a
       where a.auth_user_id = tu.user_id
         and a.member_status = 'APPROVED'
         and lower(a.status) = 'active'
         and a.company_id = tu.tenant_id
    );

-- Rebuild the one valid active membership for every approved company account.
update public.account
   set updated_at = updated_at
 where auth_user_id is not null
   and member_status = 'APPROVED'
   and lower(status) = 'active'
   and company_id is not null;

comment on function public.tenant_membership_allowed(uuid) is
  'Fail-closed tenant authorization: requires an approved active account and matching active company membership; shared demo tenant is never database-readable by clients.';
comment on function public.company_membership_allowed(uuid) is
  'Company authorization delegates to strict approved tenant membership.';
