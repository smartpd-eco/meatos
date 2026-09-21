-- 옥토버(더즌) 여신협회 통합조회 계정 저장 — 202609150001
--
-- 배경: 옥토버 API는 조회할 때마다 여신협회 통합조회 로그인 ID/PW가 필요하다. 매번 사장님께
-- 입력받는 건 비현실적이라, "최초 1회만 입력받고 이후 자동조회에 재사용"하는 구조로 바꾼다.
-- 단, 원문 비밀번호는 절대 저장하지 않는다 — 옥토버가 공개한 RSA 공개키로 암호화한 결과(암호문)만
-- 저장하고, 매 호출 시 그 암호문을 그대로 재전송한다. 암호문은 옥토버의 개인키로만 복호화 가능하므로
-- MEATOS DB가 유출되어도 원문 비밀번호는 노출되지 않는다.
--
-- 보안: 이 표는 anon/authenticated에게 공개하지 않는다(암호문이라도 그 자체로 옥토버 인증에
-- 재사용 가능한 값이라, 다른 회사 사용자가 REST로 읽어가면 안 됨). octover-collect Edge Function이
-- SUPABASE_SERVICE_ROLE_KEY로만 읽고 쓴다.

create table if not exists public.merchant_octover_account (
  id             bigint generated always as identity primary key,
  company_id     uuid not null,
  store_id       uuid,
  octover_id     text not null,             -- 여신협회 통합조회 로그인 아이디
  octover_pw_enc text not null,             -- RSA-OAEP(옥토버 공개키) 암호문. 원문 비밀번호는 저장하지 않음.
  biz_no         text,                      -- 사업자번호(참고/표시용)
  mer_no         text,                      -- 옥토버 가맹점번호(있는 경우)
  status         text not null default 'ACTIVE', -- ACTIVE / REVOKED
  last_used_at   timestamptz,
  last_error     text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create unique index if not exists uq_moa_company_store
  on public.merchant_octover_account (company_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.merchant_octover_account is
  '옥토버(여신협회 통합조회) 계정 — octover_pw_enc는 원문이 아니라 옥토버 공개키로 암호화한 암호문. 절대 anon/authenticated에 공개하지 않고 octover-collect Edge Function(서비스 롤)만 접근한다.';

alter table public.merchant_octover_account disable row level security;
-- 주의: 의도적으로 anon/authenticated에 grant하지 않는다. Edge Function이 SERVICE_ROLE_KEY로만 접근.

notify pgrst, 'reload schema';
