-- =====================================================================
-- MEATOS 카드매출 입금예정 (무료 기준) v1.0
-- 여신금융협회 통합조회(무료)에서 확인한 카드사별 매출을 입력하면
-- 카드사별 정산주기(영업일)·수수료율·공휴일을 반영해 "일별·카드사별
-- 입금예정액"을 자동 계산/표시한다. 외부 유료 API 없이 동작한다.
-- 기존 매출(sales_record)/재고(inventory_movement) 로직은 건드리지 않는다.
-- =====================================================================

-- 1) 대한민국 공휴일 (영업일 계산용, 전역 공유)
create table if not exists kr_holiday (
  holiday_date date primary key,
  name         text
);

insert into kr_holiday(holiday_date, name) values
  ('2026-01-01','신정'),
  ('2026-02-16','설날연휴'),
  ('2026-02-17','설날'),
  ('2026-02-18','설날연휴'),
  ('2026-03-01','삼일절'),
  ('2026-03-02','대체공휴일(삼일절)'),
  ('2026-05-05','어린이날'),
  ('2026-05-24','부처님오신날'),
  ('2026-05-25','대체공휴일(부처님오신날)'),
  ('2026-06-06','현충일'),
  ('2026-08-15','광복절'),
  ('2026-08-17','대체공휴일(광복절)'),
  ('2026-09-24','추석연휴'),
  ('2026-09-25','추석'),
  ('2026-09-26','추석연휴'),
  ('2026-10-03','개천절'),
  ('2026-10-05','대체공휴일(개천절)'),
  ('2026-10-09','한글날'),
  ('2026-12-25','성탄절'),
  ('2027-01-01','신정')
on conflict (holiday_date) do nothing;

-- 2) 카드사별 정산 규칙 (정산주기 영업일 + 수수료율)
--    company_id IS NULL = 전 매장 공통 기본값. 매장별 값이 있으면 우선 적용.
create table if not exists card_settlement_rule (
  id           bigint generated always as identity primary key,
  company_id   uuid,
  card_company text not null,
  deposit_lag  int  not null default 2,     -- 영업일 기준 D+n
  fee_rate     numeric not null default 0,  -- 수수료율(%) 예: 0.9 = 0.9%
  updated_at   timestamptz default now(),
  unique (company_id, card_company)
);

-- 전역 기본 규칙(정육점 영세가맹점 표준: D+2, 수수료율은 매장에서 조정)
insert into card_settlement_rule(company_id, card_company, deposit_lag, fee_rate) values
  (null,'신한',2,0),
  (null,'삼성',2,0),
  (null,'KB국민',2,0),
  (null,'현대',2,0),
  (null,'롯데',2,0),
  (null,'BC',2,0),
  (null,'하나',2,0),
  (null,'우리',2,0),
  (null,'NH농협',2,0)
on conflict (company_id, card_company) do nothing;

-- 3) 카드매출 입금예정 원장
create table if not exists card_settlement (
  id            bigint generated always as identity primary key,
  company_id    uuid not null,
  store_id      uuid,
  card_company  text not null,
  sale_date     date not null,             -- 매출발생일
  approve_amt   numeric not null,          -- 승인(매출)금액
  fee_rate      numeric default 0,         -- 적용 수수료율(%)
  fee_amt       numeric default 0,         -- 수수료 금액
  deposit_amt   numeric not null,          -- 실입금(예정)액 = 승인 - 수수료
  deposit_date  date not null,             -- 입금예정일(영업일 계산)
  deposit_lag   int,                       -- 적용 정산주기(D+n)
  status        text not null default 'SCHEDULED', -- SCHEDULED / PAID / HOLD
  source        text default 'manual',     -- manual / crefia / codef
  memo          text,
  created_at    timestamptz default now()
);

create index if not exists idx_card_settlement_tenant_depdate
  on card_settlement (company_id, deposit_date);
create index if not exists idx_card_settlement_tenant_saledate
  on card_settlement (company_id, sale_date);

-- 4) 접근 권한 (기존 프로젝트 정책과 동일: RLS off + anon/authenticated grant)
alter table kr_holiday            disable row level security;
alter table card_settlement_rule  disable row level security;
alter table card_settlement       disable row level security;

grant select on kr_holiday to anon, authenticated;
grant select, insert, update, delete on card_settlement_rule to anon, authenticated;
grant select, insert, update, delete on card_settlement       to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

notify pgrst, 'reload schema';
