-- =====================================================================
-- 계정 삭제(회원 탈퇴) — Google Play 계정 삭제 요건 대응 · 202610080001
--
-- 원칙
--   * 로그인한 본인만 자기 계정을 삭제한다 (auth.uid() 기준).
--   * 개인 식별 정보(이름·이메일·전화)와 간편로그인 연결 정보는 즉시 삭제한다.
--   * 사업장(회사) 단위 업무 기록(매입·매출·재고 등)은 삭제하지 않는다.
--     → 장부 보존 의무가 있는 회사 기록이며, 같은 사업장 구성원이 계속 사용한다.
--   * 로그인 계정(auth.users)을 삭제한다. 삭제가 막히면(외래키 등) 로그인을 영구 차단하고
--     AUTH_DELETE_PENDING 으로 기록해 운영자가 마무리할 수 있게 한다.
--   * 재실행 안전(idempotent). 기존 테이블·데이터를 지우지 않는 additive 마이그레이션.
-- =====================================================================

create table if not exists public.account_deletion_request (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid not null,
  account_id        uuid,
  company_id        uuid,
  reason            text,
  status            text not null default 'PROCESSING'
                    check (status in ('PROCESSING', 'COMPLETED', 'AUTH_DELETE_PENDING')),
  auth_user_deleted boolean not null default false,
  error_detail      text,
  requested_at      timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists account_deletion_request_requested_idx
  on public.account_deletion_request (requested_at desc);

comment on table public.account_deletion_request is
  '계정 삭제 처리 기록. 개인 식별 정보는 저장하지 않는다(내부 ID만). 개인정보처리방침상 1년 보관 후 파기.';

-- 클라이언트에는 공개하지 않는다. 아래 함수(security definer)와 service_role만 접근.
alter table public.account_deletion_request enable row level security;
revoke all on public.account_deletion_request from public, anon, authenticated;
grant all on public.account_deletion_request to service_role;

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_account      public.account;
  v_request_id   uuid;
  v_auth_deleted boolean := false;
  v_error        text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_account
    from public.account
   where auth_user_id = v_uid
   for update;

  insert into public.account_deletion_request (auth_user_id, account_id, company_id, reason)
  values (v_uid, v_account.id, v_account.company_id, left(nullif(trim(coalesce(p_reason, '')), ''), 500))
  returning id into v_request_id;

  -- 1) 사업장 구성원 자격 해제
  update public.tenant_user
     set status = 'INACTIVE',
         is_default = false,
         is_active = false,
         updated_at = now()
   where user_id = v_uid;

  if v_account.id is not null then
    -- 2) 간편로그인·계정 연결 정보 삭제 (같은 소셜 계정으로 재가입할 수 있도록)
    if to_regclass('public.account_linked_identity') is not null then
      execute 'delete from public.account_linked_identity where account_id = $1' using v_account.id;
    end if;
    if to_regclass('public.account_identity_link_request') is not null then
      execute 'delete from public.account_identity_link_request where account_id = $1' using v_account.id;
    end if;
    if to_regclass('public.account_login_provider') is not null then
      execute 'delete from public.account_login_provider where account_id = $1' using v_account.id;
    end if;

    -- 3) 개인 식별 정보 파기 + 탈퇴 상태 (기존 트리거가 구성원 자격도 함께 해제)
    update public.account
       set member_status = 'WITHDRAWN',
           status        = 'blocked',
           email         = null,
           name          = null,
           phone         = null,
           updated_at    = now()
     where id = v_account.id;

    -- 4) 로그인 계정과의 연결 끊기
    update public.account
       set auth_user_id = null,
           updated_at   = now()
     where id = v_account.id;
  end if;

  -- 5) 로그인 계정 삭제 (실패 시 영구 로그인 차단 후 운영자 마무리 대상으로 기록)
  begin
    delete from auth.users where id = v_uid;
    v_auth_deleted := true;
  exception when others then
    v_error := sqlerrm;
    begin
      update auth.users
         set banned_until = 'infinity'::timestamptz,
             updated_at   = now()
       where id = v_uid;
      delete from auth.sessions where user_id = v_uid;
    exception when others then
      v_error := v_error || ' / ban: ' || sqlerrm;
    end;
  end;

  update public.account_deletion_request
     set auth_user_deleted = v_auth_deleted,
         status       = case when v_auth_deleted then 'COMPLETED' else 'AUTH_DELETE_PENDING' end,
         error_detail = v_error,
         completed_at = now()
   where id = v_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'auth_user_deleted', v_auth_deleted
  );
end;
$$;

alter function public.request_account_deletion(text) owner to postgres;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

comment on function public.request_account_deletion(text) is
  '로그인한 본인 계정 삭제(회원 탈퇴). 개인 식별 정보·로그인 연결 정보 삭제, 구성원 해제, auth.users 삭제. 회사 업무 기록은 보존.';

notify pgrst, 'reload schema';

-- =====================================================================
-- 운영 확인용 (실행 후):
--   select id, status, auth_user_deleted, error_detail, requested_at
--     from public.account_deletion_request order by requested_at desc limit 20;
--   -- AUTH_DELETE_PENDING 이 있으면: Supabase 대시보드 → Authentication → Users 에서
--   --   해당 auth_user_id 를 찾아 직접 Delete user (로그인은 이미 차단된 상태)
-- 1년 지난 처리 기록 파기:
--   delete from public.account_deletion_request where requested_at < now() - interval '1 year';
-- =====================================================================
