-- =====================================================================
-- CODEF(쿠콘) 카드매출 자동연동 PoC — 가맹점↔connectedId 매핑 + 멱등키
-- 원칙: MEATOS는 카드 로그인 자격증명을 저장하지 않는다.
--       CODEF가 자격증명을 보관하고 connectedId(연결식별자)만 여기 저장한다.
-- 기존 프로젝트 정책과 동일: RLS off + anon/authenticated grant.
-- =====================================================================

create table if not exists merchant_card_link (
  id            bigint generated always as identity primary key,
  company_id    uuid not null,               -- 테넌트(기업)
  store_id      uuid,                         -- 매장(사업장)
  connected_id  text not null,               -- CODEF Connected ID (자격증명 아님)
  organization  text default 'crefia',       -- 조회 대상(여신협회 통합조회)
  business_no   text,                         -- 사업자번호(라벨/식별용, 선택)
  label         text,                         -- 표시용 이름
  status        text not null default 'ACTIVE', -- ACTIVE / REVOKED
  consented_at  timestamptz,                  -- 가맹점 동의 일시
  last_collected_at timestamptz,              -- 마지막 수집 일시
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_mcl_company on merchant_card_link (company_id, status);
create unique index if not exists uq_mcl_company_store_conn
  on merchant_card_link (company_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), connected_id);

alter table merchant_card_link disable row level security;
grant select, insert, update, delete on merchant_card_link to anon, authenticated;

-- card_settlement 멱등 적재용 외부키(중복 수집 방지). 예: codef|connId|카드사|매출일|승인액|입금일
alter table card_settlement add column if not exists external_key text;
create unique index if not exists uq_card_settlement_extkey
  on card_settlement (company_id, external_key) where external_key is not null;
