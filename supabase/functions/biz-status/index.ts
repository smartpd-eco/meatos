// 사업자등록 상태 조회 (국세청 사업자등록정보 상태조회 API 프록시)
// 브라우저에서 CORS로 직접 못 부르므로 이 함수가 대리 호출한다.
// 배포: verify_jwt=false. 시크릿: DATA_GO_KR_KEY (공공데이터포털 활용신청 키)
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors(), "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  try {
    const body = await req.json().catch(() => ({}));
    const bno = String(body.b_no ?? "").replace(/\D/g, "");
    if (bno.length !== 10) return json({ ok: false, message: "사업자번호 10자리를 입력하세요." }, 400);
    const key = Deno.env.get("DATA_GO_KR_KEY") ?? "";
    if (!key) return json({ ok: false, message: "DATA_GO_KR_KEY 미설정" }, 503);

    const url = "https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=" + encodeURIComponent(key);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [bno] }),
    });
    const j = await res.json();
    const d = (j.data && j.data[0]) || {};
    // b_stt: 계속사업자/휴업자/폐업자,  b_stt_cd: 01/02/03
    const active = d.b_stt_cd === "01";
    return json({
      ok: true, b_no: bno, active,
      b_stt: d.b_stt || (d.b_stt_cd ? "" : "국세청에 등록되지 않은 번호"),
      b_stt_cd: d.b_stt_cd || null, tax_type: d.tax_type || null,
    });
  } catch (e) {
    return json({ ok: false, message: String(e) }, 500);
  }
});
