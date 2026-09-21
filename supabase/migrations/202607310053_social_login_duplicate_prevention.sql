-- Social-login account deduplication.
-- One verified email may own only one MEATOS account/company, regardless of provider.

alter table public.account
  add column if not exists signup_provider text not null default 'unknown';

update public.account a
   set signup_provider = case lower(coalesce(
         nullif(u.raw_user_meta_data ->> 'provider', ''),
         nullif(u.raw_app_meta_data ->> 'provider', ''),
         'email'
       ))
       when 'google' then 'google'
       when 'kakao' then 'kakao'
       when 'naver' then 'naver'
       when 'email' then 'email'
       else 'unknown'
     end
  from auth.users u
 where u.id = a.auth_user_id
   and a.signup_provider = 'unknown';

do $$
begin
  if exists (
    select 1
      from public.account
     where nullif(trim(email), '') is not null
     group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'EXISTING_DUPLICATE_ACCOUNT_EMAILS';
  end if;
end;
$$;

create unique index if not exists account_email_normalized_uidx
  on public.account (lower(trim(email)))
  where nullif(trim(email), '') is not null;

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
  matched_account public.account;
  jwt_claims jsonb;
  normalized_email text;
  verified_email text;
  current_provider text;
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

  jwt_claims := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  normalized_email := lower(trim(coalesce(p_email, '')));
  verified_email := lower(trim(coalesce(jwt_claims ->> 'email', '')));

  if normalized_email = '' or verified_email = '' then
    raise exception 'AUTH_EMAIL_REQUIRED';
  end if;
  if normalized_email <> verified_email then
    raise exception 'AUTH_EMAIL_MISMATCH';
  end if;

  current_provider := lower(coalesce(
    nullif(jwt_claims #>> '{user_metadata,provider}', ''),
    nullif(jwt_claims #>> '{app_metadata,provider}', ''),
    'email'
  ));
  if current_provider not in ('google', 'kakao', 'naver', 'email') then
    current_provider := 'unknown';
  end if;

  -- Serialize registrations for the same normalized email.
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  select * into matched_account
    from public.account
   where lower(trim(email)) = normalized_email
   order by created_at
   limit 1
   for update;

  if found and matched_account.auth_user_id <> auth.uid() then
    raise exception 'ACCOUNT_ALREADY_REGISTERED|%',
      coalesce(nullif(matched_account.signup_provider, ''), 'unknown');
  end if;

  insert into public.company (name)
  values (coalesce(nullif(trim(p_company_name), ''), '정육비서 체험 기업'))
  returning id into new_company_id;

  perform public.ensure_company_tenant(new_company_id, p_company_name);

  insert into public.store (company_id, name, is_default)
  values (new_company_id, '기본매장', true)
  returning id into new_store_id;

  insert into public.account (
    auth_user_id, company_id, store_id, email, name, role, status,
    member_status, signup_provider
  ) values (
    auth.uid(), new_company_id, new_store_id, normalized_email, p_name,
    'OWNER', 'active', 'SOCIAL_VERIFIED', current_provider
  )
  returning * into result;

  return result;
exception
  when unique_violation then
    select * into matched_account
      from public.account
     where lower(trim(email)) = normalized_email
     order by created_at
     limit 1;
    raise exception 'ACCOUNT_ALREADY_REGISTERED|%',
      coalesce(nullif(matched_account.signup_provider, ''), 'unknown');
end;
$$;

revoke all on function public.signup_company_account(uuid, text, text, text)
  from public, anon;
grant execute on function public.signup_company_account(uuid, text, text, text)
  to authenticated;

comment on column public.account.signup_provider is
'The provider used when the canonical MEATOS account was first created.';
comment on index public.account_email_normalized_uidx is
'Prevents multiple MEATOS accounts/companies for the same normalized verified email.';

