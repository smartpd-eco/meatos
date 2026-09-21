-- POS 에이전트 원격 상태 보고(하트비트) — 202609080102
--
-- 배경: 키보드 훅 방식은 실패해도 화면에 아무 에러가 뜨지 않는다(Windows UIPI로 입력을
-- 못 받거나, SetWindowsHookEx 자체가 조용히 실패하는 경우 등). 지금까지는 이걸 확인하려면
-- 매장에 직접 가서 pos-agent.log를 열어봐야 했다. 사장님이 매장마다 상주할 여건이 안 되므로,
-- 에이전트가 10분마다(+ 시작 직후 1회) 관리자 권한 여부 / 훅 정상 여부 / 버전 / 최근 오류를
-- 서버에 보고하고, '자동 판매연동' 화면에서 매장을 방문하지 않고도 이 값을 확인할 수 있게 한다.
--
-- 이 마이그레이션은 매출/재고에 영향을 주지 않는다(순수 모니터링 메타데이터).

alter table public.pos_agent_credential
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists agent_version text,
  add column if not exists is_elevated boolean,
  add column if not exists hook_ok boolean,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

comment on column public.pos_agent_credential.last_heartbeat_at is '에이전트가 마지막으로 상태를 보고한 시각(10분 주기). 실제 판매 캡처(last_used_at)와 별개.';
comment on column public.pos_agent_credential.is_elevated is '마지막 보고 시점에 에이전트 프로세스가 관리자 권한으로 실행 중이었는지. false면 POS가 관리자 권한일 때 키보드 훅이 입력을 못 받을 수 있다(UIPI).';
comment on column public.pos_agent_credential.hook_ok is '마지막 보고 시점에 저수준 키보드 훅 설치가 정상이었는지(SetWindowsHookEx 성공 여부).';

-- 에이전트 → 서버: 하트비트 보고. process_pos_sale_event / capture_pos_sale_observation_agent와
-- 동일한 토큰 인증 방식을 그대로 쓴다(발급된 pos_agent_credential.key_hash로 조회).
create or replace function public.report_pos_agent_health(
  p_agent_token text,
  p_elevated boolean default null,
  p_hook_ok boolean default null,
  p_agent_version text default null,
  p_last_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credential public.pos_agent_credential%rowtype;
  error_value text := nullif(trim(coalesce(p_last_error, '')), '');
begin
  if p_agent_token is null or length(p_agent_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  select * into credential
    from public.pos_agent_credential
   where key_hash = encode(extensions.digest(p_agent_token, 'sha256'), 'hex')
     and is_active
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'AGENT_NOT_AUTHENTICATED');
  end if;

  update public.pos_agent_credential
     set last_heartbeat_at = now(),
         is_elevated = coalesce(p_elevated, is_elevated),
         hook_ok = coalesce(p_hook_ok, hook_ok),
         agent_version = coalesce(nullif(trim(p_agent_version), ''), agent_version),
         last_error = error_value,
         last_error_at = case when error_value is not null then now() else null end
   where id = credential.id;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', 'SERVER_ERROR');
end;
$$;

revoke all on function public.report_pos_agent_health(text, boolean, boolean, text, text) from public;
grant execute on function public.report_pos_agent_health(text, boolean, boolean, text, text) to anon, authenticated;

comment on function public.report_pos_agent_health(text, boolean, boolean, text, text)
  is 'POS 에이전트가 10분마다 보고하는 원격 상태(관리자 권한/훅 정상/버전/최근 오류). 매출·재고에는 영향 없음.';

-- 사장님(웹) → 서버: 본인 회사 소속 매장들의 에이전트 상태 조회. pos_agent_credential은
-- key_hash 등 민감 정보를 담고 있어 클라이언트에 직접 노출하지 않으므로, 안전한 컬럼만
-- 골라 반환하는 이 RPC를 통해서만 읽는다(issue_pos_agent_key와 동일한 접근 방식).
create or replace function public.get_pos_agent_health(
  p_store_id uuid default null
) returns table (
  device text,
  store_id uuid,
  store_name text,
  is_active boolean,
  last_used_at timestamptz,
  last_heartbeat_at timestamptz,
  agent_version text,
  is_elevated boolean,
  hook_ok boolean,
  last_error text,
  last_error_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AGENT_NOT_AUTHENTICATED';
  end if;

  return query
    select c.device, c.store_id, s.name, c.is_active, c.last_used_at,
           c.last_heartbeat_at, c.agent_version, c.is_elevated, c.hook_ok,
           c.last_error, c.last_error_at
      from public.pos_agent_credential c
      join public.store s on s.id = c.store_id
     where public.company_membership_allowed(c.company_id)
       and (p_store_id is null or c.store_id = p_store_id)
     order by c.is_active desc, c.last_heartbeat_at desc nulls last;
end;
$$;

revoke all on function public.get_pos_agent_health(uuid) from public, anon;
grant execute on function public.get_pos_agent_health(uuid) to authenticated;

comment on function public.get_pos_agent_health(uuid)
  is '호출자가 속한 회사 매장들의 POS 에이전트 원격 상태 목록(민감 컬럼 제외). 자동 판매연동 화면에서 사용.';
