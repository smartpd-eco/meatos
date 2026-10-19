// daily-brief — Rev 1.2 "사장님은 앱을 안 열어도" 매일 아침 돈 브리핑 발송
//
// 동작
//   1) money_brief_subscription 중 지금 시각(한국시간)이 send_hour 이고 오늘 아직 안 보낸 구독을 찾는다.
//   2) 구독마다 meatos_money_brief(회사, 매장, 오늘) 로 숫자를 만든다.
//   3) 문자 한 통 분량의 브리핑 문구를 만들어 발송한다.
//   4) 성공하면 last_sent_on 을 오늘로 기록한다(하루 1회만 발송).
//
// 호출: pg_cron(매시 정각) → POST https://<project>.functions.supabase.co/daily-brief
//       헤더 x-cron-secret: <CRON_SECRET>   (없거나 다르면 401)
//       본문 {"dryRun":true} 이면 발송·기록 없이 문구만 돌려준다(미리보기).
//
// 발송 방식(BRIEF_SENDER)
//   log     — 기본값. 실제 발송 없이 결과만 반환(발송사 연결 전 안전 모드).
//   webhook — BRIEF_WEBHOOK_URL 로 {to, text, channel} 을 POST 한다.
//             문자/알림톡 발송사(솔라피·알리고·NHN 등)를 정한 뒤, 그 발송사 API를
//             이 함수 안 sendWebhook 자리에 직접 연결하거나 중계 URL을 지정한다.
//
// 시크릿: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
//         BRIEF_SENDER(선택), BRIEF_WEBHOOK_URL(선택), BRIEF_WEBHOOK_TOKEN(선택), APP_URL(선택)

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type Brief = {
  day: string;
  yesterday: { amount: number; count: number };
  lastWeekSameDay: { amount: number };
  month: { sales: number; purchases: number };
  unmapped: { count: number; amount: number };
  cardDeposits: { hasData: boolean; next7Days: number; days: { date: string; amount: number }[] };
  expirySoon: number;
};

type Subscription = {
  id: string;
  company_id: string;
  store_id: string | null;
  phone: string;
  channel: string;
  send_hour: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const won = (value: number) => Math.round(Number(value) || 0).toLocaleString("ko-KR") + "원";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function kstNow() {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = shifted.toISOString().slice(0, 10);
  return { day, hour: shifted.getUTCHours() };
}

function shortDate(iso: string) {
  const date = new Date(iso + "T00:00:00Z");
  return (date.getUTCMonth() + 1) + "/" + date.getUTCDate() + "(" + WEEKDAY[date.getUTCDay()] + ")";
}

export function buildBriefText(storeName: string, brief: Brief, appUrl: string) {
  const lines: string[] = [];
  lines.push("[정육비서] " + (storeName ? storeName + " · " : "") + shortDate(brief.day) + " 아침 브리핑");
  const y = Number(brief.yesterday?.amount) || 0;
  const lastWeek = Number(brief.lastWeekSameDay?.amount) || 0;
  let compare = "";
  if (lastWeek > 0) {
    const rate = Math.round(((y - lastWeek) / lastWeek) * 100);
    compare = " (지난주 같은 요일 대비 " + (rate >= 0 ? "▲" : "▼") + Math.abs(rate) + "%)";
  }
  lines.push("어제 매출 " + won(y) + " · " + (brief.yesterday?.count || 0) + "건" + compare);

  if (brief.cardDeposits?.hasData) {
    lines.push("카드 입금 예정(7일) " + won(brief.cardDeposits.next7Days));
    (brief.cardDeposits.days || []).slice(0, 3).forEach((d) => lines.push(" · " + shortDate(d.date) + " " + won(d.amount)));
  }

  const monthSales = Number(brief.month?.sales) || 0;
  const monthPurchases = Number(brief.month?.purchases) || 0;
  lines.push("이번 달 매출 " + won(monthSales) + (monthPurchases > 0 ? " / 매입 " + won(monthPurchases) : ""));

  if ((brief.unmapped?.count || 0) > 0) {
    lines.push("품목 미지정 매출 " + brief.unmapped.count + "건 — 앱에서 한 번만 지정해 주세요");
  }
  if ((brief.expirySoon || 0) > 0) lines.push("유통기한 임박 " + brief.expirySoon + "건");
  if (appUrl) lines.push(appUrl);
  return lines.join("\n");
}

async function sendMessage(to: string, text: string, channel: string): Promise<{ ok: boolean; error?: string }> {
  const sender = (Deno.env.get("BRIEF_SENDER") || "log").toLowerCase();
  if (sender === "log") return { ok: true };
  if (sender === "webhook") {
    const url = Deno.env.get("BRIEF_WEBHOOK_URL");
    if (!url) return { ok: false, error: "BRIEF_WEBHOOK_URL_MISSING" };
    const token = Deno.env.get("BRIEF_WEBHOOK_TOKEN");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ to, text, channel }),
    });
    return response.ok ? { ok: true } : { ok: false, error: "WEBHOOK_HTTP_" + response.status };
  }
  return { ok: false, error: "UNKNOWN_SENDER_" + sender };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ ok: false, error: "POST_ONLY" }, 405);

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 500);
  const appUrl = Deno.env.get("APP_URL") || "https://meatos.vercel.app/brief";
  const headers = { apikey: serviceKey, authorization: "Bearer " + serviceKey, "content-type": "application/json" };

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; hour?: number };
  const dryRun = Boolean(body.dryRun);
  const now = kstNow();
  const hour = Number.isInteger(body.hour) ? Number(body.hour) : now.hour;

  const subsResponse = await fetch(
    url + "/rest/v1/money_brief_subscription?enabled=eq.true&send_hour=eq." + hour +
      "&or=(last_sent_on.is.null,last_sent_on.lt." + now.day + ")" +
      "&select=id,company_id,store_id,phone,channel,send_hour&limit=500",
    { headers },
  );
  if (!subsResponse.ok) return json({ ok: false, error: "SUBSCRIPTION_READ_FAILED_" + subsResponse.status }, 500);
  const subscriptions = await subsResponse.json() as Subscription[];

  const results: unknown[] = [];
  for (const sub of subscriptions) {
    try {
      const briefResponse = await fetch(url + "/rest/v1/rpc/meatos_money_brief", {
        method: "POST",
        headers,
        body: JSON.stringify({ p_company_id: sub.company_id, p_store_id: sub.store_id, p_day: now.day }),
      });
      if (!briefResponse.ok) throw new Error("BRIEF_FAILED_" + briefResponse.status);
      const brief = await briefResponse.json() as Brief;

      const companyResponse = await fetch(url + "/rest/v1/company?id=eq." + sub.company_id + "&select=name", { headers });
      const companies = companyResponse.ok ? await companyResponse.json() as { name?: string }[] : [];
      const text = buildBriefText(companies[0]?.name || "", brief, appUrl);

      // 발송사 연결 전(log)에는 보낸 것으로 기록하지 않는다 → 연결 후 같은 날 정상 발송 가능.
      if (dryRun || (Deno.env.get("BRIEF_SENDER") || "log").toLowerCase() === "log") {
        results.push({ id: sub.id, dryRun: true, text });
        continue;
      }

      const sent = await sendMessage(sub.phone, text, sub.channel);
      await fetch(url + "/rest/v1/money_brief_subscription?id=eq." + sub.id, {
        method: "PATCH",
        headers,
        body: JSON.stringify(sent.ok
          ? { last_sent_on: now.day, last_error: null, updated_at: new Date().toISOString() }
          : { last_error: sent.error || "SEND_FAILED", updated_at: new Date().toISOString() }),
      });
      results.push({ id: sub.id, ok: sent.ok, error: sent.error });
    } catch (error) {
      results.push({ id: sub.id, ok: false, error: String((error as Error)?.message || error) });
    }
  }

  return json({ ok: true, day: now.day, hour, dryRun, count: subscriptions.length, results });
});
