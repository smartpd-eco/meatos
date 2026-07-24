-- =====================================================================
-- 매출 채널 구분 — 매장POS / 쿠팡이츠 / 정육본가 / 기타 통합 관리
-- sales_record 는 파티션 테이블(부모)이라 컬럼 추가가 자식 파티션에 전파됨.
-- 데이터 변경 없음(기존 행은 기본값 STORE). RLS off·anon 접근은 기존과 동일.
-- =====================================================================

alter table public.sales_record
  add column if not exists channel text not null default 'STORE';
  -- 값: STORE(매장/POS) · COUPANG(쿠팡이츠) · MEATBONGA(정육본가) · ETC(기타)

create index if not exists sales_record_channel_idx
  on public.sales_record (company_id, channel, sale_date desc);

-- 검증:
--   select channel, count(*), sum(amount) from public.sales_record group by channel;
-- =====================================================================
