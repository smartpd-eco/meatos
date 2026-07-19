-- Impact: draft-only RLS guidance; no RLS activation in this sprint.

create or replace function public.tenant_membership_allowed(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_user tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = target_tenant_id
      and tu.status = 'ACTIVE'
  );
$$;

comment on function public.tenant_membership_allowed(uuid) is
'Draft helper for future RLS policies. Do not enable RLS in this sprint.';
