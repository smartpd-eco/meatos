import { AiEngine } from "./src/core/ai-engine.js";
import { EventEngine } from "./src/core/event-engine.js";
import { InventoryEngine } from "./src/core/inventory-engine.js";
import { ProductEngine } from "./src/core/product-engine.js";
import { categories, aliases, ledger, products, salesPatternRows, suppliers } from "./src/data/mock-data.js";
import { PosAdapterPlugin } from "./src/plugins/pos-adapter.js";

const eventEngine = new EventEngine();
const productEngine = new ProductEngine({ categories, products, aliases, suppliers });
const inventoryEngine = new InventoryEngine({ products: productEngine.listProducts(), ledger }, eventEngine);
const aiEngine = new AiEngine({ productEngine, inventoryEngine, eventEngine });
const posAdapter = new PosAdapterPlugin({ productEngine, inventoryEngine, eventEngine });

const state = {
  view: "dashboard",
  query: "",
  lastImport: null,
  lastHealthCheck: null,
  manualSales: []
};

const viewTitle = document.querySelector("#view-title");
const appView = document.querySelector("#app-view");
const healthButton = document.querySelector("#run-health-check");
const menuButtons = [...document.querySelectorAll("[data-view]")];
const money = new Intl.NumberFormat("ko-KR");

const titles = {
  dashboard: "MEATOS Core Engine Dashboard",
  engines: "Core Engine 구조",
  products: "Product Engine - 상품 표준",
  inventory: "Universal Inventory Engine",
  events: "Event Engine - 작업 이력",
  pos: "POS Plugin - Universal Adapter",
  ai: "AI Engine - 추천과 감지"
};

function renderDashboard() {
  const stockRows = inventoryEngine.getStockRows();
  const purchaseRecommendations = aiEngine.recommendPurchases();
  const aliasRows = productEngine.listAliases();
  const dangerCount = stockRows.filter((row) => row.status !== "ok").length;

  return `
    ${metricCard("표준상품", `${productEngine.listProducts().length}개`, "Product Engine 기준")}
    ${metricCard("Alias 등록", `${aliasRows.length}개`, "거래처별 원본명 포함")}
    ${metricCard("재고 위험 품목", `${dangerCount}개`, "Inventory Engine 계산")}
    ${metricCard("AI 발주추천", `${purchaseRecommendations.length}건`, "사용자 승인 대기")}

    <article class="card span-7">
      <div class="toolbar">
        <h3>Inventory Engine 현재고</h3>
        <input class="input" id="inventory-search" placeholder="상품명 검색" value="${state.query}" />
      </div>
      ${inventoryTable(stockRows)}
    </article>

    <article class="card span-5">
      <h3>Core Engine 원칙</h3>
      <div class="progress-list">
        ${progressRow("Product Engine", 100)}
        ${progressRow("Inventory Engine", 100)}
        ${progressRow("Event Engine", 100)}
        ${progressRow("AI Engine", 82)}
        ${progressRow("POS Plugin", 76)}
      </div>
    </article>

    <article class="card span-12">
      <h3>최근 Event Log</h3>
      ${eventTable(eventEngine.list(6))}
    </article>
  `;
}

function renderEngines() {
  const rows = [
    ["Product Engine", "상품분류, 표준상품, Alias, 단위, 거래처별 상품명", "Core"],
    ["Inventory Engine", "입고, 출고, 현재고, Ledger, History", "Core"],
    ["Event Engine", "모든 작업의 이벤트 저장과 추적", "Core"],
    ["AI Engine", "OCR, 상품 치환, 발주, 예측 추천", "Core"],
    ["POS Adapter", "API, DB, CSV, Folder Watch, Manual, Lite POS", "Plugin"],
    ["Dashboard/Mobile", "엔진 결과를 보여주고 사용자 승인을 받는 화면", "App"]
  ];

  return `
    <article class="card span-12">
      <h3>Engine과 Plugin 경계</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>영역</th><th>책임</th><th>구분</th></tr></thead>
          <tbody>
            ${rows.map(([name, role, type]) => `
              <tr>
                <td>${name}</td>
                <td>${role}</td>
                <td>${badge(type, type === "Core" ? "ok" : "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
    <article class="card span-6">
      <h3>개발 질문</h3>
      <p class="label">기능 추가 시 먼저 묻습니다. 이 기능이 Core Engine에 속하는가? YES면 Core, NO면 Plugin으로 구현합니다.</p>
    </article>
    <article class="card span-6">
      <h3>불변 원칙</h3>
      <p class="label">POS는 Core가 아닙니다. POS 데이터는 Adapter Plugin을 거쳐 Inventory Engine으로만 들어옵니다.</p>
    </article>
  `;
}

function renderProducts() {
  const aliasRows = productEngine.listAliases();
  return `
    <article class="card span-8">
      <div class="toolbar">
        <h3>표준상품</h3>
        <button class="primary-button" id="create-product">표준상품 등록</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품명</th><th>분류</th><th>단위</th><th>안전재고</th><th>이력번호</th></tr></thead>
          <tbody>
            ${productEngine.listProducts().map((product) => `
              <tr>
                <td>${product.name}</td>
                <td>${categoryName(product.categoryId)}</td>
                <td>${product.baseUnit}</td>
                <td>${product.safeStock}${product.baseUnit}</td>
                <td>${product.traceRequired ? badge("필수", "ok") : badge("선택")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
    <article class="card span-4">
      <h3>Alias 추천 테스트</h3>
      <div class="form-grid">
        <input class="input" id="alias-raw-name" value="냉장목심" />
        <button class="primary-button" id="recommend-alias">AI 추천</button>
      </div>
      <div id="alias-result" class="label" style="margin-top:16px"></div>
    </article>
    <article class="card span-12">
      <h3>상품 Alias</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>원본 상품명</th><th>표준상품</th><th>공급사</th><th>신뢰도</th><th>상태</th></tr></thead>
          <tbody>
            ${aliasRows.map((alias) => `
              <tr>
                <td>${alias.rawName}</td>
                <td>${alias.product?.name ?? "-"}</td>
                <td>${supplierName(alias.supplierId)}</td>
                <td>${alias.confidence}%</td>
                <td>${aliasStatus(alias.confidence)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderInventory() {
  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>Ledger 기반 현재고</h3>
        <button class="secondary-button" id="receive-stock">입고 이벤트 생성</button>
      </div>
      ${inventoryTable(inventoryEngine.getStockRows())}
    </article>
    <article class="card span-12">
      <h3>Inventory Ledger</h3>
      ${ledgerTable(inventoryEngine.listLedger(12))}
    </article>
  `;
}

function renderEvents() {
  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>Event Log</h3>
        <button class="primary-button" id="record-sample-event">샘플 이벤트 저장</button>
      </div>
      ${eventTable(eventEngine.list(30))}
    </article>
  `;
}

function renderPos() {
  const health = state.lastHealthCheck;
  const importResult = state.lastImport;

  return `
    <article class="card span-8">
      <div class="toolbar">
        <h3>Universal POS Adapter는 Plugin입니다</h3>
        <button class="primary-button" id="simulate-import">CSV 판매 Import</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Level</th><th>Adapter</th><th>구분</th><th>Inventory 연결</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>API Adapter</td><td>${badge("Plugin")}</td><td>출고 Ledger 생성</td></tr>
            <tr><td>2</td><td>DB Adapter</td><td>${badge("읽기전용")}</td><td>출고 Ledger 생성</td></tr>
            <tr><td>3</td><td>CSV Adapter</td><td>${badge("MVP", "ok")}</td><td>출고 Ledger 생성</td></tr>
            <tr><td>4</td><td>Folder Watch</td><td>${badge("Plugin")}</td><td>CSV Adapter 호출</td></tr>
            <tr><td>5</td><td>Manual Sales</td><td>${badge("필수", "ok")}</td><td>출고 Ledger 생성</td></tr>
            <tr><td>6</td><td>Lite POS</td><td>${badge("확장")}</td><td>Manual Sales 확장</td></tr>
          </tbody>
        </table>
      </div>
      ${importResult ? `<p class="label">최근 Import: 총 ${importResult.total}건, 성공 ${importResult.imported}건, 미매칭 ${importResult.unmatched}건</p>` : ""}
    </article>
    <article class="card span-4">
      <h3>POS Health Check</h3>
      <p class="label">매장 환경을 분석해 추천 Adapter를 판단합니다. 판단 결과도 Event Log에 저장됩니다.</p>
      <button class="primary-button" id="run-pos-scan">점검 실행</button>
      ${health ? healthResult(health) : ""}
    </article>
    <article class="card span-12">
      <h3>POS 없는 정육점: Manual Sales</h3>
      <div class="form-grid">
        <input class="input" id="sale-product" value="삼겹살" />
        <input class="input" id="sale-qty" type="number" step="0.1" value="1.5" />
        <button class="primary-button" id="add-sale">판매등록</button>
      </div>
    </article>
  `;
}

function renderAi() {
  const purchaseRows = aiEngine.recommendPurchases();
  const anomaly = aiEngine.detectSalesAnomaly(salesPatternRows);

  return `
    <article class="card span-7">
      <h3>AI 발주 추천</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품</th><th>현재고</th><th>안전재고</th><th>추천 발주</th><th>사유</th></tr></thead>
          <tbody>
            ${purchaseRows.map((row) => `
              <tr>
                <td>${row.productName}</td>
                <td>${row.currentStock}kg</td>
                <td>${row.safeStock}kg</td>
                <td>${badge(`${row.recommendedQuantity}kg`, "warn")}</td>
                <td>${row.reason}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
    <article class="card span-5">
      <h3>AI 이상 판매 감지</h3>
      <p class="label">${anomaly.message}</p>
      <button class="primary-button" id="approve-ai">사용자 검토 완료</button>
    </article>
    <article class="card span-12">
      <h3>AI 원칙</h3>
      <p class="label">AI는 OCR, 상품 치환, 이상 판매 감지, 발주 추천, 가격 예측, 재고 예측을 수행하지만 최종 승인자는 사용자입니다.</p>
    </article>
  `;
}

function inventoryTable(stockRows) {
  const rows = stockRows
    .filter((row) => row.name.includes(state.query))
    .map((row) => `
      <tr>
        <td>${row.name}</td>
        <td>${categoryName(row.categoryId)}</td>
        <td>${row.currentStock}${row.baseUnit}</td>
        <td>${row.safeStock}${row.baseUnit}</td>
        <td>${inventoryStatus(row.status)}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>표준상품</th><th>분류</th><th>현재고</th><th>안전재고</th><th>상태</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function ledgerTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>시간</th><th>상품</th><th>이벤트</th><th>방향</th><th>수량</th><th>Source</th><th>메모</th></tr></thead>
        <tbody>
          ${rows.map((entry) => `
            <tr>
              <td>${formatTime(entry.createdAt)}</td>
              <td>${productName(entry.productId)}</td>
              <td>${entry.eventType}</td>
              <td>${entry.direction === "in" ? badge("입고", "ok") : badge("출고", "warn")}</td>
              <td>${entry.quantity}kg</td>
              <td>${entry.source}</td>
              <td>${entry.memo ?? ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function eventTable(events) {
  if (!events.length) {
    return `<p class="label">아직 저장된 이벤트가 없습니다. POS Import, AI 추천, 재고 입고를 실행하면 Event Log가 쌓입니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>시간</th><th>이벤트</th><th>Actor</th><th>Payload</th></tr></thead>
        <tbody>
          ${events.map((event) => `
            <tr>
              <td>${formatTime(event.createdAt)}</td>
              <td>${event.type}</td>
              <td>${event.actor}</td>
              <td>${escapeHtml(JSON.stringify(event.payload)).slice(0, 120)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function healthResult(result) {
  return `
    <div class="progress-list" style="margin-top:16px">
      ${progressRow("신뢰도", result.confidence)}
      <p class="label">감지 POS: ${result.detectedVendor}</p>
      <p class="label">추천 Adapter: Level ${result.recommendedAdapterLevel} CSV Adapter</p>
      <p class="label">${result.notes.join(", ")}</p>
    </div>
  `;
}

function bindViewEvents() {
  document.querySelectorAll("[data-toast]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.toast));
  });

  document.querySelector("#inventory-search")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
    document.querySelector("#inventory-search")?.focus();
  });

  document.querySelector("#create-product")?.addEventListener("click", () => {
    const product = productEngine.createProduct({
      categoryId: "cat-pork",
      supplierId: "sup-001",
      name: "등심",
      cutName: "등심",
      baseUnit: "kg",
      safeStock: 12,
      moq: 8,
      traceRequired: true
    });
    eventEngine.record("product.created", { productId: product.id, name: product.name }, "user");
    showToast("Product Engine에 표준상품 등심을 등록했습니다.");
    render();
  });

  document.querySelector("#recommend-alias")?.addEventListener("click", () => {
    const rawName = document.querySelector("#alias-raw-name").value.trim();
    const recommendation = aiEngine.recommendAlias(rawName);
    const result = document.querySelector("#alias-result");
    result.textContent = `${rawName} -> ${recommendation.product?.name ?? "미매칭"} (${recommendation.score}%, ${recommendation.status})`;
    showToast("AI Engine이 Alias 후보를 추천했습니다. 최종 확정은 사용자 승인 대상입니다.");
  });

  document.querySelector("#receive-stock")?.addEventListener("click", () => {
    inventoryEngine.receive({
      productId: "prd-003",
      quantity: 10,
      source: "invoice",
      memo: "거래명세서 입고 전환"
    });
    showToast("Inventory Engine에 목살 10kg 입고 Ledger를 생성했습니다.");
    render();
  });

  document.querySelector("#record-sample-event")?.addEventListener("click", () => {
    eventEngine.record("document.ocr_completed", { documentId: "sample-invoice-001" }, "user");
    showToast("OCR 완료 샘플 이벤트를 저장했습니다.");
    render();
  });

  document.querySelector("#simulate-import")?.addEventListener("click", () => {
    state.lastImport = posAdapter.importCsvRows([
      { vendor: "OKPOS", productName: "생삼겹", quantity: 2.4 },
      { vendor: "OKPOS", productName: "미전지", quantity: 3.1 },
      { vendor: "OKPOS", productName: "알수없는상품", quantity: 1.2 }
    ]);
    showToast(`CSV 판매 ${state.lastImport.imported}건을 Inventory Engine 출고 Ledger로 전환했습니다.`);
    render();
  });

  document.querySelector("#run-pos-scan")?.addEventListener("click", runHealthCheck);

  document.querySelector("#add-sale")?.addEventListener("click", () => {
    const productNameValue = document.querySelector("#sale-product").value.trim();
    const quantity = Number(document.querySelector("#sale-qty").value || 0);
    const result = posAdapter.createManualSale({ productName: productNameValue, quantity });
    state.manualSales.unshift(result);
    showToast(result.status === "created"
      ? `${result.product.name} ${quantity}kg 판매를 Inventory Engine 출고로 처리했습니다.`
      : "표준상품 매칭이 필요합니다.");
    render();
  });

  document.querySelector("#approve-ai")?.addEventListener("click", () => {
    eventEngine.record("ai.review_completed", { reviewedBy: "user" }, "user");
    showToast("AI 추천 검토 완료 이벤트를 저장했습니다.");
    render();
  });
}

function runHealthCheck() {
  state.lastHealthCheck = posAdapter.runHealthCheck();
  showToast("POS Health Check를 완료하고 Event Log에 저장했습니다.");
  state.view = "pos";
  render();
}

function render() {
  viewTitle.textContent = titles[state.view];
  menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  const views = {
    dashboard: renderDashboard,
    engines: renderEngines,
    products: renderProducts,
    inventory: renderInventory,
    events: renderEvents,
    pos: renderPos,
    ai: renderAi
  };

  appView.innerHTML = views[state.view]();
  bindViewEvents();
}

function metricCard(label, value, hint) {
  return `
    <article class="card span-3">
      <div class="metric">${value}</div>
      <div class="label">${label}</div>
      <p class="label">${hint}</p>
    </article>
  `;
}

function progressRow(name, value) {
  return `
    <div class="progress-row">
      <strong>${name}</strong>
      <div class="bar"><span style="width:${value}%"></span></div>
      <span class="label">${value}%</span>
    </div>
  `;
}

function badge(text, status = "") {
  return `<span class="badge ${status}">${text}</span>`;
}

function aliasStatus(confidence) {
  if (confidence >= 90) return badge("자동매칭", "ok");
  if (confidence >= 80) return badge("검토필요", "warn");
  return badge("신규후보", "warn");
}

function inventoryStatus(status) {
  const map = {
    ok: badge("정상", "ok"),
    warn: badge("주의", "warn"),
    danger: badge("부족", "danger")
  };
  return map[status] ?? badge(status);
}

function categoryName(categoryId) {
  return categories.find((category) => category.id === categoryId)?.name ?? "-";
}

function supplierName(supplierId) {
  return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "-";
}

function productName(productId) {
  return productEngine.findProductById(productId)?.name ?? "-";
}

function formatTime(value) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const template = document.querySelector("#toast-template");
  const toast = template.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    state.query = "";
    render();
  });
});

healthButton.addEventListener("click", runHealthCheck);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

eventEngine.record("app.started", { version: "1.0", architecture: "core-engine-first" });
render();
