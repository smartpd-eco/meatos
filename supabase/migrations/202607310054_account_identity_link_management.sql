-- Account identity linking for providers that are not natively supported by
-- Supabase Auth. Google and Kakao are linked through Auth.linkIdentity().
-- Naver is verified by the existing Edge Function and mapped here.

create table if not exists public.account_linked_identity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account(id) on delete cascade,
  auth_user_id uuid not null,
  provider text not null check (provider in ('naver')),
  provider_user_id text not null,
  provider_email text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id),
  unique (account_id, provider)
);

create index if not exists account_linked_identity_auth_user_idx
  on public.account_linked_identity(auth_user_id);

alter table public.account_linked_identity enable row level security;

drop policy if exists account_linked_identity_select_own
  on public.account_linked_identity;
create policy account_linked_identity_select_own
  on public.account_linked_identity
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create table if not exists public.account_identity_link_request (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account(id) on delete cascade,
  auth_user_id uuid not null,
  provider text not null check (provider in ('naver')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_identity_link_request_owner_idx
  on public.account_identity_link_request(auth_user_id, provider, expires_at);

alter table public.account_identity_link_request enable row level security;

-- The browser receives only the one-time raw token. Only its SHA-256 digest is
-- persisted and the request expires after ten minutes.
create or replace function public.begin_account_identity_link(
  p_provider text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_account public.account;
  raw_token text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if lower(trim(coalesce(p_provider, ''))) <> 'naver' then
    raise exception 'UNSUPPORTED_LINK_PROVIDER';
  end if;

  select * into current_account
    from public.account
   where auth_user_id = auth.uid()
   limit 1;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;

  delete from public.account_identity_link_request
   where auth_user_id = auth.uid()
     and provider = 'naver'
     and (used_at is not null or expires_at <= now());

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.account_identity_link_request (
    account_id, auth_user_id, provider, token_hash, expires_at
  ) values (
    current_account.id,
    auth.uid(),
    'naver',
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    now() + interval '10 minutes'
  );

  return raw_token;
end;
$$;

create or replace function public.complete_account_identity_link(
  p_token text,
  p_provider text,
  p_provider_user_id text,
  p_provider_email text
) returns table (
  account_id uuid,
  auth_user_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  link_request public.account_identity_link_request;
  existing_identity public.account_linked_identity;
begin
  if lower(trim(coalesce(p_provider, ''))) <> 'naver' then
    raise exception 'UNSUPPORTED_LINK_PROVIDER';
  end if;
  if nullif(trim(coalesce(p_token, '')), '') is null
     or nullif(trim(coalesce(p_provider_user_id, '')), '') is null then
    raise exception 'INVALID_LINK_REQUEST';
  end if;

  select * into link_request
    from public.account_identity_link_request
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and provider = 'naver'
   for update;
  if not found or link_request.used_at is not null
     or link_request.expires_at <= now() then
    raise exception 'LINK_REQUEST_EXPIRED';
  end if;

  select ali.* into existing_identity
    from public.account_linked_identity ali
   where ali.provider = 'naver'
     and ali.provider_user_id = trim(p_provider_user_id)
   limit 1
   for update;
  if found and existing_identity.account_id <> link_request.account_id then
    raise exception 'IDENTITY_ALREADY_LINKED';
  end if;

  select ali.* into existing_identity
    from public.account_linked_identity ali
   where ali.account_id = link_request.account_id
     and ali.provider = 'naver'
   limit 1
   for update;
  if found and existing_identity.provider_user_id <> trim(p_provider_user_id) then
    raise exception 'PROVIDER_ALREADY_LINKED';
  end if;

  insert into public.account_linked_identity (
    account_id, auth_user_id, provider, provider_user_id, provider_email
  ) values (
    link_request.account_id,
    link_request.auth_user_id,
    'naver',
    trim(p_provider_user_id),
    nullif(lower(trim(coalesce(p_provider_email, ''))), '')
  )
  on conflict (provider, provider_user_id) do update
    set provider_email = excluded.provider_email,
        updated_at = now();

  update public.account_identity_link_request
     set used_at = now()
   where id = link_request.id;

  return query
  select link_request.account_id, link_request.auth_user_id;
end;
$$;

create or replace function public.unlink_account_external_identity(
  p_provider text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if lower(trim(coalesce(p_provider, ''))) <> 'naver' then
    raise exception 'UNSUPPORTED_LINK_PROVIDER';
  end if;

  delete from public.account_linked_identity
   where auth_user_id = auth.uid()
     and provider = 'naver';
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.begin_account_identity_link(text)
  from public, anon;
grant execute on function public.begin_account_identity_link(text)
  to authenticated;

revoke all on function public.complete_account_identity_link(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_account_identity_link(text, text, text, text)
  to service_role;

revoke all on function public.unlink_account_external_identity(text)
  from public, anon;
grant execute on function public.unlink_account_external_identity(text)
  to authenticated;

revoke all on table public.account_identity_link_request
  from public, anon, authenticated;
revoke insert, update, delete on table public.account_linked_identity
  from public, anon, authenticated;
grant select on table public.account_linked_identity
  to authenticated;

comment on table public.account_linked_identity is
'Verified external identities linked to a canonical MEATOS account.';
comment on table public.account_identity_link_request is
'Short-lived, one-time requests used to link an external identity safely.';
