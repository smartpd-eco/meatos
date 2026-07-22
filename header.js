/* MEATOS 통일 헤더 — 전 페이지 공통.
   좌상단: 고기장터 로고/글자 → 홈. 우상단: ☰ 메뉴(+알림 배지).
   각 페이지에 <script src="header.js"></script> 한 줄만 넣으면 됩니다. */
(function () {
  var SB_URL = "https://pkrsiqjzllyiafwpskll.supabase.co";
  var ANON = "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh";
  var REST = SB_URL + "/rest/v1";
  var TENANT = "881f6cc1-b552-468c-b9b4-152edb464e61";
  var H = { apikey: ANON, Authorization: "Bearer " + ANON };
  function localToday() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  var MENU = [
    ["📥 매입현황", "purchases.html"],
    ["💰 매출현황", "sales.html"],
    ["📦 재고현황", "stock.html"],
    ["🔔 알림현황", "alerts.html"],
    ["⚙️ 환경설정", "settings.html"],
    ["🚪 로그아웃", "#logout"]
  ];

  var style = document.createElement("style");
  style.textContent =
    "body{padding-top:64px !important;}" +
    ".mt-topbar{position:fixed;top:0;left:0;right:0;height:56px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 14px;z-index:9000;box-shadow:0 1px 3px rgba(0,0,0,.06)}" +
    ".mt-brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#111827}" +
    ".mt-logo{width:34px;height:34px;border-radius:9px;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}" +
    ".mt-title{font-weight:800;font-size:19px;letter-spacing:-.3px}" +
    ".mt-menu-btn{position:relative;border:none;background:#f3f4f6;border-radius:10px;width:46px;height:40px;font-size:20px;cursor:pointer;color:#111827}" +
    ".mt-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;background:#dc2626;color:#fff;border-radius:999px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box}" +
    ".mt-dd{position:fixed;top:58px;right:12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.16);z-index:9001;min-width:190px;overflow:hidden;display:none}" +
    ".mt-dd.open{display:block}" +
    ".mt-dd a{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;text-decoration:none;color:#111827;font-weight:600;font-size:15px;border-bottom:1px solid #f1f5f9}" +
    ".mt-dd a:last-child{border-bottom:none}" +
    ".mt-dd a:active,.mt-dd a:hover{background:#f9fafb}" +
    ".mt-dd small{color:#9ca3af;font-weight:500;font-size:11px}";
  document.head.appendChild(style);

  var bar = document.createElement("header");
  bar.className = "mt-topbar";
  bar.innerHTML =
    "<a class='mt-brand' href='/'><span class='mt-logo'>고</span><span class='mt-title'>고기장터</span></a>" +
    "<button class='mt-menu-btn' id='mtMenuBtn' aria-label='메뉴'><span class='mt-badge' id='mtBadge' style='display:none'></span>☰</button>";
  document.body.insertBefore(bar, document.body.firstChild);

  var dd = document.createElement("div");
  dd.className = "mt-dd"; dd.id = "mtDd";
  dd.innerHTML = MENU.map(function (m) {
    var lg = m[1] === "#logout";
    return "<a href='" + m[1] + "'" + (lg ? " data-logout='1'" : "") + ">" + m[0] + (lg ? " <small>준비중</small>" : "") + "</a>";
  }).join("");
  document.body.appendChild(dd);

  var btn = document.getElementById("mtMenuBtn");
  var badge = document.getElementById("mtBadge");
  btn.addEventListener("click", function (e) { e.stopPropagation(); dd.classList.toggle("open"); });
  document.addEventListener("click", function (e) { if (dd.classList.contains("open") && !dd.contains(e.target) && e.target !== btn) dd.classList.remove("open"); });
  dd.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-logout]");
    if (a) { e.preventDefault(); dd.classList.remove("open"); alert("로그아웃 기능은 준비 중입니다."); }
  });

  // 알림 배지: 오늘 정육일지 미작성이면 '!', 아니면 유통기한 임박·만료 건수
  (async function () {
    try {
      var lr = await fetch(REST + "/daily_sanitation_logs?tenant_id=eq." + TENANT + "&work_date=eq." + localToday() + "&select=id&limit=1", { headers: H });
      if (lr.ok && (await lr.json()).length === 0) { badge.textContent = "!"; badge.style.display = ""; return; }
      var lim = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      var r = await fetch(REST + "/inventory_movement?tenant_id=eq." + TENANT + "&expiry_date=not.is.null&expiry_date=lte." + lim + "&select=id", { headers: H });
      if (r.ok) { var n = (await r.json()).length; if (n > 0) { badge.textContent = n; badge.style.display = ""; } }
    } catch (e) { /* ignore */ }
  })();
})();
