-- =====================================================================
-- 신규/재생성 테이블 anon(앱) 접근 복구
-- 증상: 파티션 재생성·신규 테이블 생성 후, 앱(anon 키)에서 재고/매출/요약이
--       0건으로 보임(권한 미부여). postgres(SQL편집기)로는 데이터 정상 존재.
-- 조치: 프로젝트 정책(anon 직접접근 + RLS off)에 맞춰 권한 일괄 부여 + RLS off.
-- 데이터 변경 없음. 재실행 안전.
-- =====================================================================

-- anon/authenticated 에 public 스키마 전체 접근 부여 (기존 정책과 동일)
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- 향후 새로 만드는 테이블/시퀀스도 자동 부여
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- 새로 만든/재생성된 테이블 RLS 비활성 재보장
alter table public.company                 disable row level security;
alter table public.store                   disable row level security;
alter table public.sales_record            disable row level security;
alter table public.inventory_movement      disable row level security;
alter table public.daily_sales_summary     disable row level security;
alter table public.monthly_sales_summary   disable row level security;
alter table public.daily_purchase_summary  disable row level security;
alter table public.monthly_purchase_summary disable row level security;
alter table public.inventory_summary       disable row level security;

-- PostgREST 스키마 캐시 새로고침
notify pgrst, 'reload schema';

-- 검증(앱 새로고침 후 재고가 보이면 완료):
--   select has_table_privilege('anon','public.inventory_movement','SELECT') as anon_can_read;  -- true
--   select relname, relrowsecurity from pg_class where relname in ('inventory_movement','company');  -- relrowsecurity=false
