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
      // 계정 삭제(회원 탈퇴)는 사업장 연동 전 회원도 반드시 할 수 있어야 한다 (Google Play 요건).
      var isAccountDeletion = isAuthenticated && table === "request_account_deletion" && method === "POST";
      if (isOwnAccountRead || isBusinessActivation || isAccountDeletion) return nativeFetch(input, init);
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

  // Rev 1.2 "돈 먼저": 매출·입금 메뉴를 위로. 재고 심화 기능(안전재고·자동발주)은 Rev 1.1로 보관하고 메뉴에서 숨긴다.
  // 쿠팡이츠 매출연동(delivery-connect.html)은 집계사 연동 전이라 메뉴에서 숨긴다(스토어 심사: 미완성 기능 노출 금지).
  // 앱 출시용 정리(2026-11): 자주 쓰는 3개는 휴대폰 하단 탭으로, 나머지는 "더보기"(이 메뉴)에 묶음별로.
  // 알림현황·계정 연결 관리는 메뉴에서 빼고 각각 "매장 한눈에"·"환경설정" 안에서 들어간다.
  var MENU_GROUPS = [
    ["자주 쓰는 것", [["🏠 오늘의 돈", "brief.html"], ["🧾 판매 스캔", "sell.html"], ["📷 거래명세서로 입고", "scan.html"]], "mt-drawer__group--tabs"],
    ["돈", [["💰 매출현황", "sales.html"], ["💳 카드 입금예정", "settlement.html"]]],
    ["고기 · 재고", [["📋 매장 한눈에 (재고·위생)", "overview.html"], ["📥 매입현황", "purchases.html"], ["📦 재고현황", "stock.html"]]],
    ["처음 설정", [["🏷️ 품목 한 번에 등록", "plu-import.html"], ["🖥️ POS 연결 (계산대 PC)", "connect.html"], ["🏢 사업장 연동", "business-verify.html"], ["⚙️ 환경설정", "settings.html"]]]
  ];
  // 선 아이콘(토스·네이버 스타일). 다른 화면에서도 window.MEATOS_ICON(이름)으로 씀
  var ICONS = {
    home: "<path d='M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'/>",
    scan: "<path d='M4 7.5V5.5A1.5 1.5 0 0 1 5.5 4h2M16.5 4h2A1.5 1.5 0 0 1 20 5.5v2M20 16.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M7.5 20h-2A1.5 1.5 0 0 1 4 18.5v-2'/><path d='M8 8.5v7M11 8.5v7M14 8.5v7M16.5 8.5v7'/>",
    camera: "<path d='M4 8.6A2.6 2.6 0 0 1 6.6 6h1.3l1.3-1.7A1.5 1.5 0 0 1 10.4 3.7h3.2a1.5 1.5 0 0 1 1.2.6L16.1 6h1.3A2.6 2.6 0 0 1 20 8.6v7.8A2.6 2.6 0 0 1 17.4 19H6.6A2.6 2.6 0 0 1 4 16.4z'/><circle cx='12' cy='12.3' r='3.4'/>",
    bell: "<path d='M18 16.2V11a6 6 0 1 0-12 0v5.2L4.6 18h14.8z'/><path d='M10 20.2a2 2 0 0 0 4 0'/>",
    grid: "<rect x='4' y='4' width='6.5' height='6.5' rx='2'/><rect x='13.5' y='4' width='6.5' height='6.5' rx='2'/><rect x='4' y='13.5' width='6.5' height='6.5' rx='2'/><rect x='13.5' y='13.5' width='6.5' height='6.5' rx='2'/>",
    menu: "<path d='M4 7h16M4 12h16M4 17h16'/>",
    card: "<rect x='3' y='5.5' width='18' height='13' rx='2.6'/><path d='M3 9.8h18M7 14.6h3.5'/>",
    chart: "<path d='M5 19.5v-7M10 19.5V5.5M15 19.5v-5M20 19.5v-10'/>",
    clip: "<rect x='5.5' y='4.5' width='13' height='16' rx='2.2'/><path d='M9.5 4.5v-1h5v1'/><path d='m9 13 2.1 2.1L15.2 11'/>",
    box: "<path d='M4 8 12 4l8 4v8.2L12 20l-8-3.8z'/><path d='M4 8l8 4 8-4M12 12v8'/>",
    tag: "<path d='M4 11.5V5a1 1 0 0 1 1-1h6.5L20 12.5 12.5 20z'/><circle cx='8.3' cy='8.3' r='1.3'/>",
    pos: "<rect x='3.5' y='4' width='17' height='11.5' rx='2'/><path d='M8.5 20h7M12 15.5V20'/>",
    store: "<path d='M4 9.5 5.5 5h13L20 9.5M4 9.5h16M4 9.5v9.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5M9 20v-5.5h6V20'/>",
    clock: "<circle cx='12' cy='12' r='8'/><path d='M12 7.5V12l3 2'/>",
    spark: "<path d='M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z'/><path d='M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'/>"
  };
  function icon(name, size) {
    return "<svg class='mt-ic' width='" + (size || 24) + "' height='" + (size || 24) + "' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + (ICONS[name] || "") + "</svg>";
  }
  window.MEATOS_ICON = icon;
  // 휴대폰 하단 탭: 홈 · 판매 · 입고 · 더보기
  var TABS = [
    ["home", "홈", "brief.html"],
    ["scan", "판매", "sell.html"],
    ["camera", "입고", "scan.html?pick=1"]
  ];
  // 약관·정책·계정 삭제: 로그인 여부·역할과 관계없이 항상 노출 (Google Play·개인정보보호법 요건)
  var LEGAL_MENU = [
    ["📄 이용약관", "terms.html"],
    ["🔒 개인정보처리방침", "privacy.html"],
    ["🗑️ 계정 삭제", "account-delete.html"]
  ];

  // 기존 역할별 메뉴 노출 규칙을 유지한다. 실제 데이터 통제는 RLS가 담당한다.
  var HREF_PERM = { "brief.html":"sales.view","sell.html":"sell.scan","plu-import.html":"sell.scan","delivery-sales.html":"delivery.fulfill","delivery-connect.html":"sales.view","connect.html":"connect.manage","purchases.html":"purchase.view","sales.html":"sales.view","settlement.html":"sales.view","stock.html":"stock.view","safety-stock.html":"stock.view","auto-order.html":"purchase.view","alerts.html":"alerts.view","account-link.html":"settings.view","settings.html":"settings.view","business-verify.html":"verify.submit" };
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
  MENU_GROUPS = MENU_GROUPS.map(function (g) {
    return [g[0], g[1].filter(function (m) { return menuAllowed(m[1]); }), g[2] || ""];
  }).filter(function (g) { return g[1].length > 0; });
  TABS = TABS.filter(function (t) { return menuAllowed(t[2]); });
  var currentPage = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
  function isCurrent(href) { return href.split("?")[0].replace(/\.html$/, "") === currentPage; }
  // 휴대폰(또는 정육비서 안드로이드 앱) 여부: PC 전용 안내 화면 등에서 사용
  var isPhone = /Android|iPhone|iPad|iPod|Mobile|MEATOSApp/i.test(navigator.userAgent || "")
    || (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  window.MEATOS_IS_PHONE = isPhone;
  window.MEATOS_IN_APP = /MEATOSApp\//.test(navigator.userAgent || "");
  if (isPhone) document.documentElement.classList.add("mt-phone");

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
    ".mt-drawer__group{margin-top:12px;padding-top:12px;border-top:1px solid var(--divider,#eceef1);}" +
    ".mt-drawer__group-title{display:block;padding:4px var(--space-4,16px) 6px;font-size:13px;font-weight:700;color:var(--text-muted,#6b7280);}" +
    ".mt-drawer__item--sub{font-size:15px;padding:11px var(--space-4,16px);color:var(--text-secondary,#50555d);}" +
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
    ".mt-drawer__group--first{margin-top:0;padding-top:0;border-top:0;}" +
    ":root{--pk:#E5536B;--pk-dark:#C23A52;--pk-soft:#FFF1F3;}" +
    ".mt-header__right{gap:2px!important;}" +
    ".mt-ibtn{position:relative;width:44px;height:44px;min-height:44px!important;display:flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:transparent;color:#2B2F36;cursor:pointer;padding:0!important;}" +
    ".mt-ibtn:hover{background:var(--bg-page,#f6f7f9);}" +
    ".mt-ibtn .mt-header__badge{top:4px;right:3px;background:var(--pk);border:2px solid #fff;}" +
    ".mt-drawer__login{display:flex;align-items:center;justify-content:center;text-decoration:none;margin-bottom:8px;background:var(--pk)!important;color:#fff!important;border-color:var(--pk)!important;}" +
    ".mt-noti{position:fixed;top:0;right:-380px;width:min(380px,100vw);height:100vh;background:#fff;z-index:9003;box-shadow:var(--shadow-modal,0 18px 48px rgba(16,24,40,.16));transition:right .28s ease;display:flex;flex-direction:column;}" +
    ".mt-noti.open{right:0;}" +
    ".mt-noti__head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--divider,#eceef1);}" +
    ".mt-noti__head b{font-size:20px;font-weight:800;}" +
    ".mt-noti button{font:inherit;cursor:pointer;border:0!important;background:transparent;}" +
    ".mt-noti__list{flex:1;overflow-y:auto;padding:8px 12px 24px;}" +
    ".mt-noti__item{display:flex;gap:12px;align-items:flex-start;padding:14px 10px;border-radius:14px;text-decoration:none;color:var(--text-primary,#17191d);}" +
    ".mt-noti__item:hover{background:var(--bg-page,#f6f7f9);}" +
    ".mt-noti__item.is-new{background:#FFF7F8;}" +
    ".mt-noti__ic{flex:none;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#F2F4F6;color:#4E5968;}" +
    ".mt-noti__ic--money{background:var(--pk-soft);color:var(--pk-dark);}" +
    ".mt-noti__ic--todo{background:#EEF4FF;color:#2F6FEB;}" +
    ".mt-noti__ic--warn{background:#FFF4E5;color:#D97706;}" +
    ".mt-noti__tx{flex:1;min-width:0;}" +
    ".mt-noti__tx b{display:block;font-size:15.5px;font-weight:700;line-height:1.4;}" +
    ".mt-noti__tx b em{font-style:normal;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--pk);color:#fff;font-size:11px;font-weight:800;vertical-align:2px;}" +
    ".mt-noti__tx small{display:block;margin-top:2px;font-size:13.5px;color:var(--text-muted,#6b7280);line-height:1.45;}" +
    ".mt-noti__empty{padding:48px 0;text-align:center;color:var(--text-muted,#6b7280);font-size:15px;}" +
    ".mt-cap{position:fixed;inset:0;z-index:100000;background:rgba(17,24,39,.45);display:none;align-items:flex-end;justify-content:center;padding:16px;}" +
    ".mt-cap.open{display:flex;}" +
    ".mt-cap__box{width:100%;max-width:420px;background:#fff;border-radius:22px;padding:22px 18px 14px;margin-bottom:env(safe-area-inset-bottom);}" +
    ".mt-cap__t{display:block;font-size:19px;font-weight:800;margin:0 4px 4px;}" +
    ".mt-cap__d{margin:0 4px 16px;color:var(--text-muted,#6b7280);font-size:14px;line-height:1.5;}" +
    ".mt-cap__btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px!important;margin-bottom:10px;border-radius:14px!important;font-size:17px;font-weight:800;cursor:pointer;border:0;}" +
    ".mt-cap__btn--cam{background:var(--pk)!important;color:#fff!important;}" +
    ".mt-cap__btn--file{background:#F2F4F6!important;color:#333D4B!important;}" +
    ".mt-cap__btn--x{background:transparent!important;color:#6B7684!important;min-height:44px!important;font-size:15px;margin-bottom:0;}" +
    ".mt-tab__ico .mt-ic{display:block;}" +
    ".mt-drawer__item.is-current{background:var(--brand-red-soft,#fff2f3);color:var(--brand-red,#c51624);}" +
    ".mt-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:8998;display:none;grid-template-columns:repeat(4,1fr);background:#fff;border-top:1px solid var(--border-default,#e4e7eb);padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -4px 16px rgba(16,24,40,.06);}" +
    ".mt-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:62px;padding:6px 0;background:transparent;border:0;color:var(--text-muted,#6b7280);font:inherit;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;}" +
    ".mt-tab__ico{line-height:0;color:#B0B8C1;}" +
    ".mt-tab{color:#8B95A1!important;}" +
    ".mt-tab.on{color:#191F28!important;}" +
    ".mt-tab.on .mt-tab__ico{color:var(--pk);}" +
    "@media(max-width:900px){" +
      ".mt-tabbar{display:grid;}" +
      ".mt-ibtn--menu{display:none!important;}" +
      "body.mt-app-shell.mt-has-tabbar{padding-bottom:96px!important;}" +
      ".mt-drawer__group--tabs{display:none;}" +
      ".mt-drawer__group--tabs+.mt-drawer__group{margin-top:0;padding-top:0;border-top:0;}" +
      "body.mt-has-tabbar .toast{bottom:86px!important;}" +
      "body.mt-has-tabbar .savebar{bottom:62px!important;}" +
      "body.mt-has-tabbar .dashboard-toast{bottom:86px!important;}" +
    "}" +
    // 휴대폰에서 달력(매출현황·카드 입금예정)이 옆으로 잘리지 않게: 금액은 '104만'처럼 줄여 표시
    ".da-short{display:none;}" +
    "@media(max-width:560px){" +
      "body.mt-app-shell table.cal{min-width:0!important;table-layout:fixed;font-size:11px!important;}" +
      "body.mt-app-shell table.cal th,body.mt-app-shell table.cal td{padding:3px 2px!important;height:46px!important;}" +
      "body.mt-app-shell table.cal thead th{height:auto!important;padding:5px 0!important;}" +
      "body.mt-app-shell table.cal td .da{font-size:11px!important;margin-top:4px!important;letter-spacing:-.03em;white-space:nowrap;}" +
      "body.mt-app-shell table.cal .da-full{display:none;}" +
      "body.mt-app-shell table.cal .da-short{display:inline;}" +
      "body.mt-app-shell table.cal .sumcol{font-size:11px!important;}" +
      "body.mt-app-shell table.cal tfoot td{height:auto!important;padding:8px 4px!important;}" +
    "}" +
    "@media print{body.mt-app-shell:not(.mt-dashboard-page){padding:0!important;background:#fff!important}.mt-header,.mt-drawer,.mt-overlay,.mt-tabbar{display:none!important;}}";
  document.head.appendChild(style);

  var header = document.createElement("header");
  header.className = "mt-header";
  header.innerHTML =
    "<div class='mt-header__left'>" +
      "<a class='mt-header__brand' href='brief.html'>" +
        "<img class='mt-header__logo' src='icons/jeongyuk-biseo-logo.png' width='1289' height='507' alt='정육비서'>" +
      "</a>" +
      "<span class='mt-header__company' id='mtCompanyName' title=''></span>" +
    "</div>" +
    "<div class='mt-header__right'>" +
      "<button class='mt-ibtn' id='mtCamBtn' type='button' aria-label='거래명세서 찍어서 입고'>" + icon("camera", 26) + "</button>" +
      "<button class='mt-ibtn' id='mtBellBtn' type='button' aria-label='알림' aria-expanded='false' aria-controls='mtNoti'>" + icon("bell", 26) +
        "<span class='mt-header__badge' id='mtBadge' style='display:none'></span></button>" +
      "<button class='mt-ibtn mt-ibtn--menu' id='mtMenuBtn' type='button' aria-label='메뉴 열기' aria-expanded='false' aria-controls='mtDrawer'>" + icon("menu", 26) + "</button>" +
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
      MENU_GROUPS.map(function (g, i) {
        return "<div class='mt-drawer__group" + (i === 0 ? " mt-drawer__group--first" : "") + (g[2] ? " " + g[2] : "") + "' role='group' aria-label='" + g[0] + "'>" +
          "<span class='mt-drawer__group-title'>" + g[0] + "</span>" +
          g[1].map(function (m) { return "<a class='mt-drawer__item" + (isCurrent(m[1]) ? " is-current" : "") + "' href='" + m[1] + "'>" + m[0] + "</a>"; }).join("") +
        "</div>";
      }).join("") +
      (/sales(\.html)?$/.test(location.pathname) ? "<button class='mt-drawer__item' id='mtSaleInput' type='button'>➕ 판매입력</button>" : "") +
      "<div class='mt-drawer__group' role='group' aria-label='약관 및 정책'>" +
        "<span class='mt-drawer__group-title'>약관 · 정책</span>" +
        LEGAL_MENU.map(function (m) { return "<a class='mt-drawer__item mt-drawer__item--sub' href='" + m[1] + "'>" + m[0] + "</a>"; }).join("") +
      "</div>" +
    "</nav>" +
    "<div class='mt-drawer__footer'>" +
      "<a class='mt-drawer__logout mt-drawer__login' id='mtLoginBtn' href='login.html'>로그인 / 회원가입</a>" +
      "<button class='mt-drawer__logout' id='mtLogoutBtn' type='button'>로그아웃</button>" +
    "</div>";
  document.body.appendChild(drawer);

  var tabbar = document.createElement("nav");
  tabbar.className = "mt-tabbar";
  tabbar.setAttribute("aria-label", "주요 메뉴");
  tabbar.innerHTML = TABS.map(function (t) {
    return "<a class='mt-tab" + (isCurrent(t[2]) ? " on" : "") + "' href='" + t[2] + "'" + (isCurrent(t[2]) ? " aria-current='page'" : "") + "><span class='mt-tab__ico'>" + icon(t[0], 25) + "</span><span>" + t[1] + "</span></a>";
  }).join("") +
    "<button class='mt-tab' type='button' id='mtTabMore' aria-controls='mtDrawer'><span class='mt-tab__ico'>" + icon("grid", 25) + "</span><span>더보기</span></button>";
  document.body.appendChild(tabbar);
  document.body.classList.add("mt-has-tabbar");

  var loginBtn = document.getElementById("mtLoginBtn");
  var menuBtn = document.getElementById("mtMenuBtn");
  var drawerClose = document.getElementById("mtDrawerClose");
  var logoutBtn = document.getElementById("mtLogoutBtn");
  var saleInputBtn = document.getElementById("mtSaleInput");
  var badge = document.getElementById("mtBadge");

  function updateAuthUI() {
    var u = readUser();
    logoutBtn.style.display = u ? "block" : "none";
    loginBtn.style.display = u ? "none" : "flex";
  }
  updateAuthUI();

  function toggleDrawer(open) {
    drawer.classList.toggle("open", open);
    overlay.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    drawer.inert = !open;
    if (open) drawerClose.focus();
  }

  menuBtn.addEventListener("click", function () { toggleDrawer(true); });
  document.getElementById("mtTabMore").addEventListener("click", function () { toggleDrawer(true); });
  drawerClose.addEventListener("click", function () { toggleDrawer(false); });
  overlay.addEventListener("click", function () { toggleDrawer(false); });
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

  // ── 알림(종): 토스처럼 확인할 일·새 기능을 모아서 보여 준다 ──────────────────
  var noti = document.createElement("div");
  noti.id = "mtNoti"; noti.className = "mt-noti";
  noti.setAttribute("role", "dialog"); noti.setAttribute("aria-modal", "true"); noti.setAttribute("aria-label", "알림");
  noti.inert = true;
  noti.innerHTML = "<div class='mt-noti__head'><b>알림</b><button type='button' class='mt-drawer__close' id='mtNotiClose' aria-label='알림 닫기'>✕</button></div><div class='mt-noti__list' id='mtNotiList'><div class='mt-noti__empty'>불러오는 중…</div></div>";
  document.body.appendChild(noti);
  var bellBtn = document.getElementById("mtBellBtn");
  var NOTI = [];
  var NEW_FEATURES = [
    { id: "nf-2611-card", icon: "card", tag: "새 기능", title: "카드 입금을 달력으로 보세요", desc: "날짜를 누르면 그날 들어올 카드 대금이 카드사별로 나와요", href: "settlement.html" },
    { id: "nf-2611-plu", icon: "tag", tag: "새 기능", title: "라벨 사진으로 품목을 한 번에 등록", desc: "저울 라벨을 찍으면 품목·단가가 자동으로 채워져요", href: "plu-import.html" }
  ];
  function seenIds() { try { return JSON.parse(localStorage.getItem("meatos_noti_seen") || "[]"); } catch (e) { return []; } }
  function markSeen() { try { localStorage.setItem("meatos_noti_seen", JSON.stringify(NOTI.map(function (n) { return n.id; }).concat(seenIds()).slice(0, 200))); } catch (e) {} }
  function renderNoti() {
    var seen = seenIds();
    var unseen = NOTI.filter(function (n) { return seen.indexOf(n.id) < 0; }).length;
    badge.textContent = unseen > 9 ? "9+" : String(unseen);
    badge.style.display = unseen ? "flex" : "none";
    document.getElementById("mtNotiList").innerHTML = NOTI.length ? NOTI.map(function (n) {
      return "<a class='mt-noti__item" + (seen.indexOf(n.id) < 0 ? " is-new" : "") + "' href='" + n.href + "'>" +
        "<span class='mt-noti__ic mt-noti__ic--" + (n.kind || "info") + "'>" + icon(n.icon, 22) + "</span>" +
        "<span class='mt-noti__tx'><b>" + n.title + (n.tag ? "<em>" + n.tag + "</em>" : "") + "</b><small>" + n.desc + "</small></span></a>";
    }).join("") : "<div class='mt-noti__empty'>새 알림이 없어요</div>";
    window.MEATOS_NOTIFICATIONS = NOTI.slice();
    document.dispatchEvent(new Event("meatos:notifications"));
  }
  function toggleNoti(open) {
    noti.classList.toggle("open", open);
    overlay.classList.toggle("open", open);
    noti.inert = !open;
    bellBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { renderNoti(); markSeen(); setTimeout(function () { badge.style.display = "none"; }, 300); }
  }
  bellBtn.addEventListener("click", function () { toggleNoti(!noti.classList.contains("open")); });
  document.getElementById("mtNotiClose").addEventListener("click", function () { toggleNoti(false); });
  overlay.addEventListener("click", function () { toggleNoti(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && noti.classList.contains("open")) toggleNoti(false); });

  (async function buildNotifications() {
    var items = [];
    var today = localToday();
    function won(v) { return Math.round(Number(v) || 0).toLocaleString("ko-KR"); }
    async function get(path) { try { var r = await fetch(REST + path, { headers: H }); return r.ok ? await r.json() : []; } catch (e) { return []; } }
    var storeFilter = (window.MEATOS_CONTEXT && window.MEATOS_CONTEXT.storeId) ? "&store_id=eq." + encodeURIComponent(window.MEATOS_CONTEXT.storeId) : "";
    var res = await Promise.all([
      get("/card_settlement?company_id=eq." + TENANT + storeFilter + "&deposit_date=eq." + today + "&status=eq.SCHEDULED&select=deposit_amt,deposit_date,status&limit=200"),
      get("/daily_sanitation_logs?tenant_id=eq." + TENANT + "&work_date=eq." + today + "&select=id&limit=1"),
      get("/inventory_movement?tenant_id=eq." + TENANT + "&expiry_date=not.is.null&expiry_date=lte." + new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) + "&expiry_date=gte." + today + "&select=id,expiry_date&limit=200"),
      get("/sales_record?tenant_id=eq." + TENANT + "&needs_mapping=eq.true&is_cancelled=eq.false&select=id,needs_mapping&limit=200")
    ]);
    var cardToday = (res[0] || []).filter(function (r) { return r.deposit_date === today && r.status === "SCHEDULED"; });
    if (cardToday.length) {
      var amt = cardToday.reduce(function (a, r) { return a + (Number(r.deposit_amt) || 0); }, 0);
      items.push({ id: "card-" + today, icon: "card", kind: "money", title: "오늘 카드 대금 " + won(amt) + "원이 들어와요", desc: cardToday.length + "건 · 눌러서 카드사별로 보기", href: "settlement.html" });
    }
    if (!(res[1] || []).length) items.push({ id: "san-" + today, icon: "clip", kind: "todo", title: "오늘 위생 점검표를 아직 안 썼어요", desc: "체크만 하면 1분이면 끝나요", href: "sanitation.html" });
    var exp = (res[2] || []).filter(function (r) { return r.expiry_date && r.expiry_date >= today; }).length;
    if (exp) items.push({ id: "exp-" + today + "-" + exp, icon: "clock", kind: "warn", title: "유통기한 임박 " + exp + "건", desc: "3일 안에 끝나는 고기가 있어요", href: "alerts.html" });
    var unmapped = (res[3] || []).filter(function (r) { return r.needs_mapping === true; }).length;
    if (unmapped) items.push({ id: "map-" + today + "-" + unmapped, icon: "tag", kind: "todo", title: "품목이 정해지지 않은 매출 " + unmapped + "건", desc: "한 번만 정하면 부위별 매출·재고로 정리돼요", href: "plu-import.html" });
    NOTI = items.concat(NEW_FEATURES);
    renderNoti();
  })();

  // ── 카메라: 어느 화면에서든 거래명세서를 찍어 바로 입고 ──────────────────────
  var cap = document.createElement("div");
  cap.className = "mt-cap"; cap.id = "mtCap";
  cap.setAttribute("role", "dialog"); cap.setAttribute("aria-modal", "true"); cap.setAttribute("aria-label", "거래명세서 입력");
  cap.innerHTML = "<div class='mt-cap__box'><b class='mt-cap__t'>거래명세서 입력</b><p class='mt-cap__d'>찍으면 품목·중량·단가·이력번호를 읽어 입고와 재고에 반영해요</p>" +
    "<button type='button' class='mt-cap__btn mt-cap__btn--cam' id='mtCapCam'>" + icon("camera", 22) + "사진 찍기</button>" +
    "<button type='button' class='mt-cap__btn mt-cap__btn--file' id='mtCapFile'>앨범에서 불러오기</button>" +
    "<button type='button' class='mt-cap__btn mt-cap__btn--x' id='mtCapX'>닫기</button></div>";
  document.body.appendChild(cap);
  async function downscale(file) {
    var MAX = 1800; var bmp = await createImageBitmap(file);
    var k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    var c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.84);
  }
  function makeInput(cam) {
    var i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.style.display = "none";
    if (cam) i.setAttribute("capture", "environment");
    i.addEventListener("change", async function () {
      var f = i.files && i.files[0]; if (!f) return;
      try {
        var t0 = performance.now();
        sessionStorage.setItem("meatos_pending_image", await downscale(f));
        sessionStorage.setItem("meatos_pending_home_prepare_ms", String(Math.round(performance.now() - t0)));
        sessionStorage.setItem("meatos_pending_name", f.name || "scan.jpg");
        sessionStorage.setItem("meatos_pending_source", cam ? "camera" : "file");
        location.assign("scan.html");
      } catch (e) { alert("사진을 준비하지 못했습니다. 다시 촬영해 주세요."); }
    });
    document.body.appendChild(i); return i;
  }
  var camIn = makeInput(true), fileIn = makeInput(false);
  function closeCap() { cap.classList.remove("open"); }
  window.MEATOS_OPEN_CAPTURE = function () {
    // 명세서 화면에서는 그 화면의 선택창(여러 장 묶음 유지)을 쓴다
    if (currentPage === "scan" && typeof window.showAddPagePicker === "function") { window.showAddPagePicker("거래명세서 입력"); return; }
    cap.classList.add("open");
  };
  document.getElementById("mtCamBtn").addEventListener("click", function () { window.MEATOS_OPEN_CAPTURE(); });
  cap.addEventListener("click", function (e) { if (e.target === cap) closeCap(); });
  document.getElementById("mtCapCam").addEventListener("click", function () { closeCap(); camIn.value = ""; camIn.click(); });
  document.getElementById("mtCapFile").addEventListener("click", function () { closeCap(); fileIn.value = ""; fileIn.click(); });
  document.getElementById("mtCapX").addEventListener("click", closeCap);
})();
