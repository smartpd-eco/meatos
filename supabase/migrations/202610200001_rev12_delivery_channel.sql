-- =====================================================================
-- Rev 1.2 · 202610200001 · 배달·온라인 매출을 판매 스캔으로 기록
--
-- 매장 판매는 POS 에이전트가 자동으로 기록한다(record_pos_sale_agent).
-- POS를 거치지 않는 쿠팡이츠·배민·자사몰 주문은 저울 라벨을 휴대폰 "판매 스캔"에서
-- 채널을 골라 찍으면 같은 방식(매출 + 재고)으로 기록된다.
--
-- ① record_channel_scan_sale : 채널 지정 판매 스캔
--    - 같은 라벨이 최근 2시간 안에 POS에서 이미 기록됐으면 막고 확인을 받는다(이중 매출 방지).
-- ② get_channel_sales        : 오늘·이번 달 채널별 매출 + 이중 기록 의심 목록
--
-- 원칙: 기존 함수·데이터를 바꾸지 않는 additive 마이그레이션. 재실행 안전.
-- 채널 코드는 매출현황 화면과 같다: STORE, COUPANG, BAEMIN, YOGIYO, MEATBONGA, ETC
-- =====================================================================

create index if not exists sales_record_barcode_recent_idx
  on public.sales_record (tenant_id, barcode, sold_at desc)
  where barcode is not null;

-- ─────────────────────────────────────────────────────────────────────
-- ① 채널 지정 판매 스캔 (로그인 사용자)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.record_channel_scan_sale(
  p_barcode text,
  p_channel text default 'STORE',
  p_quantity numeric default null,
  p_sale_amount numeric default null,
  p_external_transaction_id text default null,
  p_allow_pos_duplicate boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
  normalized_channel text := upper(coalesce(nullif(trim(coalesce(p_channel, '')), ''), 'STORE'));
  normalized_barcode text := trim(coalesce(p_barcode, ''));
  channel_label text;
  recent record;
  result jsonb;
begin
  select * into ws from public.meatos_current_workspace();

  if normalized_channel not in ('STORE', 'COUPANG', 'BAEMIN', 'YOGIYO', 'MEATBONGA', 'ETC') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CHANNEL');
  end if;
  channel_label := case normalized_channel
    when 'COUPANG' then '쿠팡이츠' when 'BAEMIN' then '배달의민족' when 'YOGIYO' then '요기요'
    when 'MEATBONGA' then '정육본가' when 'ETC' then '기타 온라인' else '매장' end;

  -- 이중 매출 방지: 같은 라벨(바코드 13자리 = 품목+금액)이 최근 2시간 안에 POS에서 기록됐는가
  if normalized_channel <> 'STORE' and not coalesce(p_allow_pos_duplicate, false) then
    select s.sold_at, s.amount into recent
      from public.sales_record s
     where s.tenant_id = ws.company_id
       and s.store_id is not distinct from ws.store_id
       and s.barcode = normalized_barcode
       and s.source = 'local-agent'
       and not coalesce(s.is_cancelled, false)
       and s.sold_at >= now() - interval '2 hours'
     order by s.sold_at desc
     limit 1;
    if found then
      return jsonb_build_object('ok', false, 'error', 'POS_ALREADY_RECORDED',
        'soldAt', recent.sold_at, 'amount', recent.amount);
    end if;
  end if;

  result := public.meatos_record_scan_sale(
    ws.company_id, ws.company_id, ws.store_id,
    p_barcode, p_quantity, p_sale_amount, now(),
    coalesce(nullif(trim(coalesce(p_external_transaction_id, '')), ''), 'WEB-' || gen_random_uuid()::text),
    'WEB', 'web-scan'
  );

  if normalized_channel <> 'STORE'
     and coalesce((result ->> 'ok')::boolean, false)
     and nullif(result ->> 'saleId', '') is not null then
    update public.sales_record
       set channel = normalized_channel,
           memo = channel_label || ' 스캔 판매'
     where id = (result ->> 'saleId')::uuid
       and tenant_id = ws.company_id;
  end if;

  return result || jsonb_build_object('channel', normalized_channel);
end;
$$;

alter function public.record_channel_scan_sale(text,text,numeric,numeric,text,boolean) owner to postgres;
revoke all on function public.record_channel_scan_sale(text,text,numeric,numeric,text,boolean) from public, anon;
grant execute on function public.record_channel_scan_sale(text,text,numeric,numeric,text,boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- ② 채널별 매출 + 이중 기록 의심 (오늘의 돈 화면용)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_channel_sales(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ws record;
  d date := coalesce(p_day, (now() at time zone 'Asia/Seoul')::date);
  month_start date := date_trunc('month', coalesce(p_day, (now() at time zone 'Asia/Seoul')::date))::date;
  result jsonb;
begin
  select * into ws from public.meatos_current_workspace();

  with base as (
    select id, sale_date, channel, amount, barcode, source, sold_at
      from public.sales_record
     where company_id = ws.company_id
       and store_id is not distinct from ws.store_id
       and not coalesce(is_cancelled, false)
       and sale_date between month_start and d
  ),
  dup as (
    select w.id, w.barcode, w.amount, w.channel, w.sold_at, p.sold_at as pos_sold_at
      from base w
      join lateral (
        select b.sold_at
          from base b
         where b.barcode = w.barcode
           and b.source = 'local-agent'
           and b.sale_date between d - 1 and d
           and abs(extract(epoch from (b.sold_at - w.sold_at))) <= 7200
         limit 1
      ) p on true
     where w.sale_date = d
       and w.source = 'web-scan'
       and w.channel <> 'STORE'
       and w.barcode is not null
     order by w.sold_at desc
     limit 20
  )
  select jsonb_build_object(
    'day', d,
    'today', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'count', cnt, 'amount', amt) order by amt desc)
                         from (select channel, count(*) as cnt, sum(amount) as amt from base where sale_date = d group by channel) t), '[]'::jsonb),
    'month', coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'count', cnt, 'amount', amt) order by amt desc)
                         from (select channel, count(*) as cnt, sum(amount) as amt from base group by channel) t), '[]'::jsonb),
    'possibleDuplicates', coalesce((select jsonb_agg(jsonb_build_object(
                         'saleId', id, 'barcode', barcode, 'amount', amount, 'channel', channel,
                         'soldAt', sold_at, 'posSoldAt', pos_sold_at)) from dup), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

alter function public.get_channel_sales(date) owner to postgres;
revoke all on function public.get_channel_sales(date) from public, anon;
grant execute on function public.get_channel_sales(date) to authenticated;
