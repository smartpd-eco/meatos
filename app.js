const state = {
  view: "dashboard",
  query: "",
  manualSales: [
    { product: "삼겹살", quantity: 3.2, unit: "kg", amount: 67200 },
    { product: "미박 앞다리살", quantity: 5.5, unit: "kg", amount: 71500 }
  ],
  aliasCandidates: [
    { raw: "생삼겹", standard: "삼겹살", score: 96, status: "matched" },
    { raw: "미전지", standard: "미박 앞다리살", score: 91, status: "matched" },
    { raw: "냉장목심", standard: "목살", score: 86, status: "needs_review" },
    { raw: "LA갈비 선물", standard: "갈비", score: 78, status: "new_alias_candidate" }
  ],
  inventory: [
    { name: "삼겹살", current: 42.5, safe: 35, trend: "증가", status: "ok" },
    { name: "미박 앞다리살", current: 18.2, safe: 25, trend: "감소", status: "warn" },
    { name: "목살", current: 8.4, safe: 18, trend: "급감", status: "danger" },
    { name: "갈비", current: 31.8, safe: 22, trend: "보통", status: "ok" }
  ]
};

const viewTitle = document.querySelector("#view-title");
const appView = document.querySelector("#app-view");
const healthButton = document.querySelector("#run-health-check");
const menuButtons = [...document.querySelectorAll("[data-view]")];

const titles = {
  dashboard: "AI 축산물 유통 SCM 플랫폼",
  alias: "AI관리 - Alias Engine",
  pos: "POS관리 - Universal Adapter",
  inventory: "재고관리 - Inventory Ledger",
  sales: "판매관리 - Manual & POS Sales",
  orders: "발주관리 - AI 발주추천",
  analytics: "분석관리 - 판매 패턴 분석"
};

const money = new Intl.NumberFormat("ko-KR");

function badge(text, status = "") {
  return `<span class="badge ${status}">${text}</span>`;
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

function renderDashboard() {
  return `
    ${metricCard("오늘 POS 판매 수집", "128건", "CSV 74건, Manual 12건, API 42건")}
    ${metricCard("Alias 자동 매칭률", "91%", "검토 필요 7건")}
    ${metricCard("현재고 위험 품목", "2개", "목살, 미박 앞다리살")}
    ${metricCard("AI 발주 추천", "4건", "공급사 확인 대기")}

    <article class="card span-7">
      <div class="toolbar">
        <h3>표준상품 재고 현황</h3>
        <input class="input" id="inventory-search" placeholder="상품명 검색" />
      </div>
      ${inventoryTable()}
    </article>

    <article class="card span-5">
      <h3>Adapter 처리 현황</h3>
      <div class="progress-list">
        ${progressRow("API Adapter", 82)}
        ${progressRow("DB Adapter", 64)}
        ${progressRow("CSV Adapter", 94)}
        ${progressRow("Folder Watch", 77)}
        ${progressRow("Manual Adapter", 100)}
      </div>
    </article>

    <article class="card span-12">
      <h3>AI 운영 알림</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>시간</th><th>구분</th><th>내용</th><th>조치</th></tr>
          </thead>
          <tbody>
            <tr><td>08:40</td><td>${badge("발주", "warn")}</td><td>목살 현재고가 안전재고 이하입니다.</td><td>발주서 생성</td></tr>
            <tr><td>08:22</td><td>${badge("Alias", "warn")}</td><td>냉장목심 상품명이 목살 후보로 분류되었습니다.</td><td>매칭 확정</td></tr>
            <tr><td>07:55</td><td>${badge("POS", "ok")}</td><td>OKPOS CSV 파일 74건을 Import했습니다.</td><td>결과 보기</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAlias() {
  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>AI Alias Engine 매칭 후보</h3>
        <button class="primary-button" id="confirm-alias">선택 후보 확정</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>원본 상품명</th><th>표준상품</th><th>AI 점수</th><th>상태</th><th>사용자 조치</th></tr>
          </thead>
          <tbody>
            ${state.aliasCandidates.map((item) => `
              <tr>
                <td>${item.raw}</td>
                <td>${item.standard}</td>
                <td>${item.score}%</td>
                <td>${aliasStatus(item.status)}</td>
                <td><button class="secondary-button" data-toast="${item.raw} 매칭을 검토 목록에 반영했습니다.">검토</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
    <article class="card span-6">
      <h3>표준상품 등록</h3>
      <div class="form-grid">
        <input class="input" placeholder="표준상품명" />
        <select class="select"><option>돼지고기</option><option>소고기</option><option>가공품</option></select>
        <button class="primary-button" data-toast="표준상품 임시 등록 화면입니다.">등록</button>
      </div>
    </article>
    <article class="card span-6">
      <h3>Alias 판단 기준</h3>
      <p class="label">문자열 유사도, 부위 사전, 거래처별 이력, 원산지, 보관상태, 바코드, 사용자 확정 이력을 함께 반영합니다.</p>
    </article>
  `;
}

function renderPos() {
  return `
    <article class="card span-8">
      <div class="toolbar">
        <h3>Universal POS Adapter</h3>
        <button class="primary-button" id="simulate-import">CSV Import 실행</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Level</th><th>Adapter</th><th>상태</th><th>설명</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>API Adapter</td><td>${badge("준비", "ok")}</td><td>OKPOS 등 API 제공 POS 연동</td></tr>
            <tr><td>2</td><td>DB Adapter</td><td>${badge("읽기전용")}</td><td>MSSQL, SQLite, Firebird, MySQL, Access 조회</td></tr>
            <tr><td>3</td><td>CSV Adapter</td><td>${badge("MVP", "ok")}</td><td>판매 CSV 업로드와 컬럼 매핑</td></tr>
            <tr><td>4</td><td>Folder Watch</td><td>${badge("감시중", "ok")}</td><td>Export 폴더 신규 파일 자동 Import</td></tr>
            <tr><td>5</td><td>Printer Adapter</td><td>${badge("후순위")}</td><td>영수증 출력 Parser</td></tr>
            <tr><td>6</td><td>Barcode Adapter</td><td>${badge("대기")}</td><td>블루투스 바코드 판매 입력</td></tr>
            <tr><td>7</td><td>Manual Adapter</td><td>${badge("필수", "ok")}</td><td>POS 없는 매장 판매 등록</td></tr>
          </tbody>
        </table>
      </div>
    </article>
    <article class="card span-4">
      <h3>POS Health Check</h3>
      <p class="label">제조사, 버전, DB, API, CSV 폴더, 프린터, 바코드 스캐너를 점검해 추천 Adapter를 판단합니다.</p>
      <button class="primary-button" id="run-pos-scan">점검 실행</button>
      <div id="health-result" class="progress-list" style="margin-top:16px"></div>
    </article>
  `;
}

function renderInventory() {
  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>Inventory Ledger</h3>
        <button class="secondary-button" data-toast="재고 조정 모달은 다음 구현 단계에서 연결합니다.">재고 조정</button>
      </div>
      ${inventoryTable()}
    </article>
    <article class="card span-12">
      <h3>재고 계산 기준</h3>
      <p class="label">입고 + 재고조정 + 반품입고 - 판매 - 폐기 - 출고 = 현재고. 현재고 컬럼 직접 수정 대신 Ledger 누적으로 관리합니다.</p>
    </article>
  `;
}

function renderSales() {
  return `
    <article class="card span-5">
      <h3>Manual 판매등록</h3>
      <div class="form-grid">
        <input class="input" id="sale-product" placeholder="상품명" value="삼겹살" />
        <input class="input" id="sale-qty" type="number" step="0.1" value="1.5" />
        <button class="primary-button" id="add-sale">판매등록</button>
      </div>
    </article>
    <article class="card span-7">
      <h3>오늘 판매 Ledger</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품</th><th>수량</th><th>금액</th><th>Source</th></tr></thead>
          <tbody>
            ${state.manualSales.map((sale) => `
              <tr><td>${sale.product}</td><td>${sale.quantity}${sale.unit}</td><td>${money.format(sale.amount)}원</td><td>${badge("manual", "ok")}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderOrders() {
  return `
    <article class="card span-12">
      <h3>AI 발주추천</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품</th><th>현재고</th><th>안전재고</th><th>추천 발주</th><th>사유</th></tr></thead>
          <tbody>
            <tr><td>목살</td><td>8.4kg</td><td>18kg</td><td>${badge("20kg", "warn")}</td><td>최근 3일 평균 대비 재고 부족</td></tr>
            <tr><td>미박 앞다리살</td><td>18.2kg</td><td>25kg</td><td>${badge("15kg", "warn")}</td><td>주말 판매 증가 패턴</td></tr>
            <tr><td>삼겹살</td><td>42.5kg</td><td>35kg</td><td>${badge("보류")}</td><td>현재고 안정권</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAnalytics() {
  return `
    <article class="card span-6">
      <h3>판매 패턴 분석</h3>
      <div class="progress-list">
        ${progressRow("삼겹살", 88)}
        ${progressRow("목살", 39)}
        ${progressRow("갈비", 72)}
        ${progressRow("앞다리살", 61)}
      </div>
    </article>
    <article class="card span-6">
      <h3>AI 이상 판매 감지</h3>
      <p class="label">갈비 판매가 최근 14일 평균 대비 230% 증가했습니다. 행사, 단체주문, POS 중복 입력 여부 확인이 필요합니다.</p>
      <button class="primary-button" data-toast="이상 판매 검토 항목으로 등록했습니다.">검토 등록</button>
    </article>
  `;
}

function inventoryTable() {
  const rows = state.inventory
    .filter((item) => item.name.includes(state.query))
    .map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.current}kg</td>
        <td>${item.safe}kg</td>
        <td>${item.trend}</td>
        <td>${inventoryStatus(item.status)}</td>
      </tr>
    `)
    .join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>표준상품</th><th>현재고</th><th>안전재고</th><th>판매추세</th><th>상태</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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

function aliasStatus(status) {
  const map = {
    matched: badge("자동매칭", "ok"),
    needs_review: badge("검토필요", "warn"),
    new_alias_candidate: badge("신규후보", "warn"),
    rejected: badge("제외", "danger")
  };
  return map[status] ?? badge(status);
}

function inventoryStatus(status) {
  const map = {
    ok: badge("정상", "ok"),
    warn: badge("주의", "warn"),
    danger: badge("부족", "danger")
  };
  return map[status] ?? badge(status);
}

function render() {
  viewTitle.textContent = titles[state.view];
  menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  const views = {
    dashboard: renderDashboard,
    alias: renderAlias,
    pos: renderPos,
    inventory: renderInventory,
    sales: renderSales,
    orders: renderOrders,
    analytics: renderAnalytics
  };

  appView.innerHTML = views[state.view]();
  bindViewEvents();
}

function bindViewEvents() {
  document.querySelectorAll("[data-toast]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.toast));
  });

  document.querySelector("#inventory-search")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
    const search = document.querySelector("#inventory-search");
    search?.focus();
  });

  document.querySelector("#confirm-alias")?.addEventListener("click", () => {
    showToast("검토 가능한 Alias 후보를 표준상품 매칭 이력에 반영했습니다.");
  });

  document.querySelector("#simulate-import")?.addEventListener("click", () => {
    showToast("CSV 74건을 표준 판매 Ledger로 변환했습니다.");
  });

  document.querySelector("#run-pos-scan")?.addEventListener("click", renderHealthResult);

  document.querySelector("#add-sale")?.addEventListener("click", () => {
    const product = document.querySelector("#sale-product").value.trim() || "미지정 상품";
    const quantity = Number(document.querySelector("#sale-qty").value || 0);
    state.manualSales.unshift({
      product,
      quantity,
      unit: "kg",
      amount: Math.round(quantity * 21000)
    });
    showToast(`${product} ${quantity}kg 판매를 Ledger에 등록했습니다.`);
    render();
  });
}

function renderHealthResult() {
  const result = document.querySelector("#health-result");
  result.innerHTML = `
    ${progressRow("제조사 추정", 88)}
    ${progressRow("CSV 폴더", 94)}
    ${progressRow("DB 읽기", 61)}
    <p class="label">추천 Adapter: Level 3 CSV Adapter + Level 4 Folder Watch</p>
  `;
  showToast("POS Health Check를 완료했습니다.");
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

healthButton.addEventListener("click", () => {
  state.view = "pos";
  render();
  renderHealthResult();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
