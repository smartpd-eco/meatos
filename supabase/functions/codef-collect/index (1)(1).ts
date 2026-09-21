// CODEF(쿠콘) 카드매출 자동수집 — 여신협회 통합조회(승인/매입/입금) → card_settlement 적재
// 원칙: MEATOS는 카드 자격증명을 저장하지 않는다. merchant_card_link의 connectedId만 사용한다.
// 시크릿(Supabase): CODEF_CLIENT_ID, CODEF_CLIENT_SECRET, (선택) CODEF_HOST/CODEF_ORG/CODEF_PATH_*
// ※ 엔드포인트 경로·기관코드·응답 필드명은 CODEF 데모 콘솔에서 최종 확인 후 env로 맞춘다(아래 CONFIG 참고).
import { requireTenantMembership } from "../_shared/tenant-auth.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), "content-type": "application/json" } });
}

// ── CONFIG (데모 콘솔에서 확인 후 env로 덮어쓰기) ─────────────────────────
const CFG = {
  host: Deno.env.get("CODEF_HOST") || "https://development.codef.io", // 데모: development, 운영: https://api.codef.io
  org: Deno.env.get("CODEF_ORG") || "",                                // 여신협회 기관코드(데모에서 확인)
  // 여신협회 상품 경로(예시 — 데모 가이드로 확정). 입금내역이 입금예정 화면에 가장 직접적.
  pathDeposit: Deno.env.get("CODEF_PATH_DEPOSIT") || "/v1/kr/card/na/lookup/deposit-list",
  pathApproval: Deno.env.get("CODEF_PATH_APPROVAL") || "/v1/kr/card/na/lookup/approval-list"
};

const CARD_ALIASES: [RegExp, string][] = [
  [/신한/, "신한"], [/삼성/, "삼성"], [/(KB|국민)/i, "KB국민"], [/현대/, "현대"], [/롯데/, "롯데"],
  [/(BC|비씨)/i, "BC"], [/하나/, "하나"], [/우리/, "우리"], [/(NH|농협)/i, "NH농협"]
];
function normCard(s: string): string {
  const t = String(s || "").replace(/카드/g, "").trim();
  for (const [re, name] of CARD_ALIASES) { if (re.test(t) || re.test(String(s))) return name; }
  return t || "기타";
}
function toNum(v: unknown): number { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
function toDate(v: unknown): string {
  const m = String(v ?? "").match(/(20\d{2})[.\-\/]?(\d{2})[.\-\/]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function ymd(d: string): string { return d.replace(/-/g, ""); } // YYYYMMDD

// CODEF 응답은 URL-인코딩된 JSON인 경우가 있어 디코드 후 파싱한다.
function parseCodef(text: string): any {
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  try { return JSON.parse(decodeURIComponent(text)); } catch { return null; }
}

async function codefToken(): Promise<string> {
  const id = Deno.env.get("CODEF_CLIENT_ID") || "";
  const secret = Deno.env.get("CODEF_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("CODEF_CLIENT_ID/SECRET 미설정");
  const basic = btoa(`${id}:${secret}`);
  const r = await fetch("https://oauth.codef.io/oauth/token?grant_type=client_credentials&scope=read", {
    method: "POST",
    headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }
  });
  const body = parseCodef(await r.text());
  const token = body && (body.access_token || body.accessToken);
  if (!token) throw new Error("CODEF 토큰 발급 실패");
  return token as string;
}

async function codefCall(token: string, path: string, payload: Record<string, unknown>): Promise<any> {
  const r = await fetch(CFG.host + path, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseCodef(await r.text());
}

// CODEF data 행 → card_settlement 행. 필드명은 res-계열(데모에서 최종 확인) + 폴백.
function mapRow(row: Record<string, any>, connId: string): Record<string, unknown> | null {
  const card = normCard(row.resCardName || row.resCardCompanyName || row.resCard || row.cardName || "");
  const sale = toDate(row.resUsedDate || row.resSalesDate || row.resApprovalDate || row.resDate || "");
  const approve = toNum(row.resTotalAmount || row.resUsedAmount || row.resSalesAmount || row.resApprovalAmount || row.approveAmount);
  const fee = toNum(row.resFee || row.resCommission || row.feeAmount);
  const ddate = toDate(row.resPaymentDate || row.resDepositDate || row.resScheduledDate || "");
  const damt = toNum(row.resPaymentAmount || row.resDepositAmount || row.resScheduledAmount);
  if (!card || (!sale && !ddate)) return null;
  const saleDate = sale || ddate;
  const depositDate = ddate || sale;
  const depositAmt = damt > 0 ? damt : (approve - fee);
  const extKey = ["codef", connId, card, saleDate, approve, depositDate].join("|");
  return {
    card_company: card, sale_date: saleDate, approve_amt: approve || depositAmt,
    fee_rate: (approve > 0 && fee > 0) ? Math.round(fee / approve * 10000) / 100 : 0,
    fee_amt: fee, deposit_amt: depositAmt, deposit_date: depositDate,
    status: "SCHEDULED", source: "codef", external_key: extKey
  };
}
function extractRows(resp: any): Record<string, any>[] {
  if (!resp) return [];
  const d = resp.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.resList)) return d.resList;
  if (d && Array.isArray(d.list)) return d.list;
  if (d && typeof d === "object") return [d];
  return [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const linkId = body.linkId;
  const startDate = String(body.startDate || "").slice(0, 10);
  const endDate = String(body.endDate || "").slice(0, 10);
  const debug = Boolean(body.debug);
  if (!linkId || !startDate || !endDate) return json({ ok: false, error: "linkId·startDate·endDate 필요" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service) return json({ ok: false, error: "SUPABASE_ENV_MISSING" }, 503);
  const svcHeaders = { "apikey": service, "Authorization": `Bearer ${service}`, "Content-Type": "application/json" };

  // 1) 연결 정보 로드
  const linkResp = await fetch(`${url}/rest/v1/merchant_card_link?id=eq.${encodeURIComponent(linkId)}&select=*`, { headers: svcHeaders });
  const links = await linkResp.json().catch(() => []);
  const link = Array.isArray(links) ? links[0] : null;
  if (!link) return json({ ok: false, error: "LINK_NOT_FOUND" }, 404);
  if (link.status !== "ACTIVE") return json({ ok: false, error: "LINK_REVOKED" }, 409);

  // 2) 호출자 권한 검증(해당 테넌트 소속인지)
  const membership = await requireTenantMembership(request, link.company_id);
  if (!membership.ok) return json({ ok: false, error: membership.message }, membership.status);

  // 3) CODEF 조회
  let token: string;
  try { token = await codefToken(); } catch (e) { return json({ ok: false, error: String((e as Error).message) }, 502); }

  const base = { connectedId: link.connected_id, organization: CFG.org || undefined, startDate: ymd(startDate), endDate: ymd(endDate) };
  let raw: any = null, rows: Record<string, unknown>[] = [];
  try {
    const deposit = await codefCall(token, CFG.pathDeposit, base);
    let list = extractRows(deposit);
    // 입금 상품이 비면 승인 상품으로 보완
    if (!list.length) { const appr = await codefCall(token, CFG.pathApproval, base); list = extractRows(appr); raw = debug ? { deposit, approval: appr } : null; }
    else raw = debug ? { deposit } : null;
    const map = new Map<string, Record<string, unknown>>();
    for (const r of list) { const m = mapRow(r, link.connected_id); if (m) map.set(String(m.external_key), m); }
    rows = [...map.values()].map((m) => ({ ...m, company_id: link.company_id, store_id: link.store_id || null, memo: "CODEF 자동수집" }));
  } catch (e) {
    return json({ ok: false, error: "CODEF_CALL_FAILED: " + String((e as Error).message) }, 502);
  }

  if (debug) return json({ ok: true, debug: true, parsedCount: rows.length, sample: rows.slice(0, 3), rawSample: raw });

  // 4) 멱등 적재(external_key 충돌 시 병합)
  let saved = 0;
  if (rows.length) {
    const up = await fetch(`${url}/rest/v1/card_settlement?on_conflict=company_id,external_key`, {
      method: "POST",
      headers: { ...svcHeaders, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows)
    });
    if (!up.ok) return json({ ok: false, error: "SAVE_FAILED: " + (await up.text()).slice(0, 200) }, 500);
    const savedRows = await up.json().catch(() => []);
    saved = Array.isArray(savedRows) ? savedRows.length : rows.length;
  }
  // 5) 마지막 수집 시각 기록
  await fetch(`${url}/rest/v1/merchant_card_link?id=eq.${encodeURIComponent(linkId)}`, {
    method: "PATCH", headers: { ...svcHeaders, "Prefer": "return=minimal" },
    body: JSON.stringify({ last_collected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }).catch(() => {});

  return json({ ok: true, collected: rows.length, saved, period: { startDate, endDate } });
});
