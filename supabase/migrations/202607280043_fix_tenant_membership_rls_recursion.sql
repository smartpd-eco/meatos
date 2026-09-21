-- Fix authenticated API reads that recurse through tenant_user RLS.
-- No table data or policy scope changes: restore the intended function
-- execution mode declared by 202607260038_auth_tenant_rls.sql.

alter function public.tenant_membership_allowed(uuid) security definer;
alter function public.tenant_membership_allowed(uuid) set search_path = public, pg_temp;
alter function public.tenant_membership_allowed(uuid) owner to postgres;

revoke all on function public.tenant_membership_allowed(uuid) from public, anon;
grant execute on function public.tenant_membership_allowed(uuid) to authenticated, service_role;

comment on function public.tenant_membership_allowed(uuid) is
  'Non-recursive authenticated tenant membership check. SECURITY DEFINER bypasses tenant_user RLS while preserving the ACTIVE membership predicate.';
