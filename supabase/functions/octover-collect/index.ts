// Octover(더즌) 카드매출 입금내역 자동수집 — 여신금융협회 통합조회(K005) → card_settlement 적재
//
// v2 (2026-09-15): 옥토버 영업 담당자(김명규)와 통화로 확인된 실제 사용 방식 반영.
//   - 여신협회 통합조회는 조회할 때마다 ID/PW를 새로 받는 게 아니라, "최초 1회만 입력/가입" 후
//     그 계정을 계속 재사용하는 구조다. 그래서 이 함수는 세 가지 동작(action)을 지원한다:
//     1) "register" — 이미 여신협회 통합조회 계정이 있는 매장: ID/PW를 최초 1회 등록.
//     2) "signup"   — 계정이 없는 매장: 옥토버 MM001(회원가입)+MM002(가맹점정보입력)로 그 자리에서
//                      신규 가입시키고, 새로 만든 ID/PW를 등록.
//     3) "query"(기본) — 등록해 둔 계정으로 매입내역(AC001) 조회 → card_settlement 적재.
//   - 원문 비밀번호는 절대 저장하지 않는다. register/signup 시점에 옥토버 공개키로 RSA-OAEP
//     암호화한 결과("doznenc_..." 문자열)만 merchant_octover_account.octover_pw_enc에 저장하고,
//     이후 query 때는 그 암호문을 그대로 재전송한다(원문을 다시 만들 필요가 없음 — RSA-OAEP
//     암호문은 같은 평문·같은 공개키로 여러 번 계산해도 전부 유효하게 복호화되므로, 한 번
//     계산해 둔 암호문을 계속 재사용해도 안전하다).
//   - merchant_octover_account 테이블은 anon/authenticated에 공개하지 않는다(암호문도 그 자체로
//     옥토버 인증에 재사용 가능한 값이라 다른 회사가 읽으면 안 됨). 이 함수만 SERVICE_ROLE_KEY로
//     접근한다.
//
// v3 (2026-09-16): 옥토버가 보내준 "여신금융협회 개발가이드"(공식 PDF, 2026.09.15자)와
// "고객 인증 정보 관리(Cert Manager)" 가이드(developer.octover.co.kr) 대조 후 수정.
//   1) [확인 완료] MM001/MM002(회원가입) 호출에는 idLogin이 필요 없다 — 공식 문서의 Request
//      Input Sample에 idLogin 블록이 전혀 없음을 확인. 기존에 "미검증 가정"으로 남겨뒀던
//      SIGNUP_REQUIRES_IDLOGIN 분기를 제거하고 항상 idLogin 없이 호출하도록 확정.
//   2) [버그 수정 — 중요] query 액션이 지금까지 AD001(입금내역 조회)을 호출하고 있었는데, 이
//      API는 "이미 실제로 입금이 끝난" 내역을 입금일 기준으로 집계(건수·합계)해서 주는 API라
//      개별 매출 단위 데이터가 아니고, 그래서 모든 행을 status:"PAID"로 저장하고 있었다 —
//      "카드 입금예정" 페이지의 캘린더/KPI는 status!=="PAID"인 행만 예정 합계로 잡기 때문에
//      옥토버로 수집한 데이터가 전부 예정 화면에서 빠지는 심각한 버그였다. 여신협회 가이드의
//      AC001(매입내역 조회, 기간별)로 교체했다 — 이 API는 거래 건별로 매입금액(pcaAmt)·
//      수수료(fee)·지급금액(pymAmt)·지급예정일(pymScdDate)을 그대로 주기 때문에 card_settlement
//      스키마(approve_amt/fee_amt/deposit_amt/deposit_date)와 정확히 대응된다. 필드명 오타
//      (row.pcaAmnt → 실제로는 row.pcaAmt)도 이번에 같이 고쳤다.
//   3) [개선] idLogin에 계정에 저장된 biz_no가 있으면 bizNo로 같이 보낸다 — 통합조회 계정에
//      사업자(가맹점)가 2개 이상 걸려있는 경우 여신협회 가이드상 bizNo가 필수이기 때문.
//   4) [보류 — 확인 필요] 옥토버의 "인증정보 관리(Cert Manager)" 시스템(TOKEN 발급 →
//      tbScCustAuth/insert 로 인증정보 등록 → tbScCustAuthMdulRel/insert 로 모듈 연결 →
//      custId/authUid/mdulCustCd로 엔진 호출)은 검토했지만, 엔진 호출 시 custId/authUid/
//      mdulCustCd를 기존 in.apiKey+in.idLogin 구조에 정확히 어떻게 병합해서 보내는지(예:
//      apiKey는 계속 필요한지, module 필드에 mdulCustCd를 넣는지 등) 문서에 구체적인 예시
//      JSON이 없어 확정할 수 없었다. 지금 쓰는 idLogin(id + RSA암호화pw) 직접 호출 방식은
//      "여신금융협회 개발가이드" 공식 PDF에 정확히 그 형태로 문서화되어 있고 우리 쪽 암호화
//      방식도 Cert Manager가 요구하는 것과 동일(RSA 암호화 후 doznenc_ 접두)하므로, 추측으로
//      구조를 바꿔 배포하기보다 지금 방식을 유지했다. Cert Manager로 넘어가면 우리 DB에는
//      암호문조차 남기지 않고 custId/authUid 참조값만 남길 수 있어 더 안전해지므로, 김근영
//      매니저에게 "엔진 호출 시 custId/authUid/mdulCustCd를 넣은 실제 요청 예시(JSON)"를
//      한 번 요청해서 받으면 그 다음 버전에서 전환하는 게 좋다.
//
// 시크릿(Supabase):
//   OCTOVER_API_KEY     - Octover 어드민 > API 관리에서 발급받은 API KEY (in.apiKey)
//   OCTOVER_PUBLIC_KEY  - Octover 어드민 > API 관리 > 계정 설정에서 확인하는 PUBLIC KEY (PEM, RSA 암호화용)
//   OCTOVER_HOST        - 선택. 기본값 운영(https://octover.co.kr/otvapi). 테스트 시 https://dev.octover.co.kr/otvapi
//
// 절대 하지 않는 것: 원문 비밀번호를 DB에 쓰거나 console.log/debug 응답에 포함시키는 것.
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

const CFG = {
  host: Deno.env.get("OCTOVER_HOST") || "https://octover.co.kr/otvapi",
  module: "CS1002N" // 여신금융협회 통합조회 모듈 코드
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
function ymd(d: string): string { return d.replace(/-/g, ""); }
function toIsoDate(v: unknown): string {
  const m = String(v ?? "").match(/(20\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

// ── RSA-OAEP(SHA-256) 암호화 ─────────────────────────────────────────────
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function octoverEncrypt(plainText: string): Promise<string> {
  const publicKeyPem = Deno.env.get("OCTOVER_PUBLIC_KEY") || "";
  if (!publicKeyPem) throw new Error("OCTOVER_PUBLIC_KEY 미설정");
  const key = await crypto.subtle.importKey("spki", pemToDer(publicKeyPem), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const cipherBuf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(plainText));
  return "doznenc_" + bufToBase64(cipherBuf);
}

async function octoverCall(payload: Record<string, unknown>): Promise<any> {
  const r = await fetch(CFG.host, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return await r.json().catch(() => null);
}

// AC001(매입내역 조회, 기간별) 응답 1건 → card_settlement 1행.
// 실제 필드명(옥토버 "여신금융협회 개발가이드" 2026.09.15자 PDF 기준):
//   tranDate(거래일자) pcaDate(매입일자) authNo(승인번호) cardNm(카드사) cardClss(카드종류)
//   pcaAmt(매입금액) basicFee/pointFee/etcFee(수수료 세부) fee(수수료합계) vatFee(부가세대리납부액)
//   pymAmt(지급금액) pymScdDate(지급예정일) merNo(가맹점번호)
function mapRow(row: Record<string, any>, companyId: string, storeId: string | null): Record<string, unknown> | null {
  const card = normCard(row.cardNm);
  const saleDate = toIsoDate(row.tranDate);
  if (!card || !saleDate) return null;
  const approve = toNum(row.pcaAmt);
  const feeAmt = toNum(row.fee);
  const deposit = toNum(row.pymAmt);
  const depositDate = toIsoDate(row.pymScdDate) || saleDate;
  const authNo = String(row.authNo || "");
  const merNo = String(row.merNo || "");
  // authNo(승인번호)는 거래 단위로 유일하므로 이걸 우선 키로 쓴다. 없는 경우에만 조합키로 대체.
  const extKey = ["octover", merNo, authNo || [card, saleDate, approve, deposit].join("_")].join("|");
  const today = new Date().toISOString().slice(0, 10);
  // 지급예정일이 이미 지났으면 실제로 입금됐을 가능성이 높으므로 PAID로, 아니면 SCHEDULED(예정)로 저장한다.
  // 확정 여부는 사장님이 "입금완료" 버튼으로 언제든 직접 정정할 수 있다.
  const status = depositDate <= today ? "PAID" : "SCHEDULED";
  return {
    company_id: companyId, store_id: storeId, card_company: card, sale_date: saleDate,
    approve_amt: approve, fee_rate: approve > 0 ? Math.round((feeAmt / approve) * 10000) / 100 : 0,
    fee_amt: feeAmt, deposit_amt: deposit || (approve - feeAmt), deposit_date: depositDate, deposit_lag: 0,
    status, source: "octover", external_key: extKey, memo: "Octover 자동수집(매입내역 조회)"
  };
}

function storeFilterQS(storeId: string | null): string {
  return storeId ? `&store_id=eq.${encodeURIComponent(storeId)}` : "&store_id=is.null";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const action = String(body.action || "query");
  const companyId = String(body.companyId || "");
  const storeId = body.storeId ? String(body.storeId) : null;
  if (!companyId) return json({ ok: false, error: "companyId 필요" }, 400);

  const membership = await requireTenantMembership(request, companyId);
  if (!membership.ok) return json({ ok: false, error: membership.message }, membership.status);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ ok: false, error: "SUPABASE_ENV_MISSING" }, 503);
  const svcHeaders = { "apikey": service, "Authorization": `Bearer ${service}`, "Content-Type": "application/json" };
  const apiKey = Deno.env.get("OCTOVER_API_KEY") || "";
  if (!apiKey) return json({ ok: false, error: "OCTOVER_API_KEY 미설정" }, 503);

  // ── status: 이 매장에 연결된 옥토버 계정이 있는지 확인(민감정보 제외하고 반환) ──
  if (action === "status") {
    const r = await fetch(`${url}/rest/v1/merchant_octover_account?company_id=eq.${encodeURIComponent(companyId)}${storeFilterQS(storeId)}&status=eq.ACTIVE&select=octover_id,last_used_at,last_error,created_at&limit=1`, { headers: svcHeaders });
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return json({ ok: true, linked: !!row, octoverId: row?.octover_id || null, lastUsedAt: row?.last_used_at || null, lastError: row?.last_error || null });
  }

  // ── register: 기존 여신협회 통합조회 계정을 최초 1회 등록 ──
  if (action === "register") {
    const octoverId = String(body.octoverId || "").trim();
    const octoverPw = String(body.octoverPw || "");
    if (!octoverId || !octoverPw) return json({ ok: false, error: "octoverId·octoverPw 필요" }, 400);
    let encPw: string;
    try { encPw = await octoverEncrypt(octoverPw); } catch (e) { return json({ ok: false, error: "ENCRYPT_FAILED: " + String((e as Error).message) }, 500); }
    const row = { company_id: companyId, store_id: storeId, octover_id: octoverId, octover_pw_enc: encPw, biz_no: body.bizNo || null, status: "ACTIVE", updated_at: new Date().toISOString() };
    const up = await fetch(`${url}/rest/v1/merchant_octover_account?on_conflict=company_id,store_id`, {
      method: "POST", headers: { ...svcHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row)
    });
    if (!up.ok) return json({ ok: false, error: "SAVE_FAILED: " + (await up.text()).slice(0, 200) }, 500);
    return json({ ok: true, linked: true });
  }

  // ── signup: 옥토버 MM001(회원가입)+MM002(가맹점정보입력)로 신규 계정 생성 후 등록 ──
  if (action === "signup") {
    const wantId = String(body.wantId || "").trim();
    const wantPw = String(body.wantPw || "");
    const name = String(body.name || "").trim();
    const regNo7 = String(body.regNo7 || "").trim();       // 주민등록번호 앞 7자리(본인인증용)
    const email = String(body.email || "").trim();
    const phoneNum = String(body.phoneNum || "").trim();
    const telecomType = String(body.telecomType || "");
    const bizNo = String(body.bizNo || "").trim();
    const bubinNo = String(body.bubinNo || "").trim();
    const merchantName = String(body.merchantName || "").trim();
    const ownerName = String(body.ownerName || "").trim();
    const ownerBirth = String(body.ownerBirth || "").trim(); // YYMMDD
    const cardCd = String(body.cardCd || "");
    const bankCd = String(body.bankCd || "");
    const acctNo = String(body.acctNo || "").trim();
    if (!wantId || !wantPw || !name || !regNo7 || !email || !phoneNum || !telecomType) {
      return json({ ok: false, error: "회원가입 필수 항목(아이디·비밀번호·성명·주민번호 앞자리·이메일·휴대폰·통신사) 누락" }, 400);
    }
    if (!bizNo || !bubinNo || !merchantName || !ownerName || !ownerBirth || !cardCd || !bankCd || !acctNo) {
      return json({ ok: false, error: "가맹점 정보 필수 항목(사업자번호·법인번호·가맹점명·대표자명·대표자생년월일·카드사·결제은행·계좌번호) 누락" }, 400);
    }
    let encWantPw: string;
    try { encWantPw = await octoverEncrypt(wantPw); } catch (e) { return json({ ok: false, error: "ENCRYPT_FAILED: " + String((e as Error).message) }, 500); }

    // 1단계: MM001 회원가입 (공식 가이드 확인 결과 idLogin 불필요)
    const mm001In: Record<string, unknown> = { apiKey, MM001: { id: wantId, pw: encWantPw, name, regNo: regNo7, email, phoneNum, telecomType } };
    const mm001Resp = await octoverCall({ in: mm001In, jobs: { module: CFG.module, methods: ["MM001", "logout"] } });
    const mm001Code = mm001Resp?.out?.code;
    if (mm001Code !== "1000200") return json({ ok: false, error: `MM001_FAILED ${mm001Code}: ${mm001Resp?.out?.msg || ""}` }, 502);
    const encInput = mm001Resp?.out?.data?.MM001?.encInput;
    if (!encInput) return json({ ok: false, error: "MM001_NO_ENCINPUT" }, 502);

    // 2단계: MM002 가맹점정보입력 (MM001의 encInput 연계)
    const mm002In: Record<string, unknown> = {
      apiKey, MM002: { bizno: bizNo, bubinNo, mrntTxprDscmNm: merchantName, regRsvNm: ownerName, regRsvBirthDate: ownerBirth, cardCd, bankCd, acctNo, encInput }
    };
    const mm002Resp = await octoverCall({ in: mm002In, jobs: { module: CFG.module, methods: ["MM002", "logout"] } });
    const mm002Code = mm002Resp?.out?.code;
    if (mm002Code !== "1000200") return json({ ok: false, error: `MM002_FAILED ${mm002Code}: ${mm002Resp?.out?.msg || ""}` }, 502);

    // 가입 성공 → 방금 만든 계정을 저장(register와 동일하게)
    const row = { company_id: companyId, store_id: storeId, octover_id: wantId, octover_pw_enc: encWantPw, biz_no: bizNo, status: "ACTIVE", updated_at: new Date().toISOString() };
    const up = await fetch(`${url}/rest/v1/merchant_octover_account?on_conflict=company_id,store_id`, {
      method: "POST", headers: { ...svcHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row)
    });
    if (!up.ok) return json({ ok: false, error: "SAVE_FAILED: " + (await up.text()).slice(0, 200) }, 500);
    return json({ ok: true, linked: true, octoverId: wantId });
  }

  // ── query(기본): 저장된 계정으로 매입내역(AC001) 조회 → card_settlement 저장 ──
  const startDate = String(body.startDate || "").slice(0, 10);
  const endDate = String(body.endDate || "").slice(0, 10);
  const debug = Boolean(body.debug);
  if (!startDate || !endDate) return json({ ok: false, error: "startDate·endDate 필요" }, 400);

  const acctResp = await fetch(`${url}/rest/v1/merchant_octover_account?company_id=eq.${encodeURIComponent(companyId)}${storeFilterQS(storeId)}&status=eq.ACTIVE&select=*&limit=1`, { headers: svcHeaders });
  const acctRows = await acctResp.json().catch(() => []);
  const account = Array.isArray(acctRows) ? acctRows[0] : null;
  if (!account) return json({ ok: false, error: "OCTOVER_ACCOUNT_NOT_LINKED" }, 404);

  const requestPayload = {
    in: {
      apiKey,
      idLogin: { id: account.octover_id, pw: account.octover_pw_enc, ...(account.biz_no ? { bizNo: account.biz_no } : {}) },
      AC001: { inqrDtStrt: ymd(startDate), inqrDtEnd: ymd(endDate) },
      logout: {}
    },
    jobs: { module: CFG.module, methods: ["idLogin", "AC001", "logout"] }
  };
  let resp: any;
  try { resp = await octoverCall(requestPayload); } catch (e) { return json({ ok: false, error: "OCTOVER_CALL_FAILED: " + String((e as Error).message) }, 502); }

  const outCode = resp?.out?.code;
  const outMsg = resp?.out?.msg;
  const nowIso = new Date().toISOString();
  if (outCode && outCode !== "1000200") {
    await fetch(`${url}/rest/v1/merchant_octover_account?id=eq.${account.id}`, { method: "PATCH", headers: { ...svcHeaders, "Prefer": "return=minimal" }, body: JSON.stringify({ last_error: `${outCode}: ${outMsg || ""}`.slice(0, 200) }) }).catch(() => {});
    return json({ ok: false, error: `OCTOVER_ERROR ${outCode}: ${outMsg || ""}` }, 502);
  }

  const list = resp?.out?.data?.AC001?.data?.dataArray;
  const rowsRaw: Record<string, any>[] = Array.isArray(list) ? list : [];
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rowsRaw) { const m = mapRow(r, companyId, storeId); if (m) map.set(String(m.external_key), m); }
  const rows = [...map.values()];

  await fetch(`${url}/rest/v1/merchant_octover_account?id=eq.${account.id}`, { method: "PATCH", headers: { ...svcHeaders, "Prefer": "return=minimal" }, body: JSON.stringify({ last_used_at: nowIso, last_error: null }) }).catch(() => {});

  if (debug) return json({ ok: true, debug: true, outCode, outMsg, parsedCount: rows.length, sample: rows.slice(0, 3) });

  let saved = 0;
  if (rows.length) {
    const up = await fetch(`${url}/rest/v1/card_settlement?on_conflict=company_id,external_key`, {
      method: "POST", headers: { ...svcHeaders, "Prefer": "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows)
    });
    if (!up.ok) return json({ ok: false, error: "SAVE_FAILED: " + (await up.text()).slice(0, 200) }, 500);
    const savedRows = await up.json().catch(() => []);
    saved = Array.isArray(savedRows) ? savedRows.length : rows.length;
  }
  return json({ ok: true, collected: rows.length, saved, period: { startDate, endDate } });
});
