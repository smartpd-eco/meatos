-- =====================================================================
-- Phase 3 운영 자동화 — 월 파티션 자동생성(pg_cron) + 5년 보관/아카이브 도우미
-- 데이터 변경 없음. 재실행 안전.
-- 사전조건: pg_cron 확장. (Supabase: Dashboard→Database→Extensions에서
--           pg_cron 이 꺼져 있으면 켠 뒤 이 스크립트를 실행하세요.)
-- =====================================================================

create extension if not exists pg_cron;

-- 향후 파티션 자동 보장 래퍼 (이번달부터 4개월치)
create or replace function public.meatos_maintain_partitions()
returns void language plpgsql as $$
begin
  perform public.ensure_month_partitions('sales_record',       date_trunc('month', now())::date, 4);
  perform public.ensure_month_partitions('inventory_movement', date_trunc('month', now())::date, 4);
end $$;

-- 지금 한 번 실행(당장 몇 달치 확보)
select public.meatos_maintain_partitions();

-- 매월 1일 00:10 자동 실행 등록 (동일 이름 있으면 먼저 해제)
do $$ begin
  perform cron.unschedule('meatos-monthly-partitions');
exception when others then null;
end $$;
select cron.schedule('meatos-monthly-partitions', '10 0 1 * *',
                     'select public.meatos_maintain_partitions();');

-- ── 5년 보관 아카이브 도우미 (분리 대상 파티션 "조회"만, 삭제는 수동) ──
-- 5년(=60개월) 이전 월 파티션 목록을 반환. 매년 이걸로 확인 후
-- detach → pg_dump 백업 → drop(또는 콜드 스토리지 이관) 진행.
create or replace function public.meatos_archivable_partitions(p_years int default 5)
returns table(parent text, partition text, month text) language sql as $$
  select p.relname::text, c.relname::text, right(c.relname, 7)
  from pg_inherits i
  join pg_class c on c.oid = i.inhrelid
  join pg_class p on p.oid = i.inhparent
  where p.relname in ('sales_record','inventory_movement')
    and c.relname ~ '_[0-9]{4}_[0-9]{2}$'
    and to_date(right(c.relname, 7), 'YYYY_MM')
        < (date_trunc('month', now()) - make_interval(months => p_years * 12))::date
  order by 1, 2;
$$;

-- =====================================================================
-- 사용/검증:
--   select * from cron.job;                         -- 등록된 잡 확인
--   select public.meatos_archivable_partitions(5);  -- 5년 지난 파티션 목록(현재는 없음)
--
-- 매년 아카이브 예시(수동, 신중히):
--   -- 1) 대상 확인:  select * from public.meatos_archivable_partitions(5);
--   -- 2) 분리:       alter table public.inventory_movement detach partition public.inventory_movement_2021_01;
--   -- 3) 백업(pg_dump) 후:  drop table public.inventory_movement_2021_01;  (또는 archive 스키마로 이동)
-- =====================================================================
