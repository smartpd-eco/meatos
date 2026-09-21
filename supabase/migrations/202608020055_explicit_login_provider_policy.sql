-- A provider may authenticate to a MEATOS account only when it is the primary
-- signup provider or the signed-in owner explicitly enables it.

create table if not exists public.account_login_provider (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account(id) on delete cascade,
  auth_user_id uuid not null,
  provider text not null check (provider in ('email', 'google', 'kakao', 'naver')),
  is_primary boolean not null default false,
  approved_at timestamptz not null default now(),
  unique (account_id, provider)
);

create index if not exists account_login_provider_auth_user_idx
  on public.account_login_provider(auth_user_id, provider);

alter table public.account_login_provider enable row level security;

drop policy if exists account_login_provider_select_own
  on public.account_login_provider;
create policy account_login_provider_select_own
  on public.account_login_provider
  for select
  to authenticated
  using (auth_user_id = auth.uid());

insert into public.account_login_provider (
  account_id, auth_user_id, provider, is_primary
)
select a.id, a.auth_user_id, a.signup_provider, true
  from public.account a
 where a.auth_user_id is not null
   and a.signup_provider in ('email', 'google', 'kakao', 'naver')
on conflict (account_id, provider) do update
  set is_primary = true;

create or replace function public.set_account_login_provider_enabled(
  p_provider text,
  p_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_account public.account;
  normalized_provider text;
  identity_exists boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  normalized_provider := lower(trim(coalesce(p_provider, '')));
  if normalized_provider not in ('google', 'kakao', 'naver') then
    raise exception 'UNSUPPORTED_LOGIN_PROVIDER';
  end if;

  select * into current_account
    from public.account
   where auth_user_id = auth.uid()
   limit 1;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  if not p_enabled then
    if current_account.signup_provider = normalized_provider then
      raise exception 'PRIMARY_PROVIDER_CANNOT_BE_DISABLED';
    end if;
    delete from public.account_login_provider alp
     where alp.account_id = current_account.id
       and alp.provider = normalized_provider
       and not alp.is_primary;
    return true;
  end if;

  if normalized_provider = 'naver' then
    select exists (
      select 1 from public.account_linked_identity ali
       where ali.account_id = current_account.id
         and ali.provider = 'naver'
    ) into identity_exists;
  else
    select exists (
      select 1 from auth.identities ai
       where ai.user_id = auth.uid()
         and ai.provider = normalized_provider
    ) into identity_exists;
  end if;
  if not identity_exists then raise exception 'PROVIDER_IDENTITY_NOT_LINKED'; end if;

  insert into public.account_login_provider (
    account_id, auth_user_id, provider, is_primary
  ) values (
    current_account.id,
    auth.uid(),
    normalized_provider,
    current_account.signup_provider = normalized_provider
  )
  on conflict (account_id, provider) do update
    set approved_at = now();
  return true;
end;
$$;

create or replace function public.is_account_login_provider_enabled(
  p_provider text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.account_login_provider alp
     where alp.auth_user_id = auth.uid()
       and alp.provider = lower(trim(coalesce(p_provider, '')))
  );
$$;

create or replace function public.sync_naver_login_provider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.account_login_provider alp
     where alp.account_id = old.account_id
       and alp.provider = 'naver'
       and not alp.is_primary;
    return old;
  end if;
  insert into public.account_login_provider (
    account_id, auth_user_id, provider, is_primary
  ) values (
    new.account_id, new.auth_user_id, 'naver',
    exists (
      select 1 from public.account a
       where a.id = new.account_id and a.signup_provider = 'naver'
    )
  )
  on conflict (account_id, provider) do update
    set approved_at = now();
  return new;
end;
$$;

drop trigger if exists account_linked_identity_login_provider_sync
  on public.account_linked_identity;
create trigger account_linked_identity_login_provider_sync
after insert or delete on public.account_linked_identity
for each row execute function public.sync_naver_login_provider();

insert into public.account_login_provider (
  account_id, auth_user_id, provider, is_primary
)
select ali.account_id, ali.auth_user_id, 'naver',
       (a.signup_provider = 'naver')
  from public.account_linked_identity ali
  join public.account a on a.id = ali.account_id
on conflict (account_id, provider) do nothing;

revoke all on table public.account_login_provider
  from public, anon;
revoke insert, update, delete on table public.account_login_provider
  from authenticated;
grant select on table public.account_login_provider
  to authenticated;

revoke all on function public.set_account_login_provider_enabled(text, boolean)
  from public, anon;
grant execute on function public.set_account_login_provider_enabled(text, boolean)
  to authenticated;

revoke all on function public.is_account_login_provider_enabled(text)
  from public, anon;
grant execute on function public.is_account_login_provider_enabled(text)
  to authenticated;

comment on table public.account_login_provider is
'Login providers explicitly allowed for a canonical MEATOS account; the signup provider is primary.';
