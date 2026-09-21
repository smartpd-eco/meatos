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

  // 로그아웃(명시적)을 누르기 전까지 세션 유지: 접속 토큰이 만료되면 refresh_token으로 즉시 재발급한다.
  function refreshAccessTokenSync() {
    var rt = String(localStorage.getItem("meatos_refresh_token") || "").trim();
    if (!rt) return "";
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", SB_URL + "/auth/v1/token?grant_type=refresh_token", false);
      xhr.setRequestHeader("apikey", ANON);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify({ refresh_token: rt }));
      if (xhr.status >= 200 && xhr.status < 300) {
        var d = JSON.parse(xhr.responseText || "{}");
        if (d && d.access_token) {
          localStorage.setItem("meatos_access_token", d.access_token);
          if (d.refresh_token) localStorage.setItem("meatos_refresh_token", d.refresh_token);
          localStorage.setItem("meatos_last_active", String(Date.now()));
          return String(d.access_token);
        }
      }
    } catch (e) {}
    return "";
  }

  if (!tokenIsUsable(ACCESS_TOKEN)) {
    var renewedToken = refreshAccessTokenSync();
    if (tokenIsUsable(renewedToken)) {
      ACCESS_TOKEN = renewedToken;
    } else {
      // 갱신 실패(리프레시 토큰 없음/만료)일 때만 정리한다.
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf("meatos_") === 0 || key.indexOf("sb-") === 0) localStorage.removeItem(key);
      });
      ACCESS_TOKEN = "";
    }
  }

  // 한 페이지에 오래 머물러도 세션이 끊기지 않도록 20분마다 조용히(백그라운드) 갱신한다.
  if (localStorage.getItem("meatos_refresh_token")) {
    setInterval(function () {
      var rt = String(localStorage.getItem("meatos_refresh_token") || "").trim();
      if (!rt) return;
      fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (d && d.access_token) {
          localStorage.setItem("meatos_access_token", d.access_token);
          if (d.refresh_token) localStorage.setItem("meatos_refresh_token", d.refresh_token);
          localStorage.setItem("meatos_last_active", String(Date.now()));
        }
      }).catch(function () {});
    }, 20 * 60 * 1000);
  }

  var isAuthenticated = tokenIsUsable(ACCESS_TOKEN);
  var H = { apikey: ANON, Authorization: "Bearer " + (isAuthenticated ? ACCESS_TOKEN : ANON) };
  window.MEATOS_ACCESS_TOKEN = ACCESS_TOKEN;
  window.MEATOS_IS_AUTHENTICATED = isAuthenticated;
  window.MEATOS_API_HEADERS = Object.freeze(H);
  window.MEATOS_FETCH_JSON = async function (url, options) {
    var config = options || {};
    var timeoutMs = Number(config.timeoutMs) || 12000;
    var retries = Number.isFinite(Number(config.retries)) ? Number(config.retries) : 1;
    var lastError = null;

    for (var attempt = 0; attempt <= retries; attempt += 1) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      try {
        var response = await fetch(url, { headers: H, signal: controller.signal });
        if (response.status === 401) {
          var authError = new Error("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
          authError.code = "AUTH_EXPIRED";
          throw authError;
        }
        if (!response.ok) {
          var httpError = new Error("데이터 요청 실패 (HTTP " + response.status + ")");
          httpError.code = "HTTP_" + response.status;
          if (response.status < 500 || attempt >= retries) throw httpError;
          lastError = httpError;
          continue;
        }
        return await response.json();
      } catch (error) {
        lastError = error && error.name === "AbortError"
          ? new Error("데이터 응답 시간이 초과되었습니다.")
          : error;
        if (lastError && lastError.code === "AUTH_EXPIRED") throw lastError;
        if (attempt >= retries) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("데이터를 불러오지 못했습니다.");
  };

  function localToday() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function readUser() { try { return JSON.parse(localStorage.getItem("meatos_user_cache") || "null"); } catch (e) { return null; } }

  var DEMO_TENANT = "881f6cc1-b552-468c-b9b4-152edb464e61";
  var activeUser = readUser();
  var isBusinessWorkspace = Boolean(activeUser && activeUser.member_status === "APPROVED" && activeUser.company_id);
  var isDemoWorkspace = !isBusinessWorkspace;
  var TENANT = isBusinessWorkspace ? activeUser.company_id : DEMO_TENANT;
  window.MEATOS_TENANT = TENANT;
  window.MEATOS_CONTEXT = Object.freeze({
    mode: isBusinessWorkspace ? "BUSINESS" : (isAuthenticated ? "MEMBER_DEMO" : "GUEST_DEMO"),
    tenantId: TENANT,
    companyId: isBusinessWorkspace ? activeUser.company_id : null,
    companyName: isBusinessWorkspace ? (activeUser.company_name || "내 사업장") : "게스트 체험 공간",
    storeId: isBusinessWorkspace ? (activeUser.store_id || null) : null,
    isBusiness: isBusinessWorkspace,
    isGuest: !isAuthenticated,
    readOnly: !isBusinessWorkspace
  });
  window.MEATOS_GUEST_MODE = !isAuthenticated;
  window.MEATOS_DEMO_MODE = isDemoWorkspace;
  window.MEATOS_CAN_PERSIST = isBusinessWorkspace;

  /*
   * 사업장 미연동 체험은 로그인 여부와 관계없이 운영 DB를 직접 읽지 않는다.
   * REST 조회는 브라우저 내 샘플 데이터로 응답하고 모든 업무 데이터 변경을 차단한다.
   * 본인 account 조회와 사업장 연동 RPC만 실제 DB로 통과시킨다.
   */
  if (isDemoWorkspace && !window.__MEATOS_DEMO_FETCH_INSTALLED__) {
    window.__MEATOS_DEMO_FETCH_INSTALLED__ = true;
    var nativeFetch = window.fetch.bind(window);
    var sampleStoreId = "00000000-0000-4000-8000-000000000101";
    var sampleNow = new Date();
    var sampleToday = localToday();
    var sampleMonth = sampleToday.slice(0, 7);
    var previousDate = new Date(sampleNow.getFullYear(), sampleNow.getMonth() - 1, 1);
    var previousMonth = previousDate.getFullYear() + "-" + String(previousDate.getMonth() + 1).padStart(2, "0");
    function offsetDate(days) {
      var date = new Date(sampleNow);
      date.setDate(date.getDate() + days);
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    }
    var sampleMovements = [
      { id:"demo-mv-1", raw_product_name:"냉장 삼겹(장터)", origin:"국내산", unit:"kg", quantity:28.4, unit_price:19800, amount:562320, movement_type:"IN", movement_date:offsetDate(-5), supplier_name:"좋은축산", slaughter_date:offsetDate(-8), expiry_date:offsetDate(2), trace_no:"002178123456", memo:"게스트 샘플 입고", created_at:offsetDate(-5)+"T09:00:00Z", is_active:true },
      { id:"demo-mv-2", raw_product_name:"냉장 삼겹(장터)S", origin:"국내산", unit:"kg", quantity:7.2, unit_price:21000, amount:151200, movement_type:"IN", movement_date:offsetDate(-3), supplier_name:"대산축산", slaughter_date:offsetDate(-7), expiry_date:offsetDate(3), trace_no:"002178123457", memo:"AI 동일 품목 통합 예시", created_at:offsetDate(-3)+"T09:00:00Z", is_active:true },
      { id:"demo-mv-3", raw_product_name:"냉장 삼겹살", origin:"국내산", unit:"kg", quantity:4.6, unit_price:20500, amount:94300, movement_type:"OUT", movement_date:offsetDate(-1), supplier_name:"", slaughter_date:null, expiry_date:null, trace_no:null, memo:"판매 출고", created_at:offsetDate(-1)+"T12:00:00Z", is_active:true },
      { id:"demo-mv-4", raw_product_name:"냉장 목살(장터)", origin:"국내산", unit:"kg", quantity:19.5, unit_price:18500, amount:360750, movement_type:"IN", movement_date:offsetDate(-4), supplier_name:"좋은축산", slaughter_date:offsetDate(-7), expiry_date:offsetDate(5), trace_no:"002178123458", memo:"게스트 샘플 입고", created_at:offsetDate(-4)+"T09:00:00Z", is_active:true },
      { id:"demo-mv-5", raw_product_name:"냉동 우목심(티스)", origin:"수입산", unit:"kg", quantity:12.8, unit_price:16300, amount:208640, movement_type:"IN", movement_date:offsetDate(-10), supplier_name:"대산축산", slaughter_date:null, expiry_date:offsetDate(45), trace_no:"IMP-DEMO-001", memo:"소고기 목심 치환 예시", created_at:offsetDate(-10)+"T09:00:00Z", is_active:true },
      { id:"demo-mv-6", raw_product_name:"냉장 황창(장터)", origin:"국내산", unit:"kg", quantity:5.4, unit_price:43000, amount:232200, movement_type:"IN", movement_date:offsetDate(-2), supplier_name:"좋은축산", slaughter_date:offsetDate(-6), expiry_date:offsetDate(1), trace_no:"002178123459", memo:"항정 치환 예시", created_at:offsetDate(-2)+"T09:00:00Z", is_active:true }
    ];
    var sampleSales = [
      { id:"demo-sale-1", sale_date:sampleToday, sold_at:sampleToday+"T10:18:00+09:00", store_id:sampleStoreId, item_name:"냉장 삼겹살", barcode:"2200010012580", quantity:1.258, unit_price:23800, amount:29940, channel:"STORE", external_transaction_id:"DEMO-POS-001", is_cancelled:false, created_at:sampleToday+"T01:18:00Z" },
      { id:"demo-sale-2", sale_date:sampleToday, sold_at:sampleToday+"T11:42:00+09:00", store_id:sampleStoreId, item_name:"냉장 목살", barcode:"2200020009840", quantity:0.984, unit_price:21800, amount:21450, channel:"STORE", external_transaction_id:"DEMO-POS-002", is_cancelled:false, created_at:sampleToday+"T02:42:00Z" },
      { id:"demo-sale-3", sale_date:offsetDate(-1), sold_at:offsetDate(-1)+"T15:05:00+09:00", store_id:sampleStoreId, item_name:"소고기 목심", barcode:"2200030011200", quantity:1.12, unit_price:26800, amount:30020, channel:"COUPANG_EATS", external_transaction_id:"DEMO-CE-001", is_cancelled:false, created_at:offsetDate(-1)+"T06:05:00Z" }
    ];
    var sampleDocuments = [
      { id:"demo-doc-1", document_code:"DEMO-"+sampleToday.replace(/-/g,"")+"-01", invoice_date:sampleToday, total_amount:923070, document_status:"POSTED", created_at:sampleToday+"T00:30:00Z", parsed_json:{ documentFields:{ supplierName:"좋은축산" }, lineItems:[
        { rawProductName:"냉장 삼겹(장터)", origin:"국내산", unit:"kg", quantity:28.4, unitPrice:19800, supplyAmount:562320, traceOrImportNo:"002178123456" },
        { rawProductName:"냉장 목살(장터)", origin:"국내산", unit:"kg", quantity:19.5, unitPrice:18500, supplyAmount:360750, traceOrImportNo:"002178123458" }
      ]}},
      { id:"demo-doc-2", document_code:"DEMO-"+offsetDate(-3).replace(/-/g,"")+"-01", invoice_date:offsetDate(-3), total_amount:359840, document_status:"POSTED", created_at:offsetDate(-3)+"T00:30:00Z", parsed_json:{ documentFields:{ supplierName:"대산축산" }, lineItems:[
        { rawProductName:"냉동 우목심(티스)", origin:"수입산", unit:"kg", quantity:12.8, unitPrice:16300, supplyAmount:208640, traceOrImportNo:"IMP-DEMO-001" },
        { rawProductName:"냉장 삼겹(장터)S", origin:"국내산", unit:"kg", quantity:7.2, unitPrice:21000, supplyAmount:151200, traceOrImportNo:"002178123457" }
      ]}}
    ];
    function guestRows(table, url) {
      var params = url.searchParams;
      if (table === "inventory_movement") {
        var movementRows = sampleMovements.slice();
        var expiryFilters = params.getAll("expiry_date");
        var expiryLimit = expiryFilters.find(function (value) { return value.indexOf("lte.") === 0; });
        if (expiryFilters.some(function (value) { return value === "not.is.null"; })) {
          movementRows = movementRows.filter(function (row) { return Boolean(row.expiry_date); });
        }
        if (expiryLimit) {
          var limitDate = expiryLimit.slice(4);
          movementRows = movementRows.filter(function (row) { return row.expiry_date && row.expiry_date <= limitDate; });
        }
        return movementRows;
      }
      if (table === "sales_record") return sampleSales;
      if (table === "ocr_document") {
        var idFilter = params.get("id");
        if (idFilter && idFilter.indexOf("eq.") === 0) return sampleDocuments.filter(function (row) { return row.id === idFilter.slice(3); });
        return sampleDocuments;
      }
      if (table === "store") return [{ id:sampleStoreId, name:"게스트 체험점" }];
      if (table === "product_barcode") return [
        { barcode_key:"000100", raw_product_name:"냉장 삼겹살", unit:"kg", default_price:23800, weigh_type:"PRICE_EMBED", company_id:DEMO_TENANT, store_id:null },
        { barcode_key:"000200", raw_product_name:"냉장 목살", unit:"kg", default_price:21800, weigh_type:"WEIGHT_EMBED", company_id:DEMO_TENANT, store_id:null }
      ];
      if (table === "daily_sales_summary") return [{ day:sampleToday, order_cnt:2, amount:51390 }];
      if (table === "daily_purchase_summary") return [{ day:sampleToday, doc_cnt:1, amount:923070 }, { day:offsetDate(-3), doc_cnt:1, amount:359840 }];
      if (table === "monthly_sales_summary") return [{ ym:params.get("ym") === "eq."+previousMonth ? previousMonth : sampleMonth, order_cnt:38, amount:2145820 }];
      if (table === "monthly_purchase_summary") return [{ ym:params.get("ym") === "eq."+previousMonth ? previousMonth : sampleMonth, doc_cnt:7, amount:4289350 }];
      if (table === "inventory_summary") return [
        { product_key:"pork-belly", on_hand_qty:31, low_stock:false, net_amount:622100 },
        { product_key:"pork-neck", on_hand_qty:19.5, low_stock:false, net_amount:360750 },
        { product_key:"beef-chuck", on_hand_qty:12.8, low_stock:true, net_amount:208640 },
        { product_key:"pork-jowl", on_hand_qty:5.4, low_stock:true, net_amount:232200 }
      ];
      if (table === "daily_sanitation_logs") return [];
      if (table === "delivery_order") return [
        { id:"demo-order-1", external_order_id:"CE-DEMO-2401", status:"FULFILLED", order_amount:32800, scale_amount:32800, capture_mode:"AUTO", shadow_mode:true, match_confidence:0.98, created_at:sampleToday+"T02:10:00Z", fulfilled_at:sampleToday+"T02:28:00Z" }
      ];
      if (table === "delivery_capture_event") return [
        { id:"demo-event-1", event_type:"ORDER_RECEIPT", status:"CAPTURED", error_code:null, external_order_id:"CE-DEMO-2401", barcode:null, amount:32800, captured_at:sampleToday+"T02:10:00Z", match_confidence:0.99, raw_product_name:"냉장 삼겹살", printed_weight:null, printed_unit_price:null, printed_amount:null, parser_version:"demo-v1" },
        { id:"demo-event-2", event_type:"LABEL_PRINT", status:"MATCHED", error_code:null, external_order_id:"CE-DEMO-2401", barcode:"2200010013780", amount:32800, captured_at:sampleToday+"T02:27:00Z", match_confidence:0.98, raw_product_name:"냉장 삼겹살", printed_weight:1.378, printed_unit_price:23800, printed_amount:32800, parser_version:"demo-v1" }
      ];
      if (table === "kr_holiday") return [
        { holiday_date:"2026-01-01" },{ holiday_date:"2026-02-16" },{ holiday_date:"2026-02-17" },{ holiday_date:"2026-02-18" },
        { holiday_date:"2026-03-01" },{ holiday_date:"2026-03-02" },{ holiday_date:"2026-05-05" },{ holiday_date:"2026-05-24" },
        { holiday_date:"2026-05-25" },{ holiday_date:"2026-06-06" },{ holiday_date:"2026-08-15" },{ holiday_date:"2026-08-17" },
        { holiday_date:"2026-09-24" },{ holiday_date:"2026-09-25" },{ holiday_date:"2026-09-26" },{ holiday_date:"2026-10-03" },
        { holiday_date:"2026-10-05" },{ holiday_date:"2026-10-09" },{ holiday_date:"2026-12-25" },{ holiday_date:"2027-01-01" }
      ];
      if (table === "card_settlement_rule") return [
        { company_id:null, card_company:"신한", deposit_lag:2, fee_rate:0.9 },
        { company_id:null, card_company:"삼성", deposit_lag:2, fee_rate:0.9 },
        { company_id:null, card_company:"KB국민", deposit_lag:2, fee_rate:1.0 },
        { company_id:null, card_company:"현대", deposit_lag:2, fee_rate:0.9 },
        { company_id:null, card_company:"롯데", deposit_lag:2, fee_rate:1.0 },
        { company_id:null, card_company:"BC", deposit_lag:3, fee_rate:1.1 },
        { company_id:null, card_company:"하나", deposit_lag:2, fee_rate:1.0 },
        { company_id:null, card_company:"우리", deposit_lag:2, fee_rate:1.0 },
        { company_id:null, card_company:"NH농협", deposit_lag:2, fee_rate:1.0 }
      ];
      if (table === "card_settlement") return [
        { id:"demo-cs-1", company_id:DEMO_TENANT, store_id:sampleStoreId, card_company:"신한", sale_date:offsetDate(-1), approve_amt:412000, fee_rate:0.9, fee_amt:3708, deposit_amt:408292, deposit_date:offsetDate(1), deposit_lag:2, status:"SCHEDULED", source:"manual" },
        { id:"demo-cs-2", company_id:DEMO_TENANT, store_id:sampleStoreId, card_company:"삼성", sale_date:offsetDate(-1), approve_amt:238000, fee_rate:0.9, fee_amt:2142, deposit_amt:235858, deposit_date:offsetDate(1), deposit_lag:2, status:"SCHEDULED", source:"manual" },
        { id:"demo-cs-3", company_id:DEMO_TENANT, store_id:sampleStoreId, card_company:"KB국민", sale_date:sampleToday, approve_amt:315000, fee_rate:1.0, fee_amt:3150, deposit_amt:311850, deposit_date:offsetDate(2), deposit_lag:2, status:"SCHEDULED", source:"manual" },
        { id:"demo-cs-4", company_id:DEMO_TENANT, store_id:sampleStoreId, card_company:"현대", sale_date:offsetDate(-3), approve_amt:180000, fee_rate:0.9, fee_amt:1620, deposit_amt:178380, deposit_date:offsetDate(-1), deposit_lag:2, status:"PAID", source:"manual" }
      ];
      return [];
    }
    window.fetch = function (input, init) {
      var rawUrl = typeof input === "string" ? input : (input && input.url) || "";
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (rawUrl.indexOf(REST + "/") !== 0) return nativeFetch(input, init);
      var parsedUrl = new URL(rawUrl);
      var table = parsedUrl.pathname.split("/").filter(Boolean).pop();
      var isOwnAccountRead = isAuthenticated && table === "account" && (method === "GET" || method === "HEAD");
      var isBusinessActivation = isAuthenticated && table === "activate_own_business_tenant" && method === "POST";
      if (isOwnAccountRead || isBusinessActivation) return nativeFetch(input, init);
      if (method !== "GET" && method !== "HEAD") {
        return Promise.resolve(new Response(JSON.stringify({
          code:"DEMO_READ_ONLY",
          message:"사업장 연동 전에는 샘플 데이터만 조회할 수 있습니다. 사업장 연동 후 저장해주세요."
        }), { status:403, headers:{ "Content-Type":"application/json; charset=utf-8" } }));
      }
      return Promise.resolve(new Response(JSON.stringify(guestRows(table, parsedUrl)), {
        status:200,
        headers:{ "Content-Type":"application/json; charset=utf-8", "X-MEATOS-Demo":isAuthenticated ? "member" : "guest" }
      }));
    };
  }

  function doLogout() {
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf("meatos_") === 0 || k.indexOf("sb-") === 0) localStorage.removeItem(k); });
    location.assign("/");
  }

  var MENU = [
    ["🧾 판매 스캔", "sell.html"],
    ["🛵 쿠팡이츠 매출연동", "delivery-connect.html"],
    ["🔗 자동 판매연동", "connect.html"],
    ["📥 매입현황", "purchases.html"],
    ["💰 매출현황", "sales.html"],
    ["💳 카드 입금예정", "settlement.html"],
    ["📦 재고현황", "stock.html"],
    ["🛡️ 안전재고관리", "safety-stock.html"],
    ["🧮 자동발주관리", "auto-order.html"],
    ["🔔 알림현황", "alerts.html"],
    ["🏢 사업장 연동", "business-verify.html"],
    ["🔐 계정 연결 관리", "account-link.html"],
    ["⚙️ 환경설정", "settings.html"]
  ];

  // 기존 역할별 메뉴 노출 규칙을 유지한다. 실제 데이터 통제는 RLS가 담당한다.
  var HREF_PERM = { "sell.html":"sell.scan","delivery-sales.html":"delivery.fulfill","delivery-connect.html":"sales.view","connect.html":"connect.manage","purchases.html":"purchase.view","sales.html":"sales.view","settlement.html":"sales.view","stock.html":"stock.view","safety-stock.html":"stock.view","auto-order.html":"purchase.view","alerts.html":"alerts.view","account-link.html":"settings.view","settings.html":"settings.view","business-verify.html":"verify.submit" };
  var ROLE_PERMS = {
    COMPANY_OWNER:"*", OWNER:"*", COMPANY_ADMIN:"*",
    STORE_MANAGER:["sell.scan","delivery.fulfill","purchase.view","sales.view","stock.view","alerts.view","settings.view","verify.submit"],
    MANAGER:["sell.scan","delivery.fulfill","purchase.view","sales.view","stock.view","alerts.view","settings.view","verify.submit"],
    PURCHASE_MANAGER:["purchase.view","stock.view","alerts.view","verify.submit"],
    INVENTORY_MANAGER:["stock.view","alerts.view","sell.scan","delivery.fulfill","purchase.view","verify.submit"],
    POS_CASHIER:["sell.scan","delivery.fulfill","sales.view","stock.view","verify.submit"],
    ACCOUNTANT:["sales.view","purchase.view","alerts.view","verify.submit"],
    AUDITOR:["purchase.view","sales.view","stock.view","alerts.view","verify.submit"],
    READ_ONLY:["purchase.view","sales.view","stock.view","alerts.view","verify.submit"],
    STAFF:["sell.scan","delivery.fulfill","stock.view","verify.submit"], EMPLOYEE:["sell.scan","delivery.fulfill","stock.view","verify.submit"]
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
  if (isDemoWorkspace) document.body.classList.add("mt-guest-mode");

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
    "body.mt-app-shell:not(.mt-dashboard-page){padding:84px max(24px,calc((100vw - 1280px)/2)) 64px!important;}" +
    "body.mt-app-shell:not(.mt-dashboard-page)>main.page{padding-top:0!important;}" +
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
    "body.mt-app-shell table th,body.mt-app-shell table td{text-align:center!important;vertical-align:middle!important;}" +
    "body.mt-app-shell th{height:52px;background:#F7F8FA;color:var(--text-secondary);font-weight:700;}" +
    "body.mt-app-shell td{min-height:52px;border-color:var(--divider);}" +
    "body.mt-app-shell tbody tr:hover{background:#FAFAFB;}" +
    ".mt-header,.mt-header *,.mt-drawer,.mt-drawer *{box-sizing:border-box;}" +
    ".mt-header button,.mt-drawer button{font:inherit;cursor:pointer;border:0;}" +
    ".mt-header{position:fixed;top:0;left:0;right:0;height:68px;background:#fff;border-bottom:1px solid var(--border-default,#e4e7eb);display:flex;align-items:center;justify-content:space-between;padding:0 max(24px,calc((100vw - 1280px)/2));z-index:9000;}" +
    ".mt-header__left{display:flex;align-items:center;min-width:0;}" +
    ".mt-header__brand{display:flex;align-items:center;text-decoration:none;color:var(--text-primary,#17191d);min-width:0;}" +
    ".mt-header__logo{display:block;width:auto;max-width:230px;height:44px;object-fit:contain;}" +
    ".mt-header__company{display:none;max-width:260px;margin-left:14px;padding-left:14px;border-left:1px solid var(--divider,#eceef1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:800;color:var(--text-primary,#17191d);}" +
    ".mt-header__company.is-visible{display:block;}" +
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
    ".mt-guest-banner{position:fixed;top:68px;left:0;right:0;z-index:8999;min-height:44px;padding:9px 16px;display:flex;align-items:center;justify-content:center;gap:12px;background:#fff7ed;border-bottom:1px solid #fdba74;color:#9a3412;font-size:14px;font-weight:700;text-align:center;}" +
    ".mt-guest-banner a{display:inline-flex;align-items:center;min-height:30px;padding:4px 12px;border-radius:999px;background:#c51624;color:#fff;text-decoration:none;white-space:nowrap;}" +
    "body.mt-guest-mode.mt-dashboard-page{padding-top:112px!important;}" +
    "body.mt-guest-mode:not(.mt-dashboard-page){padding-top:128px!important;}" +
    "@media(max-width:639px){" +
      ".mt-header{min-height:64px;height:64px;padding:6px 12px;}" +
      "body.mt-app-shell{padding-top:64px!important;}" +
      "body.mt-app-shell:not(.mt-dashboard-page){padding:80px 16px 48px!important;}" +
      "body.mt-app-shell:not(.mt-dashboard-page)>h1,body.mt-app-shell:not(.mt-dashboard-page)>.htop h1{font-size:24px;}" +
      ".mt-header__logo{width:auto;max-width:min(170px,48vw);height:38px;max-height:38px;object-fit:contain;}" +
      ".mt-header__company{max-width:120px;margin-left:8px;padding-left:8px;font-size:12px;}" +
      ".mt-header__right{gap:6px;}" +
      ".mt-header__user-icon{display:none;}" +
      ".mt-header__user{min-height:44px;padding:8px 6px;font-size:14px;}" +
      ".mt-header__menu-btn{width:42px;height:42px;min-height:42px!important;margin-left:0;padding-left:8px!important;}" +
      ".mt-guest-banner{top:64px;min-height:40px;padding:6px 10px;font-size:12px;gap:8px;}" +
      "body.mt-guest-mode.mt-dashboard-page{padding-top:104px!important;}" +
      "body.mt-guest-mode:not(.mt-dashboard-page){padding-top:120px!important;}" +
      "body.mt-app-shell .kpis{gap:10px;}" +
      "body.mt-app-shell .kpi{padding:16px 10px;}" +
      "body.mt-app-shell .card{padding:16px;}" +
    "}" +
    "@media(max-width:340px){" +
      ".mt-header__logo{max-width:132px;}" +
      ".mt-header__user{padding:8px 4px;font-size:13px;}" +
      ".mt-header__menu-btn{width:42px;padding-left:8px!important;}" +
    "}" +
    "@media(min-width:1024px) and (max-height:800px){" +
      ".mt-header{height:60px;}" +
      ".mt-header__logo{height:38px;}" +
      "body.mt-app-shell{padding-top:60px!important;}" +
      "body.mt-app-shell:not(.mt-dashboard-page){padding-top:76px!important;}" +
      "body.mt-guest-mode:not(.mt-dashboard-page){padding-top:128px!important;}" +
    "}" +
    "@media print{body.mt-app-shell:not(.mt-dashboard-page){padding:0!important;background:#fff!important}.mt-header,.mt-drawer,.mt-overlay{display:none!important;}}";
  document.head.appendChild(style);

  var header = document.createElement("header");
  header.className = "mt-header";
  header.innerHTML =
    "<div class='mt-header__left'>" +
      "<a class='mt-header__brand' href='index.html'>" +
        "<img class='mt-header__logo' src='icons/jeongyuk-biseo-logo.png' width='1289' height='507' alt='정육비서'>" +
      "</a>" +
      "<span class='mt-header__company' id='mtCompanyName' title=''></span>" +
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
  if (isDemoWorkspace) {
    var guestBanner = document.createElement("div");
    guestBanner.className = "mt-guest-banner";
    guestBanner.setAttribute("role", "status");
    guestBanner.innerHTML = isAuthenticated
      ? "<span>사업장 미연동 체험 모드 · 샘플 데이터 조회만 가능</span><a href='business-verify.html'>사업장 연동</a>"
      : "<span>게스트 체험 모드 · 샘플 데이터 조회만 가능</span><a href='login.html'>로그인</a>";
    document.body.insertBefore(guestBanner, header.nextSibling);
  }
  var companyNameNode = document.getElementById("mtCompanyName");
  if (isBusinessWorkspace && activeUser.company_name) {
    companyNameNode.textContent = activeUser.company_name;
    companyNameNode.title = activeUser.company_name;
    companyNameNode.classList.add("is-visible");
  }

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
    if (!isBusinessWorkspace) return;
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
