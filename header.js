/* MEATOS 통일 헤더 — 전 페이지 공통.
   좌상단: 정육비서 로고 + 슬로건. 우상단: 로그인칩 + ☰ 메뉴. */
(function () {
  var APP_NAME = "정육비서";
  var currentTitle = String(document.title || "").trim();
  document.title = !currentTitle || currentTitle === "고기장터"
    ? APP_NAME
    : (currentTitle.indexOf(APP_NAME) >= 0 ? currentTitle : currentTitle + " · " + APP_NAME);

  var SB_URL = "https://pkrsiqjzllyiafwpskll.supabase.co";
  var ANON = "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh";
  var REST = SB_URL + "/rest/v1";
  var ACCESS_TOKEN = String(localStorage.getItem("meatos_access_token") || "").trim();
  var isPublicDashboard = Boolean(
    document.querySelector(".dashboard")
    && /^\/(?:index(?:\.html)?)?\/?$/.test(location.pathname)
  );

  function tokenIsUsable(token) {
    try {
      var encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      encoded += "=".repeat((4 - encoded.length % 4) % 4);
      var payload = JSON.parse(atob(encoded));
      return Number(payload.exp || 0) * 1000 > Date.now() + 30000;
    } catch (e) { return false; }
  }

  if (!tokenIsUsable(ACCESS_TOKEN)) {
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf("meatos_") === 0 || key.indexOf("sb-") === 0) localStorage.removeItem(key);
    });
    var next = location.pathname + location.search;
    var isLoginPage = /^\/login(?:\.html)?\/?$/.test(location.pathname);
    if (!isLoginPage && !isPublicDashboard) {
      location.replace("login.html?next=" + encodeURIComponent(next));
      return;
    }
    ACCESS_TOKEN = "";
  }

  var isAuthenticated = tokenIsUsable(ACCESS_TOKEN);
  var H = { apikey: ANON, Authorization: "Bearer " + (isAuthenticated ? ACCESS_TOKEN : ANON) };
  window.MEATOS_ACCESS_TOKEN = ACCESS_TOKEN;
  window.MEATOS_IS_AUTHENTICATED = isAuthenticated;
  window.MEATOS_API_HEADERS = Object.freeze(H);

  function localToday() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function readUser() { try { return JSON.parse(localStorage.getItem("meatos_user_cache") || "null"); } catch (e) { return null; } }

  var DEMO_TENANT = "881f6cc1-b552-468c-b9b4-152edb464e61";
  var activeUser = readUser();
  var isBusinessWorkspace = Boolean(activeUser && activeUser.member_status === "APPROVED" && activeUser.company_id);
  var TENANT = isBusinessWorkspace ? activeUser.company_id : DEMO_TENANT;
  window.MEATOS_TENANT = TENANT;
  window.MEATOS_CONTEXT = Object.freeze({
    mode: isBusinessWorkspace ? "BUSINESS" : "DEMO",
    tenantId: TENANT,
    companyId: isBusinessWorkspace ? activeUser.company_id : null,
    companyName: isBusinessWorkspace ? (activeUser.company_name || "내 사업장") : "체험 공간",
    storeId: isBusinessWorkspace ? (activeUser.store_id || null) : null,
    isBusiness: isBusinessWorkspace
  });

  function doLogout() {
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf("meatos_") === 0 || k.indexOf("sb-") === 0) localStorage.removeItem(k); });
    location.assign("/");
  }

  var MENU = [
    ["🧾 판매 스캔", "sell.html"],
    ["🔗 자동 판매연동", "connect.html"],
    ["📥 매입현황", "purchases.html"],
    ["💰 매출현황", "sales.html"],
    ["📦 재고현황", "stock.html"],
    ["🔔 알림현황", "alerts.html"],
    ["🏢 사업장 연동", "business-verify.html"],
    ["⚙️ 환경설정", "settings.html"]
  ];

  // 기존 역할별 메뉴 노출 규칙을 유지한다. 실제 데이터 통제는 RLS가 담당한다.
  var HREF_PERM = { "sell.html":"sell.scan","connect.html":"connect.manage","purchases.html":"purchase.view","sales.html":"sales.view","stock.html":"stock.view","alerts.html":"alerts.view","settings.html":"settings.view","business-verify.html":"verify.submit" };
  var ROLE_PERMS = {
    COMPANY_OWNER:"*", OWNER:"*", COMPANY_ADMIN:"*",
    STORE_MANAGER:["sell.scan","purchase.view","sales.view","stock.view","alerts.view","settings.view","verify.submit"],
    MANAGER:["sell.scan","purchase.view","sales.view","stock.view","alerts.view","settings.view","verify.submit"],
    PURCHASE_MANAGER:["purchase.view","stock.view","alerts.view","verify.submit"],
    INVENTORY_MANAGER:["stock.view","alerts.view","sell.scan","purchase.view","verify.submit"],
    POS_CASHIER:["sell.scan","sales.view","stock.view","verify.submit"],
    ACCOUNTANT:["sales.view","purchase.view","alerts.view","verify.submit"],
    AUDITOR:["purchase.view","sales.view","stock.view","alerts.view","verify.submit"],
    READ_ONLY:["purchase.view","sales.view","stock.view","alerts.view","verify.submit"],
    STAFF:["sell.scan","stock.view","verify.submit"], EMPLOYEE:["sell.scan","stock.view","verify.submit"]
  };
  function menuAllowed(href) {
    var user = readUser();
    var role = user && user.role;
    if (!role) return true;
    var permissions = ROLE_PERMS[role];
    if (!permissions || permissions === "*") return true;
    var required = HREF_PERM[href];
    return !required || permissions.indexOf(required) >= 0;
  }
  MENU = MENU.filter(function (menu) { return menuAllowed(menu[1]); });

  document.body.classList.add("mt-app-shell");
  if (document.querySelector(".dashboard")) document.body.classList.add("mt-dashboard-page");

  if (!document.getElementById("mtPretendard")) {
    var fontLink = document.createElement("link");
    fontLink.id = "mtPretendard";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css";
    document.head.appendChild(fontLink);
  }

  var style = document.createElement("style");
  style.textContent =
    ":root{--brand-red:#C51624;--brand-red-dark:#9F101C;--brand-red-soft:#FFF2F3;--brand-red-border:#F2B8BE;--info-blue:#2463D4;--success-green:#0F7A3B;--warning-orange:#E58A00;--danger-red:#D71F2B;--bg-page:#F6F7F9;--bg-card:#FFFFFF;--text-primary:#17191D;--text-secondary:#50555D;--text-muted:#6B7280;--border-default:#E4E7EB;--divider:#ECEEF1;--disabled:#B8BDC5;--radius-sm:10px;--radius-md:12px;--radius-lg:14px;--radius-panel:16px;--shadow-card:0 4px 18px rgba(16,24,40,.06);--shadow-hover:0 8px 26px rgba(16,24,40,.10);--shadow-modal:0 18px 48px rgba(16,24,40,.16);--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:48px;--space-8:64px;--transition:all .2s ease-in-out;}" +
    "html{background:var(--bg-page);}" +
    "body.mt-app-shell{min-height:100vh;background:var(--bg-page);color:var(--text-primary);font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif;line-height:1.5;word-break:keep-all;padding-top:68px!important;}" +
    "body.mt-app-shell:not(.mt-dashboard-page){padding:128px max(24px,calc((100vw - 1280px)/2)) 64px!important;}" +
    "body.mt-app-shell:not(.mt-dashboard-page)>h1,body.mt-app-shell:not(.mt-dashboard-page)>.htop h1{margin:0 0 8px;font-size:32px;line-height:1.25;font-weight:800;letter-spacing:-.025em;color:var(--text-primary);}" +
    "body.mt-app-shell:not(.mt-dashboard-page)>.sub{margin:0 0 24px;color:var(--text-secondary);font-size:15px;line-height:1.65;}" +
    "body.mt-app-shell :where(button,input,select,textarea){font-family:inherit;}" +
    "body.mt-app-shell :where(input:not([type='checkbox']):not([type='radio']):not([type='file']),select,textarea){min-height:44px;border:1px solid var(--border-default);border-radius:var(--radius-sm);background:#fff;color:var(--text-primary);font-size:15px;outline:none;transition:var(--transition);}" +
    "body.mt-app-shell :where(input:not([type='checkbox']):not([type='radio']):not([type='file']),select,textarea):focus{border-color:var(--brand-red);box-shadow:0 0 0 3px rgba(197,22,36,.10);}" +
    "body.mt-app-shell label{color:var(--text-secondary);font-weight:700;line-height:1.5;}" +
    "body.mt-app-shell :where(button,a,.filebtn):focus-visible{outline:3px solid rgba(36,99,212,.35);outline-offset:2px;}" +
    "body.mt-app-shell :where(button,.primary,.filebtn,.btn,.save){min-height:44px;border-radius:var(--radius-sm);font-weight:700;transition:var(--transition);}" +
    "body.mt-app-shell :where(button.primary,a.primary,.filebtn,button.save){background:var(--brand-red)!important;border-color:var(--brand-red)!important;color:#fff!important;}" +
    "body.mt-app-shell :where(button.primary,a.primary,.filebtn,button.save):hover{background:var(--brand-red-dark)!important;}" +
    "body.mt-app-shell :where(.btn,.bar a):not(.g){background:#fff!important;border:1px solid var(--border-default)!important;color:var(--text-primary)!important;}" +
    "body.mt-app-shell .bar a.g{background:var(--brand-red)!important;color:#fff!important;}" +
    "body.mt-app-shell :where(.b-check,button.print){background:var(--info-blue)!important;color:#fff!important;}" +
    "body.mt-app-shell button.recalc{background:#fff!important;color:var(--danger-red)!important;border:1px solid var(--danger-red)!important;}" +
    "body.mt-app-shell :where(.card,.group,.twrap,.summary){border:1px solid var(--border-default);border-radius:var(--radius-lg);box-shadow:var(--shadow-card);}" +
    "body.mt-app-shell .card{padding:24px;}" +
    "body.mt-app-shell .card h2{font-size:18px;color:var(--text-primary);}" +
    "body.mt-app-shell .kpis{gap:16px;margin-bottom:24px;}" +
    "body.mt-app-shell .kpi{border:1px solid var(--border-default);border-radius:var(--radius-lg);padding:20px 16px;box-shadow:var(--shadow-card);background:#fff;}" +
    "body.mt-app-shell .kpi b{color:var(--text-primary);}" +
    "body.mt-app-shell :where(.muted,.sub,small){color:var(--text-muted);}" +
    "body.mt-app-shell table{background:#fff;}" +
    "body.mt-app-shell th{height:52px;background:#F7F8FA;color:var(--text-secondary);font-weight:700;}" +
    "body.mt-app-shell td{min-height:52px;border-color:var(--divider);}" +
    "body.mt-app-shell tbody tr:hover{background:#FAFAFB;}" +
    ".mt-header,.mt-header *,.mt-drawer,.mt-drawer *{box-sizing:border-box;}" +
    ".mt-header button,.mt-drawer button{font:inherit;cursor:pointer;border:0;}" +
    ".mt-header{position:fixed;top:0;left:0;right:0;height:68px;background:#fff;border-bottom:1px solid var(--border-default,#e4e7eb);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1280px)/2));z-index:9000;}" +
    ".mt-header__left{display:flex;align-items:center;min-width:0;}" +
    ".mt-header__brand{display:flex;align-items:center;text-decoration:none;color:var(--text-primary,#17191d);min-width:0;}" +
    ".mt-header__logo{display:block;width:auto;max-width:230px;height:44px;object-fit:contain;}" +
    ".mt-header__right{display:flex;align-items:center;gap:var(--space-4,16px);}" +
    ".mt-header__user{display:flex;align-items:center;gap:var(--space-2,8px);font-size:15px;font-weight:700;color:var(--text-secondary,#50555d);cursor:pointer;padding:8px var(--space-3,12px);border-radius:var(--radius-sm,10px);transition:var(--transition,all .2s ease);white-space:nowrap;}" +
    ".mt-header__user-icon{display:grid;place-items:center;width:28px;height:28px;color:var(--text-muted);}" +
    ".mt-header__user-icon svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}" +
    ".mt-header__user:hover{background:var(--bg-page,#f6f7f9);}" +
    ".mt-header__menu-btn{width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:28px;border-radius:var(--radius-sm,10px);background:transparent;color:var(--text-primary,#17191d);position:relative;border-left:1px solid var(--divider,#eceef1)!important;margin-left:4px;padding-left:16px!important;}" +
    ".mt-header__badge{position:absolute;top:-2px;right:-4px;min-width:18px;height:18px;background:var(--danger-red,#d71f2b);color:#fff;border-radius:999px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px;}" +
    ".mt-drawer{position:fixed;top:0;right:-320px;width:min(320px,88vw);height:100vh;background:#fff;box-shadow:var(--shadow-modal,0 18px 48px rgba(16,24,40,.16));z-index:9002;transition:right .3s ease;display:flex;flex-direction:column;}" +
    ".mt-drawer.open{right:0;}" +
    ".mt-drawer__header{padding:var(--space-5,24px);border-bottom:1px solid var(--divider,#eceef1);display:flex;justify-content:space-between;align-items:center;}" +
    ".mt-drawer__title{font-size:20px;font-weight:800;color:var(--text-primary,#17191d);}" +
    ".mt-drawer__close{width:44px;height:44px;background:transparent;font-size:24px;color:var(--text-muted,#858b94);border-radius:var(--radius-sm,10px);}" +
    ".mt-drawer__nav{flex:1;overflow-y:auto;padding:var(--space-3,12px);}" +
    ".mt-drawer__item{display:flex;width:100%;align-items:center;padding:14px var(--space-4,16px);text-decoration:none;color:var(--text-primary,#17191d);font-weight:700;font-size:16px;border-radius:var(--radius-md,12px);margin-bottom:4px;transition:var(--transition,all .2s ease);background:transparent;text-align:left;}" +
    ".mt-drawer__item:hover{background:var(--bg-page,#f6f7f9);}" +
    ".mt-drawer__footer{padding:var(--space-5,24px);border-top:1px solid var(--divider,#eceef1);}" +
    ".mt-drawer__logout{width:100%;min-height:44px;border:1px solid var(--border-default,#d7dbe0)!important;border-radius:var(--radius-sm,10px);background:#fff;color:var(--text-primary,#17191d);font-weight:700;}" +
    ".mt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9001;display:none;}" +
    ".mt-overlay.open{display:block;}" +
    "@media(max-width:640px){" +
      ".mt-header{padding:0 var(--space-4,16px);height:80px;}" +
      "body.mt-app-shell{padding-top:80px!important;}" +
      "body.mt-app-shell:not(.mt-dashboard-page){padding:104px 16px 48px!important;}" +
      "body.mt-app-shell:not(.mt-dashboard-page)>h1,body.mt-app-shell:not(.mt-dashboard-page)>.htop h1{font-size:24px;}" +
      ".mt-header__logo{width:170px;height:auto;}" +
      ".mt-header__right{gap:4px;}" +
      ".mt-header__user-icon{display:none;}" +
      ".mt-header__user{min-height:44px;padding:8px 6px;font-size:14px;}" +
      ".mt-header__menu-btn{width:46px;height:46px;padding-left:12px!important;}" +
      "body.mt-app-shell .kpis{gap:10px;}" +
      "body.mt-app-shell .kpi{padding:16px 10px;}" +
      "body.mt-app-shell .card{padding:16px;}" +
    "}" +
    "@media(max-width:340px){" +
      ".mt-header__logo{width:132px;}" +
      ".mt-header__user{padding:8px 4px;font-size:13px;}" +
      ".mt-header__menu-btn{width:42px;padding-left:8px!important;}" +
    "}" +
    "@media(min-width:1024px) and (max-height:800px){" +
      ".mt-header{height:60px;}" +
      ".mt-header__logo{height:38px;}" +
      "body.mt-app-shell{padding-top:60px!important;}" +
    "}" +
    "@media print{body.mt-app-shell:not(.mt-dashboard-page){padding:0!important;background:#fff!important}.mt-header,.mt-drawer,.mt-overlay{display:none!important;}}";
  document.head.appendChild(style);

  var header = document.createElement("header");
  header.className = "mt-header";
  header.innerHTML =
    "<div class='mt-header__left'>" +
      "<a class='mt-header__brand' href='/'>" +
        "<img class='mt-header__logo' src='icons/jeongyuk-biseo-logo.png' width='1289' height='507' alt='정육비서'>" +
      "</a>" +
    "</div>" +
    "<div class='mt-header__right'>" +
      "<div class='mt-header__user' id='mtUserChip'>" +
        "<span class='mt-header__user-icon' aria-hidden='true'><svg viewBox='0 0 24 24'><circle cx='12' cy='7' r='4'></circle><path d='M4.5 21a7.5 7.5 0 0 1 15 0'></path></svg></span>" +
        "<span id='mtUserName'>로그인</span>" +
      "</div>" +
      "<button class='mt-header__menu-btn' id='mtMenuBtn' aria-label='메뉴 열기' aria-expanded='false' aria-controls='mtDrawer'>" +
        "<span class='mt-header__badge' id='mtBadge' style='display:none'></span>☰" +
      "</button>" +
    "</div>";
  document.body.insertBefore(header, document.body.firstChild);

  var overlay = document.createElement("div");
  overlay.className = "mt-overlay";
  document.body.appendChild(overlay);

  var drawer = document.createElement("div");
  drawer.id = "mtDrawer";
  drawer.className = "mt-drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", "전체 메뉴");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  drawer.innerHTML =
    "<div class='mt-drawer__header'>" +
      "<span class='mt-drawer__title'>메뉴</span>" +
      "<button class='mt-drawer__close' id='mtDrawerClose' type='button' aria-label='전체 메뉴 닫기'>✕</button>" +
    "</div>" +
    "<nav class='mt-drawer__nav'>" +
      MENU.map(function (m) { return "<a class='mt-drawer__item' href='" + m[1] + "'>" + m[0] + "</a>"; }).join("") +
      (/sales(\.html)?$/.test(location.pathname) ? "<button class='mt-drawer__item' id='mtSaleInput' type='button'>➕ 판매입력</button>" : "") +
    "</nav>" +
    "<div class='mt-drawer__footer'>" +
      "<button class='mt-drawer__logout' id='mtLogoutBtn' type='button'>로그아웃</button>" +
    "</div>";
  document.body.appendChild(drawer);

  var userChip = document.getElementById("mtUserChip");
  var userName = document.getElementById("mtUserName");
  var menuBtn = document.getElementById("mtMenuBtn");
  var drawerClose = document.getElementById("mtDrawerClose");
  var logoutBtn = document.getElementById("mtLogoutBtn");
  var saleInputBtn = document.getElementById("mtSaleInput");
  var badge = document.getElementById("mtBadge");

  function updateAuthUI() {
    var u = readUser();
    if (u) {
      userName.textContent = "내 계정";
      logoutBtn.style.display = "block";
      userChip.removeAttribute("role");
      userChip.removeAttribute("tabindex");
      userChip.removeAttribute("aria-label");
    } else {
      userName.textContent = "로그인";
      logoutBtn.style.display = "none";
      userChip.setAttribute("role", "button");
      userChip.setAttribute("tabindex", "0");
      userChip.setAttribute("aria-label", "로그인 페이지로 이동");
    }
  }
  updateAuthUI();

  function toggleDrawer(open) {
    drawer.classList.toggle("open", open);
    overlay.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    drawer.inert = !open;
    if (open) drawerClose.focus();
    else menuBtn.focus();
  }

  menuBtn.addEventListener("click", function () { toggleDrawer(true); });
  drawerClose.addEventListener("click", function () { toggleDrawer(false); });
  overlay.addEventListener("click", function () { toggleDrawer(false); });
  userChip.addEventListener("click", function () { if (!readUser()) location.assign("login.html"); });
  userChip.addEventListener("keydown", function (event) {
    if (!readUser() && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      location.assign("login.html");
    }
  });
  logoutBtn.addEventListener("click", function () { if (confirm("로그아웃 하시겠어요?")) doLogout(); });
  if (saleInputBtn) {
    saleInputBtn.addEventListener("click", function () {
      toggleDrawer(false);
      document.dispatchEvent(new Event("meatos:openSaleInput"));
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && drawer.classList.contains("open")) toggleDrawer(false);
    if (event.key === "Tab" && drawer.classList.contains("open")) {
      var focusable = Array.from(drawer.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // 알림 배지 로직
  (async function () {
    if (!isAuthenticated) return;
    try {
      var lr = await fetch(REST + "/daily_sanitation_logs?tenant_id=eq." + TENANT + "&work_date=eq." + localToday() + "&select=id&limit=1", { headers: H });
      var missingLog = lr.ok && (await lr.json()).length === 0;

      var lim = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      var er = await fetch(REST + "/inventory_movement?tenant_id=eq." + TENANT + "&expiry_date=not.is.null&expiry_date=lte." + lim + "&select=id", { headers: H });
      var expiryCount = er.ok ? (await er.json()).length : 0;

      if (missingLog || expiryCount > 0) {
        badge.textContent = missingLog ? "!" : expiryCount;
        badge.style.display = "flex";
      }
    } catch (e) {}
  })();
})();
