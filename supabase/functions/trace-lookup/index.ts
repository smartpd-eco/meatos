// 축산물통합이력정보 조회 프록시 (축산물품질평가원 OpenAPI)
// 이력번호 -> 사육/도축/유통 정보. 키는 EKAPE_TRACE_KEY 시크릿에서 읽는다.
const EKAPE_URL = "http://data.ekape.or.kr/openapi-data/service/user/animalTrace/traceNoSearch";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), "content-type": "application/json" } });
}

function decodeXml(buf: ArrayBuffer): string {
  const head = new TextDecoder("ascii").decode(buf.slice(0, 160));
  const m = head.match(/encoding=["']([^"']+)["']/i);
  const enc = (m ? m[1] : "utf-8").toLowerCase();
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
function parseTags(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const k = m[1], v = m[2].trim();
    if (v && !(k in out)) out[k] = v; // first non-empty wins
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  const key = Deno.env.get("EKAPE_TRACE_KEY") ?? "";
  if (!key) return json({ ok: false, message: "EKAPE_TRACE_KEY not configured" }, 503);

  const url = new URL(req.url);
  let traceNo = url.searchParams.get("traceNo") || "";
  if (req.method === "POST") { try { const b = await req.json(); traceNo = b.traceNo || traceNo; } catch { /* ignore */ } }
  traceNo = String(traceNo).trim();
  if (!traceNo) return json({ ok: false, message: "traceNo required" }, 400);

  const isLot = /^L/i.test(traceNo);
  const options = isLot ? [8, 9, 3] : [1, 3]; // 묶음: 기본+구성+도축 / 개체·이력: 사육+도축
  const merged: Record<string, string> = {};
  let anyData = false, lastMsg = "";
  for (const opt of options) {
    const q = `${EKAPE_URL}?serviceKey=${encodeURIComponent(key)}&traceNo=${encodeURIComponent(traceNo)}&optionNo=${opt}`;
    try {
      const r = await fetch(q);
      const tags = parseTags(decodeXml(await r.arrayBuffer()));
      if (tags.resultMsg) lastMsg = tags.resultMsg;
      const dataKeys = Object.keys(tags).filter((k) => k !== "resultCode" && k !== "resultMsg");
      if (dataKeys.length) { anyData = true; for (const k of dataKeys) if (!(k in merged)) merged[k] = tags[k]; }
    } catch (e) { lastMsg = e instanceof Error ? e.message : String(e); }
  }

  // 국내 이력이 없으면 수입(MEATWATCH) 조회로 폴백
  if (!anyData) {
    const sysId = Deno.env.get("MEATWATCH_SYS_ID") ?? "meatos2026";
    try {
      const mr = await fetch(`http://www.meatwatch.go.kr/rest/selectDistbHistInfoWsrvDetail/${encodeURIComponent(sysId)}/${encodeURIComponent(traceNo)}/list.do`);
      const mj = await mr.json();
      if (mj && String(mj.returnCode) === "0" && mj.distbIdntfcNo) {
        const range = (a?: string, b?: string) => [a, b].filter(Boolean).join(" ~ ");
        return json({
          ok: true, traceNo, source: "import", resultMsg: "수입 이력정보",
          info: {
            traceNo, kind: "수입", source: "import",
            itemNm: mj.kprodNm || "",
            species: mj.kprodNm || "",
            nationNm: mj.makeplcNm || "",
            partNm: mj.regnNm || "",
            butcheryPlaceNm: mj.butchNm || "",
            butcheryYmd: range(mj.butchfromDt, mj.butchtoDt),
            processPlaceNm: String(mj.prcssNm || "").replace(/^[,\s]+/, ""),
            processYmd: range(mj.prcssBeginDe, mj.prcssEndDe),
            exporterNm: mj.senderNm || "",
            importerNm: mj.receiverNm || "",
            blNo: mj.blNo || "",
            consumeYmd: range(mj.limitFromDt, mj.limitToDt),
            importDt: mj.applyDt || "",
            partCode: mj.regnCode || "",
            salePrhibt: mj.distbSlePrhibtAt || "",
            recallTarget: mj.rtrvlTrgetAt || "",
            recallContent: mj.rtrvlContent || ""
          },
          raw: mj
        });
      }
    } catch (e) { /* fall through to empty domestic result */ }
  }

  const f = merged;
  const info = {
    traceNo,
    kind: isLot ? "묶음번호" : "개체/이력번호",
    species: f.lsTypeNm || f.traceNoType || "",
    grade: f.gradeNm || "",
    insfat: f.insfat || "",
    weight: f.weight || "",
    birthYmd: f.birthYmd || f.regYmd || "",
    sexNm: f.sexNm || "",
    butcheryPlaceNm: f.butcheryPlaceNm || f.abattNm || "",
    butcheryPlaceAddr: f.butcheryPlaceAddr || f.add0R || "",
    butcheryYmd: f.butcheryYmd || f.rceptDt || "",
    butcheryResult: f.psexmYn || f.inspectPassYn || "",
    farmAddr: f.farmAddr || "",
    farmId: f.farmNo || f.farmUniqueNo || f.farmIdentNo || "",
    farmerNm: f.farmerNm || f.frmrNm || f.mngrNm || "",
    processPlaceNm: f.processPlaceNm || f.entrpNm || "",
    processPlaceAddr: f.processPlaceAddr || f.entrpAddr || "",
    nationNm: f.nationNm || ""
  };
  return json({ ok: anyData, traceNo, resultMsg: lastMsg || (anyData ? "OK" : "NO_DATA"), info, raw: merged });
});
