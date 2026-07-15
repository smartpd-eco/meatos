import { AiEngine } from "./src/core/ai-engine.js";
import { EventEngine } from "./src/core/event-engine.js";
import { InventoryEngine } from "./src/core/inventory-engine.js";
import { ProductEngine } from "./src/core/product-engine.js";
import { AliasMemoryStore } from "./src/data/alias-memory-store.js";
import { GoodChuksanSourceStore } from "./src/data/good-chuksan-source-store.js";
import { goodChuksanBatch, goodChuksanSourceRows } from "./src/data/good-chuksan-seed.js";
import { DATA_COLLECTION_FLOW, DATA_COLLECTION_LEVELS } from "./src/data/data-collection-plan.js";
import { ImportQueueStore } from "./src/data/import-queue-store.js";
import { OcrDictionaryHistoryStore } from "./src/data/ocr-dictionary-history-store.js";
import { buildOcrDictionaryCandidates } from "./src/data/ocr-dictionary-candidate-engine.js";
import { OcrDocumentQueueStore, OCR_FAILURE_STATUSES, OCR_RETRY_DELAYS_MS, OCR_STATUS_FLOW } from "./src/data/ocr-document-queue-store.js";
import { OCR_PIPELINE_STEPS, OCR_PROVIDER_REGISTRY } from "./src/data/ocr-provider-registry.js";
import { processUploadedOcrImage } from "./src/data/ocr-image-pipeline.js";
import { evaluateOcrIntakeQuality } from "./src/data/ocr-intake-policy.js";
import { OcrSupplierTemplateStore } from "./src/data/ocr-supplier-template-store.js";
import { createOcrProviderAdapter } from "./src/data/ocr-provider-adapter.js";
import { OcrFailureLearningStore } from "./src/data/ocr-failure-learning-store.js";
import { OcrProviderHealthLogStore } from "./src/data/ocr-provider-health-log-store.js";
import { OcrOperationLogStore } from "./src/data/ocr-operation-log-store.js";
import { LearningTableStore } from "./src/data/learning-table-store.js";
import { OcrProductCandidateStore } from "./src/data/ocr-product-candidate-store.js";
import { createTenantContext } from "./src/data/tenant-context.js";
import { TENANT_TEST_FIXTURES } from "./src/data/tenant-test-fixtures.js";
import { createTenantRepositoryHelper } from "./src/data/tenant-repository-helper.js";
import { summarizeProductAttributes } from "./src/data/product-attribute-standard.js";
import { SourceRegistryStore } from "./src/data/source-registry-store.js";
import { SOURCE_REGISTRY, summarizeAuthorityLevels } from "./src/data/source-registry.js";
import { SupabaseHealthLogStore } from "./src/data/supabase-health-log-store.js";
import { SUPABASE_PUBLIC_CONFIG } from "./src/data/supabase-public-config.js";
import { OCR_RUNTIME_CONFIG } from "./src/data/ocr-runtime-config.js";
import { buildSelectiveOcrRegions, summarizeSelectiveRegions } from "./src/data/ocr-selective-crop.js";
import { inferSupplierColumnLayout } from "./src/data/ocr-table-reconstructor.js";
import { postApprovedOcrDocumentToInventory } from "./src/data/ocr-inventory-posting-service.js";
import { mergeSelectiveOcrResults } from "./src/data/ocr-provider-ensemble.js";
import { runSupabaseHealthCheck } from "./src/data/supabase-health-check.js";
import { createSupabaseDatabaseAdapter } from "./src/data/supabase-db-adapter.js";
import { createSupabaseRestClient } from "./src/data/supabase-rest-client.js";
import { resolveOcrCandidateRoute } from "./src/data/ocr-dictionary-candidate-engine.js";
import { aliasMemory, categories, aliases, ledger, products, salesPatternRows, suppliers } from "./src/data/mock-data.js";
import { PosAdapterPlugin } from "./src/plugins/pos-adapter.js";
import { ProductCatalogService } from "./services/product/product-catalog-service.js";

const eventEngine = new EventEngine();
const aliasMemoryStore = new AliasMemoryStore(aliasMemory);
const productEngine = new ProductEngine({ categories, products, aliases, suppliers, aliasMemoryStore });
const learningTableSeed = aliasMemory.map((entry) => ({
  supplierId: entry.supplierId,
  originalName: entry.rawName,
  productMasterId: entry.productId,
  confidence: entry.confidence,
  learningCount: entry.usageCount,
  autoApply: entry.confidence >= 90,
  lastUsedAt: entry.lastSeenAt,
  createdAt: entry.firstSeenAt,
  updatedAt: entry.lastSeenAt
}));
const learningTableStore = new LearningTableStore(learningTableSeed);
const ocrProductCandidateStore = new OcrProductCandidateStore([]);
const ocrSupplierTemplateStore = new OcrSupplierTemplateStore([]);
const ocrFailureLearningStore = new OcrFailureLearningStore();
const ocrProviderHealthLogStore = new OcrProviderHealthLogStore();
const ocrOperationLogStore = new OcrOperationLogStore();
const sourceRegistryStore = new SourceRegistryStore(SOURCE_REGISTRY);
const importQueueStore = new ImportQueueStore([
  {
    importId: "imp-good-chuksan-001",
    sourceId: "src-l5-good-chuksan",
    sourceName: "좋은축산",
    sourceType: "supplier",
    authorityLevel: "L5",
    payloadType: "xlsx",
    status: "NEW",
    reviewStatus: "pending_review",
    reviewer: "",
    reviewNote: "원본 1,615건 적재 대기"
  }
]);
const ocrDictionaryHistoryStore = new OcrDictionaryHistoryStore([]);
  const ocrDocumentQueueStore = new OcrDocumentQueueStore([
    {
      documentId: "doc-ocr-0001",
      sourceId: "src-l5-good-chuksan",
      sourceName: "좋은축산",
      supplierName: "좋은축산",
      fileName: "good-chuksan-invoice-sample.jpg",
      status: "REVIEW_REQUIRED",
      reviewStatus: "PENDING",
      qualityScore: 91,
      meatosScore: 92,
      providerConfidence: 94,
      ocrProviderId: "clova-general",
      fileHash: "good-chuksan-sample-hash-01",
      originalImageHash: "good-chuksan-sample-hash-01",
      originalImage: {
        fileName: "good-chuksan-invoice-sample.jpg",
        mimeType: "image/jpeg",
        hash: "good-chuksan-sample-hash-01",
        capturedAt: "2026-07-11T00:00:00.000Z"
      },
      ocrRawJson: {
        providerId: "clova-general",
        providerConfidence: 94,
        rawText: `좋은축산\n010-1111-2222\n삼겹살 2 14500\n미박앞다리살 3 11200\n합계 63400`
      },
      parsedJson: {
        documentFields: {
          supplierName: "좋은축산",
          supplierBusinessNo: "",
          invoiceNo: "INV-20260711-01",
          invoiceDate: "2026-07-11",
          supplyAmount: 63400,
          taxAmount: 6340,
          totalAmount: 69740,
          livestockTraceNo: "",
          slaughterCertificateReference: ""
        },
        validation: {
          totalMatched: true,
          lineCount: 2,
          calculationOk: true,
          issues: []
        },
        meatosScore: 92
      },
      rawText: `좋은축산\n010-1111-2222\n삼겹살 2 14500\n미박앞다리살 3 11200\n합계 63400`,
      documentFields: {
        supplierName: "좋은축산",
        supplierBusinessNo: "",
        invoiceNo: "INV-20260711-01",
      invoiceDate: "2026-07-11",
      supplyAmount: 63400,
      taxAmount: 6340,
      totalAmount: 69740,
      livestockTraceNo: "",
      slaughterCertificateReference: ""
    },
      lineItems: [
        { rowNo: 1, rawProductName: "삼겹살", normalizedProductName: "삼겹살", specification: "", quantity: 2, unit: "kg", unitPrice: 14500, amount: 29000, origin: "국내산", grade: "1+", storageType: "fresh", dictionaryCandidateId: "", productMasterId: "", confidence: 88, reviewStatus: "PENDING" },
        { rowNo: 2, rawProductName: "미박앞다리살", normalizedProductName: "미박앞다리살", specification: "", quantity: 3, unit: "kg", unitPrice: 11200, amount: 33600, origin: "국내산", grade: "1+", storageType: "fresh", dictionaryCandidateId: "", productMasterId: "", confidence: 86, reviewStatus: "PENDING" }
      ],
      validation: {
        totalMatched: true,
        lineCount: 2,
        calculationOk: true,
        issues: []
      },
      reviewResult: {
        outcome: "REVIEW_REQUIRED",
        confidence: 92,
        issues: [],
        action: "review"
      }
    }
  ]);
const productCatalogService = new ProductCatalogService({ productEngine, eventEngine, learningTableStore });
if (!productEngine.findSupplierById("sup-good-chuksan")) {
  productCatalogService.createSupplier({
    name: "좋은축산",
    businessNumber: "",
    manager: "",
    phone: "",
    leadTimeDays: 1,
    isActive: true
  }, "system");
}
const goodChuksanSupplierId = productEngine.listSuppliers({ activeOnly: false }).find((supplier) => supplier.name === "좋은축산")?.id ?? "";
const goodChuksanSourceStore = new GoodChuksanSourceStore({ batch: goodChuksanBatch, seedRows: goodChuksanSourceRows });
const inventoryEngine = new InventoryEngine({ products: productEngine.listProducts(), ledger }, eventEngine);
const aiEngine = new AiEngine({ productEngine, inventoryEngine, eventEngine });
const posAdapter = new PosAdapterPlugin({ productEngine, inventoryEngine, eventEngine });
const supabaseRestClient = createSupabaseRestClient(SUPABASE_PUBLIC_CONFIG);
const supabaseAdapter = createSupabaseDatabaseAdapter(supabaseRestClient);
const tenantContext = createTenantContext();
const tenantRepository = createTenantRepositoryHelper(supabaseAdapter, tenantContext);
const supabaseHealthLogStore = new SupabaseHealthLogStore();

const state = {
  view: "dashboard",
  query: "",
  editCategoryId: null,
  editProductId: null,
  editSupplierId: null,
  editAliasId: null,
  editAliasMemoryId: null,
  goodChuksanQuery: "",
  goodChuksanUnit2: "",
  goodChuksanOrigin: "",
  goodChuksanStorage: "",
  goodChuksanMappingStatus: "",
  goodChuksanReviewStatus: "",
  goodChuksanOnlyDuplicates: false,
  goodChuksanOnlyCostItems: false,
  sourceRegistryQuery: "",
  editSourceRegistryId: null,
  importQueueQuery: "",
  ocrQuery: "",
  ocrProviderId: "",
  ocrReviewStatus: "",
  ocrDocumentId: "",
  ocrSelectedLineNo: 1,
  ocrInputPickerOpen: false,
  ocrInputSource: "camera",
  ocrRealWorld: {
    fileName: "",
    supplierName: "",
    providerId: "paddleocr",
    rotationDegrees: "auto",
    ocrText: "",
    originalImageDataUrl: "",
    preprocessedImageDataUrl: "",
    imageAnalysis: null,
    intakeDecision: null,
    pipelineTrace: [],
    qualityScore: 0,
    warnings: [],
    status: "idle",
    error: "",
    documentId: ""
  },
  ocrProviderHealth: null,
  lastImport: null,
  lastHealthCheck: null,
  importQueueStatus: "",
  lastOcrRun: null,
  supabase: {
    status: "idle",
    apiReachable: "unknown",
    checkedAt: null,
    error: "",
    errorMessage: "",
    latencyMs: 0,
    schema: "public",
    migrationStatus: "unknown",
    seedStatus: "unknown",
    readStatus: "unknown",
    tables: {}
  }
};

const viewTitle = document.querySelector("#view-title");
const appView = document.querySelector("#app-view");
const healthButton = document.querySelector("#run-health-check");
const supabaseButton = document.querySelector("#run-supabase-check");
const mobileBackButton = document.querySelector("#mobile-back-button");
const menuButtons = [...document.querySelectorAll("[data-view]")];

const titles = {
  dashboard: "고기장터",
  sales: "매출",
  services: "신고/부가서비스",
  more: "더보기",
  inventory: "재고",
  engines: "Core Engine 구조",
  products: "Product Engine + Alias Engine",
  goodChuksan: "좋은축산 원본 적재",
  ocr: "OCR 거래명세서",
  dataCollection: "데이터 수집 마스터 플랜",
  events: "Event Log",
  pos: "POS Plugin 연결 확인",
  ai: "AI 추천 연결 확인"
};

function renderDashboard() {
  const catalog = productCatalogService.getCatalogSnapshot();
  const stockRows = inventoryEngine.getStockRows();
  const lowStockRows = stockRows.filter((row) => row.status !== "ok");
  const topSaleRow = [...salesPatternRows].sort((a, b) => b.today - a.today)[0] ?? null;
  const todaySaleUnits = salesPatternRows.reduce((sum, row) => sum + Number(row.today ?? 0), 0);
  const monthSaleUnits = salesPatternRows.reduce((sum, row) => sum + Number(row.today ?? 0) * 30, 0);
  const todayImportCount = importQueueStore.list({ status: "NEW" }).length;
  const pendingReviewCount = ocrDocumentQueueStore.list({ reviewStatus: "PENDING" }).length;
  const serviceCount = sourceRegistryStore.list({ activeOnly: false }).length;
  const briefingRows = [
    topSaleRow ? `오늘 가장 많이 팔린 상품은 ${topSaleRow.productName}입니다.` : "오늘 판매 데이터가 아직 적습니다.",
    lowStockRows.length ? `부족 품목이 ${lowStockRows.length}개 있습니다. 확인이 필요합니다.` : "현재 재고는 안정적입니다.",
    `입고 대기 ${todayImportCount}건 / 검토 대기 ${pendingReviewCount}건입니다.`,
    `연결된 거래처는 ${catalog.suppliers.length}곳, 서비스 분류는 ${serviceCount}개입니다.`
  ];

  return `
    <section class="mobile-dashboard span-12" aria-label="고기장터 모바일 대시보드">
      <header class="mobile-dashboard-brand">
        <span class="mobile-brand-icon" aria-hidden="true">고</span>
        <strong>고기장터</strong>
        <span class="mobile-alert-icon" aria-label="알림 2건">2</span>
      </header>

      <nav class="mobile-primary-nav" aria-label="주요 업무">
        <button type="button" data-ocr-input-open><span aria-hidden="true">▣</span><strong>입력</strong></button>
        <button type="button" data-home-view="inventory"><span aria-hidden="true">□</span><strong>재고</strong></button>
        <button type="button" data-home-view="sales"><span aria-hidden="true">₩</span><strong>매출</strong></button>
        <button type="button" data-home-view="services"><span aria-hidden="true">✓</span><strong>신고/부가</strong></button>
        <button type="button" data-home-view="more"><span aria-hidden="true">•••</span><strong>더보기</strong></button>
      </nav>

      <button class="mobile-receipt-action" type="button" data-ocr-input-open>
        <span class="mobile-receipt-icon" aria-hidden="true">●</span>
        <span><strong>고기가 들어왔어요!</strong><small>사진 찍기 · 파일 불러오기 · 자동 인식</small></span>
      </button>

      <div class="mobile-kpi-grid">
        <button type="button" class="mobile-kpi-card sales" data-home-view="sales">
          <span>매출현황 <small>오늘</small></span>
          <strong>${todaySaleUnits}건</strong>
          <small>이번 달 ${monthSaleUnits.toLocaleString("ko-KR")}건</small>
        </button>
        <button type="button" class="mobile-kpi-card purchase" data-home-view="ocr">
          <span>매입현황 <small>오늘</small></span>
          <strong>${todayImportCount}건</strong>
          <small>공급사 ${catalog.suppliers.length}곳</small>
        </button>
        <button type="button" class="mobile-kpi-card inventory" data-home-view="inventory">
          <span>재고현황 <small>전체</small></span>
          <strong>${stockRows.length}개 품목</strong>
          <small>부족 ${lowStockRows.length}개</small>
        </button>
        <button type="button" class="mobile-kpi-card review" data-home-view="ocr">
          <span>검토 대기 <small>전체</small></span>
          <strong>${pendingReviewCount}건</strong>
          <small>확인이 필요합니다</small>
        </button>
      </div>

      <footer class="mobile-dashboard-footer">© 2026 MEATOS. All rights reserved.</footer>
    </section>

    <article class="card span-12 hero-home mobile-primary-section desktop-dashboard-card">
      <div class="toolbar">
        <div>
          <p class="eyebrow">고기장터</p>
          <h3>AI 정육점 통합관리 시스템</h3>
        </div>
        <span class="label">3초 안에 상태를 보고, 버튼 하나만 누르면 됩니다.</span>
      </div>
      <button class="primary-button home-main-action" data-ocr-input-open>
        <span>🥩 고기가 들어왔어요!</span>
        <small>사진 찍기 · 파일 불러오기 · AI 이미지 보정 · OCR · 상품 자동인식 · 재고 자동등록</small>
      </button>
      <div class="home-flow">
        <span>카메라 실행</span>
        <span>AI 이미지 보정</span>
        <span>OCR</span>
        <span>상품 자동인식</span>
        <span>재고 자동등록</span>
        <strong>완료</strong>
      </div>
      <div class="home-status-grid">
        <button class="home-card" data-home-view="sales">
          <strong>매출현황</strong>
          <span>${todaySaleUnits}건 / 이번 달 ${monthSaleUnits}건</span>
        </button>
        <button class="home-card" data-home-view="more">
          <strong>매입현황</strong>
          <span>입고 대기 ${todayImportCount}건 / 공급사 ${catalog.suppliers.length}곳</span>
        </button>
        <button class="home-card" data-home-view="inventory">
          <strong>재고현황</strong>
          <span>전체 ${stockRows.length}개 / 부족 ${lowStockRows.length}개</span>
        </button>
        <button class="home-card" data-home-view="more">
          <strong>신고/부가서비스</strong>
          <span>검토 대기 ${pendingReviewCount}건 / 서비스 ${serviceCount}개</span>
        </button>
      </div>
    </article>

    <article class="card span-12 home-briefing desktop-dashboard-card">
      <div class="toolbar">
        <h3>AI 오늘의 브리핑</h3>
        <span class="label">업무에 필요한 것만 간단히 보여줍니다.</span>
      </div>
      <div class="stack-list">
        ${briefingRows.map((row, index) => `<div class="home-info"><span>${index + 1}.</span><strong>${escapeHtml(row)}</strong></div>`).join("")}
      </div>
    </article>

    <article class="card span-6 home-support-section desktop-dashboard-card">
      <h3>오늘 할 일</h3>
      <div class="stack-list">
        <div class="home-task"><strong>1.</strong> 거래명세서 사진 찍기</div>
        <div class="home-task"><strong>2.</strong> 확인 누르기</div>
        <div class="home-task"><strong>3.</strong> 재고 반영 확인</div>
      </div>
    </article>

    <article class="card span-6 home-support-section desktop-dashboard-card">
      <h3>바로 쓰는 정보</h3>
      <div class="stack-list">
        <div class="home-info"><span>공급사</span><strong>${catalog.suppliers.length}곳</strong></div>
        <div class="home-info"><span>표준상품</span><strong>${catalog.products.length}개</strong></div>
        <div class="home-info"><span>알림</span><strong>${lowStockRows.length}건</strong></div>
        <div class="home-info"><span>이번 달 판매</span><strong>${monthSaleUnits}건</strong></div>
      </div>
    </article>
  `;
}

function renderSales() {
  const topSaleRow = [...salesPatternRows].sort((a, b) => b.today - a.today);
  const weekUnits = salesPatternRows.reduce((sum, row) => sum + Number(row.today ?? 0) * 7, 0);
  const monthUnits = salesPatternRows.reduce((sum, row) => sum + Number(row.today ?? 0) * 30, 0);
  const reorderRows = aiEngine.recommendPurchases().slice(0, 4);

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>매출</h3>
        <span class="label">사용자가 가장 자주 보는 화면</span>
      </div>
      <div class="kpi-strip">
        <div class="kpi-tile"><span class="kpi-value">${salesPatternRows.reduce((sum, row) => sum + Number(row.today ?? 0), 0)}건</span><span class="kpi-label">오늘 매출</span><span class="kpi-hint">판매량 기준</span></div>
        <div class="kpi-tile"><span class="kpi-value">${weekUnits}건</span><span class="kpi-label">이번 주</span><span class="kpi-hint">추세 요약</span></div>
        <div class="kpi-tile"><span class="kpi-value">${monthUnits}건</span><span class="kpi-label">이번 달</span><span class="kpi-hint">예상 누적</span></div>
      </div>
    </article>

    <article class="card span-6">
      <h3>인기상품</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품</th><th>평균</th><th>오늘</th></tr></thead>
          <tbody>
            ${topSaleRow.map((row) => `
              <tr>
                <td>${escapeHtml(row.productName)}</td>
                <td>${row.average}</td>
                <td>${badge(String(row.today), row.today > row.average * 2 ? "warn" : "ok")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="card span-6">
      <h3>재주문 예상</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상품</th><th>현재고</th><th>추천</th></tr></thead>
          <tbody>
            ${reorderRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.productName)}</td>
                <td>${row.currentStock}kg</td>
                <td>${badge(`${row.recommendedQuantity}kg`, "warn")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderMore() {
  const expertLinks = [
    { view: "ocr", title: "OCR 상태", hint: "사진 분석 / AI 분석 보기 / 템플릿 학습" },
    { view: "products", title: "공급사 관리", hint: "상품 / Alias / 거래처" },
    { view: "dataCollection", title: "AI 학습", hint: "데이터 수집 / 정리 / 누적" },
    { view: "events", title: "사용자 관리", hint: "로그 / 이력 / 작업 기록" },
    { view: "inventory", title: "백업", hint: "재고 / 이력 / 연결 상태" },
    { view: "engines", title: "환경설정", hint: "Core 구조 / 시스템 연결" },
    { view: "engines", title: "Tenant Context", hint: "업체 분리 / 연결 컨텍스트" }
  ];

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>더보기</h3>
        <span class="label">전문 기능은 이곳에 배치합니다.</span>
      </div>
      <div class="home-quick-grid">
        ${expertLinks.map((item) => `
          <button class="home-card" data-home-view="${item.view}">
            <strong>${item.title}</strong>
            <span>${item.hint}</span>
          </button>
        `).join("")}
      </div>
    </article>

    <article class="card span-12">
      <h3>도움말</h3>
      <p class="label">사진 찍기 → 확인 → 완료 순서만 익히면 됩니다. 나머지는 AI가 뒤에서 처리합니다.</p>
    </article>
  `;
}

function renderSupabaseMetricCard() {
  const supabase = state.supabase;
  const status =
    supabase.status === "connected"
      ? badge("연결됨", "ok")
      : supabase.status === "probing"
        ? badge("확인중", "warn")
        : supabase.status === "error"
          ? badge("실패", "danger")
          : badge("대기", "warn");
  const tableCount = Object.keys(supabase.tables ?? {}).length;
  const checkedAt = supabase.checkedAt ? formatTime(supabase.checkedAt) : "-";
  const apiReachable = supabase.apiReachable === "yes" ? badge("OK", "ok") : supabase.apiReachable === "no" ? badge("FAIL", "danger") : badge("대기", "warn");
  const readStatus = supabase.readStatus === "ok" ? badge("OK", "ok") : supabase.readStatus === "failed" ? badge("FAIL", "danger") : badge("대기", "warn");

  return `
    <article class="card span-6">
      <div class="metric">${status}</div>
      <div class="label">Supabase Read</div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <tbody>
            <tr><td>Connection</td><td>${status}</td></tr>
            <tr><td>API Reachable</td><td>${apiReachable}</td></tr>
            <tr><td>Schema</td><td>${badge(String(supabase.schema ?? "public"), "ok")}</td></tr>
            <tr><td>Migration</td><td>${badge(String(supabase.migrationStatus ?? "unknown"), supabase.migrationStatus === "applied" ? "ok" : "warn")}</td></tr>
            <tr><td>Seed</td><td>${badge(String(supabase.seedStatus ?? "unknown"), supabase.seedStatus === "present" ? "ok" : "warn")}</td></tr>
            <tr><td>Read Test</td><td>${readStatus}</td></tr>
            <tr><td>Latency</td><td>${badge(`${Number(supabase.latencyMs ?? 0)} ms`, supabase.latencyMs <= 1200 ? "ok" : "warn")}</td></tr>
            <tr><td>Tenant Master</td><td>${badge(String(supabase.tables?.tenant_master ?? 0), "ok")}</td></tr>
            <tr><td>Tenant Routing</td><td>${badge(String(supabase.tables?.tenant_routing ?? 0), "ok")}</td></tr>
            <tr><td>Tenant Usage</td><td>${badge(String(supabase.tables?.tenant_usage_daily ?? 0), "ok")}</td></tr>
            <tr><td>최근 검사</td><td>${checkedAt}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="label">Table probe: ${tableCount}개</p>
      <p class="label">${escapeHtml(supabase.errorMessage || supabase.error || "읽기 전용 연결 준비")}</p>
    </article>
  `;
}

function renderSupabaseHealthLog() {
  const entries = supabaseHealthLogStore.list(5);
  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>Supabase Health Log</h3>
        <span class="label">최근 검사 ${entries.length}건</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>시각</th><th>Connection</th><th>API</th><th>Migration</th><th>Seed</th><th>Latency</th><th>Message</th></tr></thead>
          <tbody>
            ${entries.map((entry) => `
              <tr>
                <td>${formatTime(entry.checkedAt)}</td>
                <td>${badge(entry.status, entry.status === "connected" ? "ok" : entry.status === "partial" ? "warn" : "danger")}</td>
                <td>${badge(entry.readStatus, entry.readStatus === "ok" ? "ok" : "warn")}</td>
                <td>${badge(entry.migrationStatus, entry.migrationStatus === "applied" ? "ok" : "warn")}</td>
                <td>${badge(entry.seedStatus, entry.seedStatus === "present" ? "ok" : "warn")}</td>
                <td>${badge(`${Number(entry.latencyMs ?? 0)} ms`, "ok")}</td>
                <td>${escapeHtml(entry.errorMessage || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderOcrProviderHealthCard() {
  const summary = ocrProviderHealthLogStore.summary();
  const latest = summary.latest;
  const connectionBadge = latest
    ? latest.secretConnected
      ? badge("연결됨", "ok")
      : badge("대기", "warn")
    : badge("대기", "warn");
  const providerLabel = latest
    ? `${latest.providerName || "미확인"} / ${latest.providerVersion || "-"}`
    : "아직 점검되지 않음";
  const modeLabel = latest?.providerMode || "unknown";
  const statusLabel = summary.failureCount > 0 && latest?.secretConnected === false ? badge("재확인", "danger") : badge(summary.statusLabel, summary.statusLabel === "OK" ? "ok" : "warn");

  return `
    <article class="card span-6">
      <div class="metric">${connectionBadge}</div>
      <div class="label">OCR Provider Health</div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <tbody>
            <tr><td>Secret 연결</td><td>${connectionBadge}</td></tr>
            <tr><td>Provider</td><td>${escapeHtml(providerLabel)}</td></tr>
            <tr><td>Mode</td><td>${badge(escapeHtml(modeLabel), modeLabel === "edge-function" ? "ok" : modeLabel === "mock" ? "warn" : "danger")}</td></tr>
            <tr><td>평균 응답시간</td><td>${badge(`${summary.averageLatencyMs} ms`, summary.averageLatencyMs <= 1500 ? "ok" : "warn")}</td></tr>
            <tr><td>마지막 호출</td><td>${summary.lastCheckedAt ? escapeHtml(formatTime(summary.lastCheckedAt)) : "-"}</td></tr>
            <tr><td>실패 횟수</td><td>${badge(`${summary.failureCount}건`, summary.failureCount > 0 ? "warn" : "ok")}</td></tr>
            <tr><td>Secret 변경</td><td>${summary.rotationDetected ? badge("감지", "warn") : badge("없음", "ok")}</td></tr>
            <tr><td>현재 상태</td><td>${statusLabel}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="label">실운영 연결은 Secret 상태에 따라 자동으로 Mock으로 전환됩니다.</p>
    </article>
  `;
}

function renderDataCollection() {
  const authoritySummary = summarizeAuthorityLevels(sourceRegistryStore.list({ activeOnly: false }));
  const sourceRows = sourceRegistryStore.list({
    query: state.sourceRegistryQuery,
    activeOnly: false
  });
  const importQueue = importQueueStore.search(state.importQueueQuery);
  const editingSource = state.editSourceRegistryId ? sourceRegistryStore.getById(state.editSourceRegistryId) : null;

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>데이터 수집 마스터 플랜</h3>
        <span class="label">출처 우선순위: Level 1 → 6</span>
      </div>
      <p class="label">권위와 신뢰도가 높은 데이터부터 Product Dictionary와 AI Learning에 연결합니다.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>순서</th><th>흐름</th></tr></thead>
          <tbody>
            ${DATA_COLLECTION_FLOW.map((step, index) => `<tr><td>${index + 1}</td><td>${step}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>Source Registry</h3>
        <span class="label">L1 ${authoritySummary.L1} / L2 ${authoritySummary.L2} / L3 ${authoritySummary.L3} / L4 ${authoritySummary.L4} / L5 ${authoritySummary.L5} / L6 ${authoritySummary.L6}</span>
      </div>
      <div class="form-grid">
        <input class="input" id="source-registry-query" placeholder="Source ID / 이름 / 조직 검색" value="${escapeHtml(state.sourceRegistryQuery)}" />
      </div>
      <div class="form-grid">
        <input class="input" id="source-registry-id" placeholder="source_id" value="${escapeHtml(editingSource?.sourceId ?? "")}" />
        <input class="input" id="source-registry-name" placeholder="source_name" value="${escapeHtml(editingSource?.sourceName ?? "")}" />
        <select class="select" id="source-registry-type">${sourceTypeOptionsRegistry(editingSource?.sourceType)}</select>
        <input class="input" id="source-registry-organization" placeholder="organization" value="${escapeHtml(editingSource?.organization ?? "")}" />
        <select class="select" id="source-registry-authority">${authorityLevelOptions(editingSource?.authorityLevel)}</select>
        <input class="input" id="source-registry-collector" placeholder="collector" value="${escapeHtml(editingSource?.collector ?? "")}" />
        <input class="input" id="source-registry-collected-at" placeholder="collected_at" value="${escapeHtml(editingSource?.collectedAt ?? "")}" />
        <select class="select" id="source-registry-status">${filterOptions(["active", "inactive"], editingSource?.status ?? "active", "status")}</select>
        <button class="primary-button span-12" id="save-source-registry">${editingSource ? "수정 저장" : "등록"}</button>
        ${editingSource ? `<button class="secondary-button span-12" id="cancel-source-registry-edit">수정 취소</button>` : ""}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Source ID</th><th>Source Name</th><th>Type</th><th>Organization</th><th>Authority</th><th>Collected</th><th>Collector</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${sourceRows.map((source) => `
              <tr>
                <td>${escapeHtml(source.sourceId)}</td>
                <td>${escapeHtml(source.sourceName)}</td>
                <td>${escapeHtml(sourceTypeLabel(source.sourceType))}</td>
                <td>${escapeHtml(source.organization)}</td>
                <td>${badge(source.authorityLevel, source.authorityLevel === "L1" ? "ok" : source.authorityLevel === "L2" ? "warn" : "")}</td>
                <td>${escapeHtml(formatTime(source.collectedAt))}</td>
                <td>${escapeHtml(source.collector)}</td>
                <td>${badge(source.status, source.status === "active" ? "ok" : "danger")}</td>
                <td class="row-actions">
                  <button class="text-button" data-source-registry-edit="${source.sourceId}">수정</button>
                  <button class="text-button danger" data-source-registry-deactivate="${source.sourceId}">비활성</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>Import Queue</h3>
        <span class="label">${importQueue.length}건</span>
      </div>
      <div class="form-grid">
        <input class="input" id="import-queue-query" placeholder="Import ID / Source / Note 검색" value="${escapeHtml(state.importQueueQuery)}" />
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Import ID</th><th>Source</th><th>Authority</th><th>Payload</th><th>Status</th><th>Review</th><th>Note</th><th>Action</th></tr></thead>
          <tbody>
            ${importQueue.map((item) => `
              <tr>
                <td>${escapeHtml(item.importId)}</td>
                <td>${escapeHtml(item.sourceName)}</td>
                <td>${badge(item.authorityLevel, item.authorityLevel === "L1" ? "ok" : "")}</td>
                <td>${escapeHtml(item.payloadType)}</td>
                <td>${importQueueStatusBadge(item.status)}</td>
                <td>${badge(item.reviewStatus, item.reviewStatus === "approved" ? "ok" : "warn")}</td>
                <td>${escapeHtml(item.reviewNote)}</td>
                <td class="row-actions">
                  <button class="text-button" data-import-approve="${item.importId}">승인</button>
                  <button class="text-button" data-import-hold="${item.importId}">보류</button>
                  <button class="text-button danger" data-import-reject="${item.importId}">반려</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    ${DATA_COLLECTION_LEVELS.map((level) => `
      <article class="card span-6">
        <div class="toolbar">
          <h3>Level ${level.level} · ${level.label}</h3>
          <span class="badge ${level.priority === "highest" ? "ok" : level.priority === "high" ? "warn" : ""}">${level.priority}</span>
        </div>
        <p class="label">${level.usage}</p>
        <div class="stack-list">
          <div><strong>수집 대상</strong><div class="label">${level.sources.map(escapeHtml).join(", ")}</div></div>
          <div><strong>활용 데이터</strong><div class="label">${level.target.map(escapeHtml).join(", ")}</div></div>
        </div>
      </article>
    `).join("")}

    <article class="card span-12">
      <h3>데이터 수집 원칙</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>원칙</th><th>설명</th></tr></thead>
          <tbody>
            <tr><td>출처 우선</td><td>국가 기준을 먼저, 현장 표현은 뒤에 연결합니다.</td></tr>
            <tr><td>원문 보존</td><td>수집된 원문은 수정하지 않고 Alias와 표준값을 별도 관리합니다.</td></tr>
            <tr><td>Review 중심</td><td>자동 확정보다 Review Queue를 유지합니다.</td></tr>
            <tr><td>학습 누적</td><td>검증된 원문만 Learning Table에 쌓습니다.</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

async function refreshSupabaseReadStatus() {
  if (!supabaseAdapter) return;

  state.supabase = {
    status: "probing",
    checkedAt: new Date().toISOString(),
    error: "",
    tables: {}
  };
  render();

  try {
    const health = await runSupabaseHealthCheck({ adapter: supabaseAdapter, config: SUPABASE_PUBLIC_CONFIG });
    const tableCounts = Object.fromEntries(
      Object.entries(health.tableStatus ?? {}).map(([key, value]) => [key, value.count ?? 0])
    );
    state.supabase = {
      status: health.connection,
      apiReachable: health.apiReachable,
      checkedAt: health.checkedAt,
      error: health.errorCode,
      errorMessage: health.errorMessage,
      latencyMs: health.latencyMs,
      schema: health.schema,
      migrationStatus: health.migrationStatus,
      seedStatus: health.seedStatus,
      readStatus: health.readStatus,
      tables: tableCounts
    };
    supabaseHealthLogStore.add({
      checkedAt: health.checkedAt,
      status: health.connection,
      latencyMs: health.latencyMs,
      schema: health.schema,
      migrationStatus: health.migrationStatus,
      seedStatus: health.seedStatus,
      readStatus: health.readStatus,
      tableStatus: health.tableStatus,
      errorCode: health.errorCode,
      errorMessage: health.errorMessage
    });
  } catch (error) {
    state.supabase = {
      status: "error",
      checkedAt: new Date().toISOString(),
      apiReachable: "no",
      error: error?.code ?? "ERROR",
      errorMessage: error?.message ?? "Supabase read failed",
      latencyMs: 0,
      schema: "public",
      migrationStatus: "unknown",
      seedStatus: "unknown",
      readStatus: "failed",
      tables: {}
    };
    supabaseHealthLogStore.add({
      checkedAt: state.supabase.checkedAt,
      status: "error",
      latencyMs: 0,
      schema: "public",
      migrationStatus: "unknown",
      seedStatus: "unknown",
      readStatus: "failed",
      errorCode: error?.code ?? "ERROR",
      errorMessage: error?.message ?? "Supabase read failed"
    });
  }

  render();
}

function renderEngines() {
  const rows = [
    ["Product Engine", "상품분류, 표준상품, Supplier, Alias 관리", "Core"],
    ["Product Attribute", "Species, Part, Storage, Grade 표준화", "Core"],
    ["Product Dictionary", "표준용어, Alias, Attribute, 추천 후보, Review", "Core"],
    ["Source Registry", "수집 출처와 권위 레벨 관리", "Core"],
    ["Import Queue", "수집 데이터의 Review 전 적재 대기", "Core"],
    ["Product Catalog Service", "UI와 Engine 사이의 업무 규칙", "Service"],
    ["Learning Table", "원문명과 표준상품의 누적 학습", "Core"],
    ["Inventory Engine", "입고, 출고, Ledger, 현재고 계산", "Core"],
    ["Event Engine", "중요 작업 이력 저장", "Core"],
    ["POS Adapter", "판매 데이터를 Inventory Engine으로 전달", "Plugin"],
    ["OCR Adapter", "OCR 원본명을 Alias 추천으로 전달", "Plugin"]
  ];

  return `
    <article class="card span-12">
      <h3>Core / Service / Plugin 경계</h3>
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
  `;
}

function renderProductManagement() {
  const catalog = productCatalogService.getCatalogSnapshot();
  const editingCategory = state.editCategoryId ? productEngine.findCategoryById(state.editCategoryId) : null;
  const filteredProducts = productEngine.listProducts({ query: state.query, activeOnly: false });
  const filteredSuppliers = productEngine.listSuppliers({ query: state.query, activeOnly: false });
  const filteredAliases = productEngine.listAliases({ query: state.query, activeOnly: false });
  const filteredAliasMemory = productCatalogService.listAliasMemory({ query: state.query, activeOnly: false });
  const editingProduct = state.editProductId ? productEngine.findProductById(state.editProductId) : null;
  const editingSupplier = state.editSupplierId ? productEngine.findSupplierById(state.editSupplierId) : null;
  const editingAlias = state.editAliasId ? productEngine.findAliasById(state.editAliasId) : null;

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>Product Dictionary / Product Master</h3>
        <input class="input" id="global-search" placeholder="상품, 거래처, Alias 검색" value="${escapeHtml(state.query)}" />
      </div>
      <p class="label">Product Master는 실제 운영 상품이고, Product Dictionary는 표준용어 / Alias / Attribute / 추천 후보 / Review를 관리합니다.</p>
    </article>

    <article class="card span-4">
      <div class="toolbar">
        <h3>카테고리 ${editingCategory ? "수정" : "등록"}</h3>
        ${editingCategory ? `<button class="secondary-button" id="cancel-category-edit">취소</button>` : ""}
      </div>
      <div class="form-grid">
        <input class="input" id="category-code" placeholder="코드" value="${escapeHtml(editingCategory?.code ?? "")}" />
        <input class="input" id="category-name" placeholder="분류명" value="${escapeHtml(editingCategory?.name ?? "")}" />
        <label class="toggle-row"><input type="checkbox" id="category-is-active" ${editingCategory?.isActive !== false ? "checked" : ""} /> 사용중</label>
        <button class="primary-button span-12" id="save-category">${editingCategory ? "수정 저장" : "등록"}</button>
      </div>
    </article>

    <article class="card span-8">
      <h3>Category List</h3>
      ${categoryTable(catalog.categories)}
    </article>

    <article class="card span-6">
      <div class="toolbar">
        <h3>표준상품 ${editingProduct ? "수정" : "등록"}</h3>
        ${editingProduct ? `<button class="secondary-button" id="cancel-product-edit">취소</button>` : ""}
      </div>
      <p class="label">상품은 Attribute 기반으로 저장됩니다. 원본 표기보다 표준 속성을 먼저 맞춥니다.</p>
      <div class="form-grid">
        <input class="input" id="product-name" placeholder="표준상품명" value="${escapeHtml(editingProduct?.name ?? "")}" />
        <select class="select" id="product-category">${categoryOptions(editingProduct?.categoryId)}</select>
        <select class="select" id="product-supplier">${supplierOptions(editingProduct?.supplierId)}</select>
        <input class="input" id="product-cut-name" placeholder="부위명" value="${escapeHtml(editingProduct?.cutName ?? "")}" />
        <input class="input" id="product-species" placeholder="축종" value="${escapeHtml(editingProduct?.species ?? "")}" />
        <input class="input" id="product-part" placeholder="세부부위" value="${escapeHtml(editingProduct?.part ?? "")}" />
        <input class="input" id="product-processing-type" placeholder="가공형태" value="${escapeHtml(editingProduct?.processingType ?? "")}" />
        <input class="input" id="product-skin-type" placeholder="미박/무박" value="${escapeHtml(editingProduct?.skinType ?? "")}" />
        <input class="input" id="product-bone-type" placeholder="유골/무골" value="${escapeHtml(editingProduct?.boneType ?? "")}" />
        <select class="select" id="product-storage-type">${storageOptions(editingProduct?.storageType)}</select>
        <input class="input" id="product-origin" placeholder="원산지" value="${escapeHtml(editingProduct?.origin ?? "")}" />
        <input class="input" id="product-grade" placeholder="등급" value="${escapeHtml(editingProduct?.grade ?? "")}" />
        <input class="input" id="product-brand" placeholder="브랜드" value="${escapeHtml(editingProduct?.brand ?? "")}" />
        <select class="select" id="product-base-unit">
          ${unitOptions(editingProduct?.baseUnit)}
        </select>
        <input class="input" id="product-safe-stock" type="number" min="0" step="0.1" placeholder="안전재고" value="${editingProduct?.safeStock ?? 0}" />
        <input class="input" id="product-moq" type="number" min="0" step="1" placeholder="MOQ" value="${editingProduct?.moq ?? 0}" />
        <label class="toggle-row"><input type="checkbox" id="product-trace-required" ${editingProduct?.traceRequired !== false ? "checked" : ""} /> 이력번호 필수</label>
        <label class="toggle-row"><input type="checkbox" id="product-is-active" ${editingProduct?.isActive !== false ? "checked" : ""} /> 사용중</label>
        <button class="primary-button span-12" id="save-product">${editingProduct ? "수정 저장" : "등록"}</button>
      </div>
    </article>

    <article class="card span-6">
      <div class="toolbar">
        <h3>거래처 ${editingSupplier ? "수정" : "등록"}</h3>
        ${editingSupplier ? `<button class="secondary-button" id="cancel-supplier-edit">취소</button>` : ""}
      </div>
      <div class="form-grid">
        <input class="input" id="supplier-name" placeholder="거래처명" value="${escapeHtml(editingSupplier?.name ?? "")}" />
        <input class="input" id="supplier-business-number" placeholder="사업자번호" value="${escapeHtml(editingSupplier?.businessNumber ?? "")}" />
        <input class="input" id="supplier-manager" placeholder="담당자" value="${escapeHtml(editingSupplier?.manager ?? "")}" />
        <input class="input" id="supplier-phone" placeholder="전화번호" value="${escapeHtml(editingSupplier?.phone ?? "")}" />
        <input class="input" id="supplier-lead-time-days" type="number" min="0" step="1" placeholder="리드타임(일)" value="${editingSupplier?.leadTimeDays ?? 1}" />
        <label class="toggle-row"><input type="checkbox" id="supplier-is-active" ${editingSupplier?.isActive !== false ? "checked" : ""} /> 사용중</label>
        <button class="primary-button span-12" id="save-supplier">${editingSupplier ? "수정 저장" : "등록"}</button>
      </div>
    </article>

    <article class="card span-6">
      <div class="toolbar">
        <h3>Alias ${editingAlias ? "수정" : "등록"}</h3>
        ${editingAlias ? `<button class="secondary-button" id="cancel-alias-edit">취소</button>` : ""}
      </div>
      <div class="form-grid">
        <input class="input" id="alias-raw-name" placeholder="원본 상품명" value="${escapeHtml(editingAlias?.rawName ?? "")}" />
        <input class="input" id="alias-normalized-name" placeholder="정규화명" value="${escapeHtml(editingAlias?.normalizedName ?? "")}" />
        <select class="select" id="alias-product-id">${productOptions(editingAlias?.productId)}</select>
        <select class="select" id="alias-supplier-id">${supplierOptions(editingAlias?.supplierId)}</select>
        <select class="select" id="alias-source-type">${sourceTypeOptions(editingAlias?.sourceType)}</select>
        <input class="input" id="alias-confidence" type="number" min="0" max="100" step="1" placeholder="신뢰도" value="${editingAlias?.confidence ?? 100}" />
        <label class="toggle-row"><input type="checkbox" id="alias-verified" ${editingAlias?.verified !== false ? "checked" : ""} /> 확인됨</label>
        <label class="toggle-row"><input type="checkbox" id="alias-is-active" ${editingAlias?.isActive !== false ? "checked" : ""} /> 사용중</label>
        <button class="primary-button span-12" id="save-alias">${editingAlias ? "수정 저장" : "등록"}</button>
      </div>
    </article>

    <article class="card span-6">
      <div class="toolbar">
        <h3>Alias Memory Learning</h3>
        <button class="secondary-button" id="recommend-alias">추천</button>
      </div>
      <div class="form-grid">
        <input class="input span-12" id="alias-memory-raw-name" placeholder="원문명 / 거래명세서 / POS 표기" value="${escapeHtml(state.query)}" />
        <input class="input" id="alias-memory-display-name" placeholder="자연 치환명" />
        <select class="select" id="alias-memory-product-id">${productOptions()}</select>
        <select class="select" id="alias-memory-supplier-id">${supplierOptions()}</select>
        <select class="select" id="alias-memory-source-domain">${sourceDomainOptions("consumer")}</select>
        <select class="select" id="alias-memory-source-type">${sourceTypeOptions("manual")}</select>
        <input class="input" id="alias-memory-confidence" type="number" min="0" max="100" step="1" placeholder="신뢰도" value="90" />
        <label class="toggle-row"><input type="checkbox" id="alias-memory-verified" /> 검증</label>
        <label class="toggle-row"><input type="checkbox" id="alias-memory-is-active" checked /> 사용중</label>
        <button class="primary-button span-12" id="save-alias-memory">학습 저장</button>
      </div>
      <div class="status-panel" id="alias-result">표준명 추천 결과가 여기에 표시됩니다.</div>
    </article>

    <article class="card span-6">
      <h3>Product List</h3>
      ${productTable(filteredProducts)}
    </article>

    <article class="card span-6">
      <h3>Supplier List</h3>
      ${supplierTable(filteredSuppliers)}
    </article>

    <article class="card span-12">
      <h3>Alias List</h3>
      ${aliasTable(filteredAliases)}
    </article>

    <article class="card span-12">
      <h3>Alias Memory Log</h3>
      ${aliasMemoryTable(filteredAliasMemory)}
    </article>

    <article class="card span-12">
      <h3>Review Queue</h3>
      ${reviewQueueTable(catalog.aliases, catalog.learningTable)}
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>Learning Table</h3>
        <span class="label">${catalog.learningTable.length}건 / 자동적용 ${catalog.learningTable.filter((item) => item.autoApply).length}건</span>
      </div>
      ${learningTableRender(catalog.learningTable)}
    </article>

    <article class="card span-12">
      <h3>Catalog Snapshot</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>구분</th><th>건수</th><th>활성</th></tr></thead>
          <tbody>
            <tr><td>Category</td><td>${catalog.categories.length}</td><td>${catalog.categories.filter((item) => item.isActive !== false).length}</td></tr>
            <tr><td>Product</td><td>${catalog.products.length}</td><td>${catalog.products.filter((item) => item.isActive !== false).length}</td></tr>
            <tr><td>Supplier</td><td>${catalog.suppliers.length}</td><td>${catalog.suppliers.filter((item) => item.isActive !== false).length}</td></tr>
            <tr><td>Alias</td><td>${catalog.aliases.length}</td><td>${catalog.aliases.filter((item) => item.isActive !== false).length}</td></tr>
            <tr><td>Alias Memory</td><td>${catalog.aliasMemory.length}</td><td>${catalog.aliasMemory.filter((item) => item.isActive !== false).length}</td></tr>
            <tr><td>Learning</td><td>${catalog.learningTable.length}</td><td>${catalog.learningTable.filter((item) => item.autoApply).length}</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderGoodChuksan() {
  const summary = goodChuksanSourceStore.summary();
  const rows = goodChuksanSourceStore.list({
    query: state.goodChuksanQuery,
    unit2Raw: state.goodChuksanUnit2,
    originRaw: state.goodChuksanOrigin,
    storageType: state.goodChuksanStorage,
    mappingStatus: state.goodChuksanMappingStatus,
    reviewStatus: state.goodChuksanReviewStatus,
    onlyDups: state.goodChuksanOnlyDuplicates,
    onlyCosts: state.goodChuksanOnlyCostItems
  });
  const reviewQueue = goodChuksanSourceStore.listReviewQueue();
  const duplicateGroups = goodChuksanSourceStore.listDuplicateGroups();

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>좋은축산 원본 적재 상태</h3>
        <span class="label">${summary.sourceFile || "원본 파일 미연동"} / ${summary.sourcePrintedDate || "-"} / ${summary.supplierName}</span>
      </div>
      <div class="progress-list">
        ${progressRow("로드 행수", Math.min(100, Math.round((summary.loadedRows / Math.max(summary.expectedRows, 1)) * 100)))}
        <p class="label">실제 로드: ${summary.loadedRows} / 기준서 기대: ${summary.expectedRows}</p>
        <p class="label">중복 그룹: ${summary.duplicateGroupCount} / 비용성 항목: ${summary.costItemCount} / 검토 대기: ${summary.pendingReviewCount}</p>
      </div>
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>원본 조회 / 검토 필터</h3>
        <button class="secondary-button" id="reset-good-chuksan-filters">필터 초기화</button>
      </div>
      <div class="form-grid">
        <input class="input" id="good-chuksan-query" placeholder="상품코드 / 상품명 검색" value="${escapeHtml(state.goodChuksanQuery)}" />
        <input class="input" id="good-chuksan-unit2" placeholder="단위2 필터" list="good-chuksan-unit2-list" value="${escapeHtml(state.goodChuksanUnit2)}" />
        <input class="input" id="good-chuksan-origin" placeholder="원산지 필터" list="good-chuksan-origin-list" value="${escapeHtml(state.goodChuksanOrigin)}" />
        <select class="select" id="good-chuksan-storage">
          ${filterOptions(["", "냉장", "냉동", "미표기"], state.goodChuksanStorage, "보관상태")}
        </select>
        <select class="select" id="good-chuksan-mapping-status">
          ${filterOptions(["", "pending_review", "mapped", "duplicate", "cost_item"], state.goodChuksanMappingStatus, "매핑상태")}
        </select>
        <select class="select" id="good-chuksan-review-status">
          ${filterOptions(["", "pending_review", "approved", "rejected", "changed"], state.goodChuksanReviewStatus, "Review 상태")}
        </select>
        <label class="toggle-row"><input type="checkbox" id="good-chuksan-only-duplicates" ${state.goodChuksanOnlyDuplicates ? "checked" : ""} /> 중복만</label>
        <label class="toggle-row"><input type="checkbox" id="good-chuksan-only-cost-items" ${state.goodChuksanOnlyCostItems ? "checked" : ""} /> 비용항목만</label>
      </div>
      <datalist id="good-chuksan-unit2-list">
        <option value="국내산돈육"></option>
        <option value="국내산우육"></option>
        <option value="수입산우육"></option>
        <option value="수입산돈육"></option>
        <option value="기타"></option>
      </datalist>
      <datalist id="good-chuksan-origin-list">
        <option value="국내산"></option>
        <option value="미국산"></option>
        <option value="호주산"></option>
        <option value="칠레산"></option>
        <option value="기타"></option>
      </datalist>
    </article>

    <article class="card span-12">
      <h3>원본 행 목록</h3>
      ${goodChuksanSourceTable(rows)}
    </article>

    <article class="card span-6">
      <h3>검토 대기</h3>
      ${goodChuksanReviewTable(reviewQueue)}
    </article>

    <article class="card span-6">
      <h3>중복 그룹</h3>
      ${goodChuksanDuplicateTable(duplicateGroups)}
    </article>
  `;
}

function renderMobileOcr() {
  const capture = state.ocrRealWorld;
  const document = capture.documentId
    ? ocrDocumentQueueStore.getById(capture.documentId)
    : null;
  const isProcessing = String(capture.status ?? "").toUpperCase() === "OCR_PENDING";

  if (isProcessing) {
    return `
      <section class="mobile-ocr-screen span-12" aria-live="polite">
        <header class="mobile-ocr-header">
          <button type="button" data-home-view="dashboard" aria-label="홈으로">‹</button>
          <h2>거래명세서 확인</h2>
        </header>
        <div class="mobile-ocr-processing">
          <span class="mobile-ocr-spinner" aria-hidden="true"></span>
          <strong>거래명세서를 읽고 있습니다</strong>
          <p>품목과 금액을 정리한 뒤 확인할 내용만 보여드립니다.</p>
        </div>
      </section>
    `;
  }

  if (!document) {
    return `
      <section class="mobile-ocr-screen span-12">
        <header class="mobile-ocr-header">
          <button type="button" data-home-view="dashboard" aria-label="홈으로">‹</button>
          <h2>거래명세서 확인</h2>
        </header>
        <div class="mobile-ocr-empty">
          <span class="mobile-ocr-empty-icon" aria-hidden="true">▣</span>
          <h3>${capture.file ? "사진 확인이 끝났습니다" : "거래명세서를 준비해주세요"}</h3>
          <p>${capture.file ? "아래 버튼을 누르면 품목과 금액을 정리합니다." : "문서 전체가 보이도록 찍으면 자동으로 분석합니다."}</p>
          ${capture.file
            ? `<button class="mobile-ocr-primary" id="ocr-realworld-analyze">거래명세서 분석</button>`
            : `<button class="mobile-ocr-primary" type="button" data-ocr-input-open>사진 찍기 · 파일 불러오기</button>`}
          ${capture.error ? `<p class="mobile-ocr-error">${escapeHtml(capture.error)}</p>` : ""}
        </div>
        <div class="mobile-ocr-photo-tips">
          <strong>촬영할 때 확인해주세요</strong>
          <span>문서 네 모서리가 모두 보이게 찍기</span>
          <span>금액과 이력번호 위의 빛 반사 피하기</span>
          <span>글자가 흔들렸다면 다시 촬영하기</span>
        </div>
      </section>
    `;
  }

  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId: document.documentId });
  const lineItems = (document.lineItems ?? []).map((item, index) => buildMobileOcrLineViewModel({
    document,
    item,
    index,
    catalog,
    historyEntries
  }));
  const documentFields = document.documentFields ?? {};
  const validation = validateMobileOcrDocument(document, lineItems);
  const isApproved = ["APPROVED", "POSTED"].includes(String(document.status ?? "").toUpperCase());
  const isPosted = String(document.status ?? "").toUpperCase() === "POSTED";
  const reviewCount = lineItems.filter((item) => item.needsReview).length;
  const totalAmount = Number(documentFields.totalAmount ?? 0);
  const calculatedLineTotal = roundCurrency(lineItems.reduce((sum, item) => sum + Number(item.totalAmount ?? 0), 0));
  const totalAmountIsTrusted = totalAmount > 0
    && totalAmount <= 1_000_000_000
    && calculatedLineTotal > 0
    && Math.abs(roundCurrency(totalAmount) - calculatedLineTotal) <= 1;
  const statusLabel = isPosted
    ? "재고 반영 완료"
    : isApproved
      ? "확인 완료"
      : validation.ok && reviewCount === 0
        ? "확인 가능"
        : "확인 필요";

  return `
    <section class="mobile-ocr-screen span-12">
      <header class="mobile-ocr-header">
        <button type="button" data-home-view="dashboard" aria-label="홈으로">‹</button>
        <h2>거래명세서 확인</h2>
      </header>

      <div class="mobile-ocr-status ${validation.ok ? "is-ok" : "needs-review"}">
        <div>
          <strong>${escapeHtml(statusLabel)}</strong>
          <span>${isPosted ? "재고에 반영되었습니다." : isApproved ? "확인이 끝났습니다. 재고 반영만 남았습니다." : "주황색 항목을 확인하고 틀린 값만 고쳐주세요."}</span>
        </div>
        <b>${reviewCount}건</b>
      </div>

      <article class="mobile-ocr-summary">
        <label>
          <span>공급사</span>
          <input data-mobile-ocr-document-field="supplierName" value="${escapeHtml(documentFields.supplierName || document.supplierName || "")}" placeholder="공급사 확인 필요" ${isApproved ? "readonly" : ""} />
        </label>
        <label>
          <span>거래일</span>
          <input data-mobile-ocr-document-field="invoiceDate" value="${escapeHtml(documentFields.invoiceDate || "")}" placeholder="거래일 확인 필요" ${isApproved ? "readonly" : ""} />
        </label>
        <div><span>품목 수</span><strong>${lineItems.length}건</strong></div>
        <label class="${totalAmountIsTrusted ? "" : "needs-check"}">
          <span>총 금액</span>
          <input inputmode="numeric" data-mobile-ocr-document-field="totalAmount" value="${totalAmountIsTrusted ? totalAmount : ""}" placeholder="원본 합계 확인 필요" ${isApproved ? "readonly" : ""} />
        </label>
      </article>

      ${validation.messages.length ? `
        <div class="mobile-ocr-warning" role="alert">
          <strong>확인이 필요한 내용</strong>
          ${validation.messages.map((message) => `<span>${escapeHtml(message)}</span>`).join("")}
        </div>
      ` : ""}

      ${capture.originalImageDataUrl ? `
        <details class="mobile-ocr-original">
          <summary>원본 사진 보기</summary>
          <img src="${escapeHtml(capture.originalImageDataUrl)}" alt="촬영한 거래명세서 원본" />
        </details>
      ` : ""}

      <div class="mobile-ocr-items">
        ${lineItems.map((item) => renderMobileOcrLineItem(item, isApproved)).join("") || `
          <div class="mobile-ocr-warning"><strong>품목을 읽지 못했습니다</strong><span>문서 전체가 선명하게 보이도록 다시 촬영해주세요.</span></div>
        `}
      </div>

      <div class="mobile-ocr-guide">
        <strong>이 화면에서 할 일</strong>
        <span>1. 주황색 항목의 원본 사진과 값을 비교합니다.</span>
        <span>2. 틀린 값만 고친 뒤 검산하기를 누릅니다.</span>
        <span>3. 확인 완료 후 재고에 반영합니다.</span>
      </div>

      <div class="mobile-ocr-actions">
        ${!isApproved ? `<button type="button" class="mobile-ocr-secondary" data-mobile-ocr-save="${escapeHtml(document.documentId)}">검산하기</button>` : ""}
        ${!isApproved ? `<button type="button" class="mobile-ocr-primary" data-mobile-ocr-approve="${escapeHtml(document.documentId)}" ${validation.ok ? "" : "disabled"}>확인 완료</button>` : ""}
        ${isApproved && !isPosted ? `<button type="button" class="mobile-ocr-primary" data-ocr-post="${escapeHtml(document.documentId)}">재고 반영</button>` : ""}
        ${isPosted ? `<button type="button" class="mobile-ocr-primary" data-home-view="inventory">재고 확인</button>` : ""}
        <button type="button" class="mobile-ocr-link" data-ocr-input-open>다시 촬영</button>
      </div>
    </section>
  `;
}

function buildMobileOcrLineViewModel({ document, item, index, catalog, historyEntries }) {
  const candidates = buildOcrDictionaryCandidates({ document, lineItem: item, catalog, historyEntries });
  const topCandidate = candidates[0] ?? null;
  const selectedProductId = item.productMasterId || item.selectedProductId || topCandidate?.productId || "";
  const product = selectedProductId ? productEngine.findProductById(selectedProductId) : null;
  const confidence = Number(item.confidence ?? topCandidate?.confidence ?? 0);
  const traceNumber = item.livestockTraceNo || item.importTraceNo || item.traceNumber || item.historyNumber || "";
  const supplyAmount = Number(item.supplyAmount ?? item.amount ?? 0);
  const taxAmount = Number(item.taxAmount ?? 0);
  const totalAmount = Number(item.totalAmount ?? (supplyAmount + taxAmount));
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? 0);
  const numericOutlier = quantity > 100000
    || unitPrice > 1000000
    || supplyAmount > 100000000
    || totalAmount > 100000000;
  const productName = item.selectedProductName || item.normalizedProductName || topCandidate?.standardProductName || item.rawProductName || "";
  const species = item.species || product?.species || "";
  const part = item.part || product?.part || product?.cutName || "";
  const missingEvidence = !productName || !Number(item.quantity) || !Number(item.unitPrice) || !supplyAmount || !traceNumber;
  const needsReview = confidence < 95
    || missingEvidence
    || numericOutlier
    || ["PENDING", "UNKNOWN", "REVIEW_REQUIRED"].includes(String(item.reviewStatus ?? "").toUpperCase());

  return {
    ...item,
    rowNo: Number(item.rowNo ?? index + 1),
    productName,
    species,
    part,
    grade: item.grade || product?.grade || "",
    storageType: item.storageType || product?.processingType || product?.storageType || "",
    unit: item.unit || product?.baseUnit || "",
    origin: item.origin || product?.origin || "",
    quantity,
    unitPrice,
    supplyAmount,
    taxAmount,
    totalAmount,
    traceNumber,
    confidence,
    numericOutlier,
    needsReview
  };
}

function renderMobileOcrLineItem(item, readonly = false) {
  const readonlyAttribute = readonly ? "readonly" : "";
  const field = (label, name, value, options = {}) => `
    <label class="mobile-ocr-field ${options.needsCheck ? "needs-check" : ""}">
      <span>${escapeHtml(label)}</span>
      <input
        ${options.inputMode ? `inputmode="${options.inputMode}"` : ""}
        data-mobile-ocr-line="${item.rowNo}"
        data-mobile-ocr-field="${escapeHtml(name)}"
        value="${escapeHtml(String(value ?? ""))}"
        placeholder="확인 필요"
        ${readonlyAttribute}
      />
    </label>
  `;
  const quantityValue = item.quantity > 0 && item.quantity <= 100000 ? item.quantity : "";
  const unitPriceValue = item.unitPrice > 0 && item.unitPrice <= 1000000 ? item.unitPrice : "";
  const supplyAmountValue = item.supplyAmount > 0 && item.supplyAmount <= 100000000 ? item.supplyAmount : "";
  const totalAmountValue = item.totalAmount > 0 && item.totalAmount <= 100000000 ? item.totalAmount : "";

  return `
    <article class="mobile-ocr-item ${item.needsReview ? "needs-review" : "is-ok"}">
      <header>
        <span>${item.rowNo}</span>
        <div><strong>${escapeHtml(item.productName || item.rawProductName || "상품명 확인 필요")}</strong><small>원문: ${escapeHtml(item.rawProductName || "-")}</small></div>
        <b>${item.needsReview ? "확인" : "정상"}</b>
      </header>
      <div class="mobile-ocr-field-grid">
        ${field("종류", "species", item.species, { needsCheck: !item.species })}
        ${field("부위", "part", item.part, { needsCheck: !item.part })}
        ${field("상품명", "normalizedProductName", item.productName, { needsCheck: !item.productName })}
        ${field("등급", "grade", item.grade)}
        ${field("상태", "storageType", normalizeStorageLabel(item.storageType))}
        ${field("원산지", "origin", item.origin)}
        ${field("단위", "unit", item.unit, { needsCheck: !item.unit })}
        ${field("수량", "quantity", quantityValue, { inputMode: "decimal", needsCheck: !quantityValue })}
        ${field("단가", "unitPrice", unitPriceValue, { inputMode: "numeric", needsCheck: !unitPriceValue })}
        ${field("공급가", "amount", supplyAmountValue, { inputMode: "numeric", needsCheck: !supplyAmountValue })}
        ${field("세액 (면세 0)", "taxAmount", item.taxAmount || 0, { inputMode: "numeric" })}
        ${field("금액", "totalAmount", totalAmountValue, { inputMode: "numeric", needsCheck: !totalAmountValue })}
        <label class="mobile-ocr-field trace-field ${item.traceNumber ? "" : "needs-check"}">
          <span>이력번호 / 수입번호</span>
          <input data-mobile-ocr-line="${item.rowNo}" data-mobile-ocr-field="traceNumber" value="${escapeHtml(item.traceNumber)}" placeholder="번호 확인 필요" ${readonlyAttribute} />
        </label>
      </div>
    </article>
  `;
}

function validateMobileOcrDocument(document, lineItems) {
  const messages = [];
  let lineTotal = 0;

  if (!String(document.documentFields?.supplierName || document.supplierName || "").trim()) {
    messages.push("공급사명을 확인해주세요.");
  }
  if (!String(document.documentFields?.invoiceDate || "").trim()) {
    messages.push("거래일을 확인해주세요.");
  }

  if (!lineItems.length) messages.push("품목을 읽지 못했습니다. 다시 촬영해주세요.");
  lineItems.forEach((item) => {
    const missingLabels = [
      [item.species, "종류"],
      [item.part, "부위"],
      [item.productName, "상품명"],
      [item.grade, "등급(없으면 미표기)"],
      [item.storageType, "상태"],
      [item.origin, "원산지"],
      [item.unit, "단위"]
    ].filter(([value]) => !String(value ?? "").trim()).map(([, label]) => label);
    if (missingLabels.length) {
      messages.push(`${item.rowNo}번 품목의 ${missingLabels.join(", ")}을 확인해주세요.`);
    }
    const expectedSupply = roundCurrency(item.quantity * item.unitPrice);
    if (item.quantity > 100000 || item.unitPrice > 1000000 || item.supplyAmount > 100000000 || item.totalAmount > 100000000) {
      messages.push(`${item.rowNo}번 품목의 숫자가 정상 범위를 벗어났습니다. 원본을 확인해주세요.`);
    }
    if (!item.quantity || !item.unitPrice || !item.supplyAmount) {
      messages.push(`${item.rowNo}번 품목의 수량·단가·공급가를 확인해주세요.`);
    } else if (Math.abs(expectedSupply - item.supplyAmount) > 1) {
      messages.push(`${item.rowNo}번 품목은 수량 × 단가와 공급가가 다릅니다.`);
    }
    if (!item.traceNumber) messages.push(`${item.rowNo}번 품목의 이력번호 또는 수입번호를 확인해주세요.`);
    lineTotal += Number(item.totalAmount ?? item.supplyAmount + item.taxAmount);
  });

  const documentTotal = Number(document.documentFields?.totalAmount ?? 0);
  if (documentTotal > 1_000_000_000) {
    messages.push("문서 합계가 정상 범위를 벗어났습니다. 자동 반영하지 않습니다.");
  }
  if (!documentTotal) {
    messages.push("문서 합계가 확인되지 않았습니다. 원본과 비교해 입력해주세요.");
  } else if (Math.abs(roundCurrency(lineTotal) - roundCurrency(documentTotal)) > 1) {
    messages.push("품목 금액 합계와 문서 총 금액이 다릅니다.");
  }

  return { ok: messages.length === 0, messages: [...new Set(messages)] };
}

function normalizeStorageLabel(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["fresh", "chilled", "냉장"].includes(normalized)) return "냉장";
  if (["frozen", "냉동"].includes(normalized)) return "냉동";
  return String(value ?? "");
}

function roundCurrency(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function renderOcr() {
  if (isMobileOcrRuntime()) return renderMobileOcr();
  const catalog = productCatalogService.getCatalogSnapshot();
  const allDocuments = ocrDocumentQueueStore.list();
  const documents = ocrDocumentQueueStore.list({
    query: state.ocrQuery,
    providerId: state.ocrProviderId,
    reviewStatus: state.ocrReviewStatus
  });
  const selectedDocument = state.ocrDocumentId ? ocrDocumentQueueStore.getById(state.ocrDocumentId) : documents[0] ?? null;
  const metrics = ocrDocumentQueueStore.getMetrics();
  const candidateSummary = ocrProductCandidateStore.summary();
  const failureSummary = ocrFailureLearningStore.summary();
  const operationSummary = ocrOperationLogStore.summary();
  const operationEntries = ocrOperationLogStore.list(5);
  const todayOcrCount = allDocuments.filter((doc) => isSameLocalDay(doc.createdAt, new Date())).length;
  const documentHistory = selectedDocument ? ocrDictionaryHistoryStore.list({ documentId: selectedDocument.documentId }) : [];
  const currentStage = ocrFlowStageLabel(selectedDocument?.status ?? state.ocrRealWorld.status ?? "CAPTURED");
  const failureCases = ocrFailureLearningStore.listFailureCases();
  const topFailureSupplier = findTopFailureSupplier(failureCases);
  const topCorrectionItem = findTopCorrectionItem(ocrFailureLearningStore.listCorrections());
  const recentAlias = operationSummary.recentAlias || findRecentAlias(ocrFailureLearningStore.listPatterns(), documentHistory);

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>OCR 거래명세서 파이프라인</h3>
        <span class="label">카메라 → OCR → Parser → Dictionary → Review → Learning</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>상태</th><th>순서</th></tr></thead>
          <tbody>
            ${OCR_STATUS_FLOW.map((status, index) => `<tr><td>${ocrStatusBadge(status)}</td><td>${index + 1}</td></tr>`).join("")}
            ${OCR_FAILURE_STATUSES.map((status) => `<tr><td>${ocrStatusBadge(status)}</td><td>FAIL</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>순서</th><th>단계</th></tr></thead>
          <tbody>
            ${OCR_PIPELINE_STEPS.map((step, index) => `<tr><td>${index + 1}</td><td>${step}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </article>

    ${renderRealWorldOcrPanel(selectedDocument)}

    ${metricCard("Provider", operationSummary.providerLabel || "CLOVA / MOCK", "현재 OCR 연결 방식")}
    ${metricCard("Secret", operationSummary.secretLabel || "Missing", "운영 연결 상태")}
    ${metricCard("Success Rate (24h)", `${operationSummary.successRate}%`, "최근 24시간 기준")}
    ${metricCard("Average OCR Time", formatDuration(operationSummary.averageDurationMs), "최근 24시간 평균")}
    ${metricCard("Today's OCR Count", `${operationSummary.todayCount}건`, "오늘 처리된 OCR")}
    ${metricCard("Review Rate", `${operationSummary.reviewRate}%`, "최근 24시간 검토 비율")}
    ${metricCard("Failure Rate", `${operationSummary.failureRate}%`, "최근 24시간 실패 비율")}

    <article class="card span-12">
      <div class="toolbar">
        <h3>OCR 진행 상태</h3>
        <span class="label">${escapeHtml(currentStage)}</span>
      </div>
      ${renderOcrFlowTrack(currentStage)}
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>Failure Learning Summary</h3>
        <span class="label">오늘 실패 / 공급사 / 품목 / 최근 Alias</span>
      </div>
      <div class="kpi-strip">
        <div class="kpi-tile"><span class="kpi-value">${getTodayFailureCount(failureCases)}건</span><span class="kpi-label">오늘 실패</span><span class="kpi-hint">최근 24시간</span></div>
        <div class="kpi-tile"><span class="kpi-value">${escapeHtml(topFailureSupplier || "-")}</span><span class="kpi-label">가장 많이 실패한 공급사</span><span class="kpi-hint">누적 실패 기준</span></div>
        <div class="kpi-tile"><span class="kpi-value">${escapeHtml(topCorrectionItem || "-")}</span><span class="kpi-label">가장 많이 수정된 품목</span><span class="kpi-hint">수정 내역 기준</span></div>
        <div class="kpi-tile"><span class="kpi-value">${escapeHtml(recentAlias || "-")}</span><span class="kpi-label">최근 학습된 Alias</span><span class="kpi-hint">마지막 반영 값</span></div>
      </div>
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>OCR Operation Log</h3>
        <span class="label">Provider / Duration / Confidence / Cost / Retry</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>시각</th><th>Provider</th><th>Duration</th><th>Confidence</th><th>Cost</th><th>Retry</th><th>Status</th></tr></thead>
          <tbody>
            ${operationEntries.map((entry) => `
              <tr>
                <td>${formatTime(entry.occurredAt)}</td>
                <td>${escapeHtml(entry.activeProviderName || entry.providerName || "-")}<div class="label">${escapeHtml(entry.activeProviderVersion || entry.providerVersion || "-")}</div></td>
                <td>${formatDuration(entry.durationMs)}</td>
                <td>${badge(`${Number(entry.confidence ?? 0)}%`, Number(entry.confidence ?? 0) >= 85 ? "ok" : "warn")}</td>
                <td>${badge(String(entry.costEstimate ?? 0), entry.costEstimate > 0 ? "warn" : "ok")}</td>
                <td>${badge(`${Number(entry.retryCount ?? 0)}회`, Number(entry.retryCount ?? 0) > 0 ? "warn" : "ok")}</td>
                <td>${badge(entry.resultStatus, entry.resultStatus === "SUCCESS" ? "ok" : entry.resultStatus === "REVIEW" ? "warn" : "danger")}</td>
              </tr>
            `).join("") || `<tr><td colspan="7">운영 로그가 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>

    <article class="card span-4">
      <div class="toolbar">
        <h3>Provider Routing</h3>
        <button class="primary-button" id="ocr-capture-sample">샘플 문서 추가</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Provider</th><th>Role</th></tr></thead>
          <tbody>
            ${OCR_PROVIDER_REGISTRY.map((provider) => `
              <tr>
                <td>${escapeHtml(provider.providerName)}</td>
                <td>${badge(provider.role, provider.role === "primary" ? "ok" : "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <p class="label">운영 경로는 Edge Function을 통해 호출하고, 이 화면은 구조와 검수 흐름을 확인하는 용도입니다.</p>
      <p class="label">Retry Policy: ${OCR_RETRY_DELAYS_MS.map((value) => `${Math.round(value / 1000)}s`).join(" → ")} 이후 Review Queue</p>
    </article>

    <article class="card span-8">
      <div class="toolbar">
        <h3>Document Queue / Failure Learning</h3>
        <span class="label">${documents.length}건</span>
      </div>
      <div class="table-wrap" style="margin-bottom:16px">
        <table>
          <thead><tr><th>KPI</th><th>값</th><th>설명</th></tr></thead>
          <tbody>
            <tr><td>오늘 OCR</td><td>${badge(`${todayOcrCount}건`, "ok")}</td><td>당일 생성된 OCR 문서</td></tr>
            <tr><td>자동 승인</td><td>${badge(`${candidateSummary.autoApprovedCount}건`, "ok")}</td><td>Confidence 95 이상</td></tr>
            <tr><td>Review</td><td>${badge(`${candidateSummary.reviewCount}건`, "warn")}</td><td>후보 검토 필요</td></tr>
            <tr><td>Unknown</td><td>${badge(`${candidateSummary.unknownCount}건`, "danger")}</td><td>학습 대상 누락</td></tr>
            <tr><td>Dictionary 증가</td><td>${badge(`${candidateSummary.dictionaryIncrease}건`, "ok")}</td><td>새 연결된 표준상품 수</td></tr>
            <tr><td>자동 인식 비율</td><td>${badge(`${candidateSummary.accuracy}%`, candidateSummary.accuracy >= 95 ? "ok" : "warn")}</td><td>자동 승인 비율</td></tr>
            <tr><td>평균 Confidence</td><td>${badge(`${candidateSummary.avgConfidence}%`, candidateSummary.avgConfidence >= 80 ? "ok" : "warn")}</td><td>전체 후보 평균</td></tr>
            <tr><td>Failure Learning</td><td>${badge(`${failureSummary.failureCaseCount}건`, failureSummary.openFailureCount > 0 ? "warn" : "ok")}</td><td>실패 기록</td></tr>
            <tr><td>Correction</td><td>${badge(`${failureSummary.correctionCount}건`, "ok")}</td><td>사용자 수정 누적</td></tr>
            <tr><td>Pattern</td><td>${badge(`${failureSummary.patternCount}건`, "ok")}</td><td>학습 패턴</td></tr>
          </tbody>
        </table>
      </div>
      <div class="stack-list" style="margin-bottom:16px">
        ${progressRow("OCR 성공률", metrics.successRate)}
        ${progressRow("Review 비율", metrics.reviewRatio)}
      </div>
      <div class="form-grid">
        <input class="input" id="ocr-query" placeholder="문서 ID / 공급사 / 파일명 검색" value="${escapeHtml(state.ocrQuery)}" />
        <select class="select" id="ocr-provider-filter">
          ${providerFilterOptions(state.ocrProviderId)}
        </select>
        <select class="select" id="ocr-review-filter">
          ${filterOptions(["", "PENDING", "HOLD", "APPROVED", "REJECTED"], state.ocrReviewStatus, "Review 상태")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>문서</th><th>공급사</th><th>상태</th><th>Provider</th><th>품질</th><th>MEATOS</th><th>Retry</th><th>Review</th><th>Action</th></tr></thead>
          <tbody>
            ${documents.map((doc) => `
              <tr>
                <td>
                  <div>${escapeHtml(doc.documentId)}</div>
                  <div class="label">${escapeHtml(doc.fileName)}</div>
                  ${doc.isDuplicate ? `<div class="label danger">중복 후보: ${escapeHtml(doc.duplicateOf || "-")}</div>` : ""}
                </td>
                <td>${escapeHtml(doc.supplierName)}</td>
                <td>${ocrStatusBadge(doc.status)}</td>
                <td>${escapeHtml(providerName(doc.ocrProviderId))}</td>
                <td>${badge(`${doc.qualityScore}%`, doc.qualityScore >= 85 ? "ok" : "warn")}</td>
                <td>${badge(`${doc.meatosScore ?? 0}%`, (doc.meatosScore ?? 0) >= 85 ? "ok" : "warn")}</td>
                <td>${doc.retryCount ? `${doc.retryCount}회${doc.nextRetryAt ? `<div class="label">${escapeHtml(formatTime(doc.nextRetryAt))}</div>` : ""}` : "-"}</td>
                <td>${ocrReviewBadge(doc.reviewStatus)}</td>
                <td class="row-actions">
                  <button class="text-button" data-ocr-open="${doc.documentId}">열기</button>
                  <button class="text-button" data-ocr-upload="${doc.documentId}">업로드</button>
                  <button class="text-button" data-ocr-run="${doc.documentId}">파싱</button>
                  <button class="text-button" data-ocr-approve="${doc.documentId}">승인</button>
                  <button class="text-button danger" data-ocr-reject="${doc.documentId}">반려</button>
                  <button class="text-button" data-ocr-post="${doc.documentId}">게시</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="card span-12">
      <div class="toolbar">
        <h3>Selected Document</h3>
        ${selectedDocument ? `<span class="label">${escapeHtml(selectedDocument.documentId)} / ${escapeHtml(selectedDocument.status)}</span>` : ""}
      </div>
      ${selectedDocument ? ocrDocumentDetail(selectedDocument, catalog, documentHistory) : `<p class="label">선택된 문서가 없습니다.</p>`}
    </article>
  `;
}

function renderRealWorldOcrPanel(selectedDocument = null) {
  const capture = state.ocrRealWorld;
  const isProcessing = String(capture.status ?? "").toUpperCase() === "OCR_PENDING";
  const analysis = capture.imageAnalysis;
  const intakeDecision = capture.intakeDecision ?? (analysis ? evaluateOcrIntakeQuality(analysis) : null);
  const providerHealth = state.ocrProviderHealth ?? ocrProviderHealthLogStore.summary().latest ?? null;
  const providerHealthSummary = ocrProviderHealthLogStore.summary();
  const rotationLabel = capture.rotationDegrees === "auto" ? "Auto" : `${capture.rotationDegrees}°`;
  const summaryDocument = selectedDocument ?? ocrDocumentQueueStore.getById(state.ocrDocumentId) ?? ocrDocumentQueueStore.list()[0] ?? null;
  const inputModeLabel = ocrInputModeLabel(capture.inputType);
  const summarySupplier = summaryDocument?.documentFields?.supplierName || summaryDocument?.supplierName || capture.supplierName || "-";
  const summaryDate = summaryDocument?.documentFields?.invoiceDate || summaryDocument?.createdAt || "";
  const summaryItemCount = Number(summaryDocument?.validation?.lineCount ?? summaryDocument?.lineItems?.length ?? 0);
  const summaryTotalAmount = Number(summaryDocument?.documentFields?.totalAmount ?? 0);
  const summaryButtonTarget = summaryDocument?.documentId ?? "";
  const uxStage = ocrUxStageLabel(capture, summaryDocument);
  const pipelineRows = (capture.pipelineTrace ?? []).map((entry) => `
    <tr>
      <td>${escapeHtml(entry.step)}</td>
      <td>${badge(escapeHtml(entry.status), entry.status === "DONE" || entry.status === "FAST_PATH" ? "ok" : entry.status === "REVIEW_REQUIRED" ? "warn" : "")}</td>
      <td>${escapeHtml(String(entry.score ?? entry.rotationDegrees ?? "-"))}</td>
    </tr>
  `).join("");

  return `
    <article class="card span-12">
      <div class="toolbar">
        <h3>실제 문서 확인</h3>
        <span class="label">사진 찍기 또는 파일 불러오기 후 확인만 누르면 결과가 표시됩니다.</span>
      </div>
      <div class="ocr-input-strip">
        <button class="secondary-button" id="ocr-input-open">고기가 들어왔어요</button>
        <span class="label">${escapeHtml(inputModeLabel)} / ${capture.source ? escapeHtml(capture.source) : "대기"}</span>
      </div>
      <div class="form-grid">
        <input class="input" id="ocr-realworld-supplier" placeholder="공급사명" value="${escapeHtml(capture.supplierName)}" />
        <select class="select" id="ocr-realworld-provider">${providerSelectOptions(capture.providerId)}</select>
        <input class="input" id="ocr-realworld-file-name" placeholder="원본 파일명" value="${escapeHtml(capture.fileName)}" readonly />
        <input class="input" id="ocr-realworld-source" placeholder="입력 출처" value="${escapeHtml(capture.source || "")}" readonly />
      </div>
      <div class="kpi-strip" style="margin-top:12px">
        <div class="kpi-tile"><span class="kpi-value">${escapeHtml(summarySupplier)}</span><span class="kpi-label">공급사</span><span class="kpi-hint">${escapeHtml(providerHealth?.activeProviderName || providerHealth?.providerName || "대기")}</span></div>
        <div class="kpi-tile"><span class="kpi-value">${summaryDate ? escapeHtml(formatDate(summaryDate)) : "-"}</span><span class="kpi-label">거래일</span><span class="kpi-hint">${escapeHtml(uxStage)}</span></div>
        <div class="kpi-tile"><span class="kpi-value">${summaryItemCount}건</span><span class="kpi-label">품목 수</span><span class="kpi-hint">${summaryDocument ? ocrStatusBadge(summaryDocument.status) : badge("대기", "warn")}</span></div>
        <div class="kpi-tile"><span class="kpi-value">${formatMoney(summaryTotalAmount)}</span><span class="kpi-label">총 금액</span><span class="kpi-hint">${summaryDocument ? ocrReviewBadge(summaryDocument.reviewStatus) : badge("대기", "warn")}</span></div>
      </div>
      ${renderOcrUxFlowTrack(uxStage)}
      <div class="row-actions" style="margin-top:12px">
        <button class="primary-button" id="ocr-realworld-analyze" ${isProcessing ? "disabled" : ""}>${isProcessing ? "거래명세서 분석중" : "사진 찍고 확인"}</button>
        ${summaryButtonTarget ? `<button class="secondary-button" data-ocr-post="${summaryButtonTarget}">재고 반영</button>` : `<button class="secondary-button" disabled>재고 반영</button>`}
        <button class="secondary-button" id="ocr-realworld-clear">초기화</button>
      </div>
      ${capture.error ? `<p class="label danger">${escapeHtml(capture.error)}</p>` : ""}
      <details class="advanced-ocr-panel" style="margin-top:16px">
        <summary>AI 분석 보기</summary>
        <div class="stack-list" style="margin-top:16px">
          <p class="label">${intakeDecision ? (intakeDecision.recommendRecapture ? `재촬영 권고: ${intakeDecision.recaptureReasonCodes.join(", ") || "LOW_QUALITY"}` : "재촬영 불필요") : "이미지를 업로드하면 판정이 표시됩니다."}</p>
          <p class="label">${providerHealth ? `현재 연결: ${escapeHtml(providerHealth.activeProviderName || providerHealth.providerName || "대기")} / Secret: ${providerHealth.requestedProviderId === "paddleocr" ? "N/A" : (providerHealth.secretConnected ? "Connected" : "Missing")} / ${escapeHtml(providerHealth.fallbackApplied ? "Fallback 적용" : "안정")}` : "연결 확인을 누르면 Provider 상태가 표시됩니다."}</p>
          <div class="kpi-strip">
            <div class="kpi-tile"><span class="kpi-value">${capture.qualityScore ?? 0}%</span><span class="kpi-label">이미지 품질</span><span class="kpi-hint">문서 품질 기준 점수</span></div>
            <div class="kpi-tile"><span class="kpi-value">${analysis ? analysis.qualityLevel : "-"}</span><span class="kpi-label">문서 상태</span><span class="kpi-hint">${rotationLabel}</span></div>
            <div class="kpi-tile"><span class="kpi-value">${escapeHtml(capture.fileName || "-")}</span><span class="kpi-label">원본 파일</span><span class="kpi-hint">${capture.originalImageDataUrl ? "로드됨" : "대기"}</span></div>
            <div class="kpi-tile"><span class="kpi-value">${escapeHtml(capture.status)}</span><span class="kpi-label">Pipeline</span><span class="kpi-hint">${escapeHtml(capture.documentId || "미실행")}</span></div>
            <div class="kpi-tile"><span class="kpi-value">${escapeHtml(inputModeLabel)}</span><span class="kpi-label">입력 방식</span><span class="kpi-hint">${escapeHtml(capture.source || "대기")}</span></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>점검 항목</th><th>상태</th><th>값</th></tr></thead>
              <tbody>
                <tr><td>Secret 연결</td><td>${providerHealth?.requestedProviderId === "paddleocr" ? badge("불필요", "ok") : (providerHealth?.secretConnected ? badge("연결됨", "ok") : badge("대기", "warn"))}</td><td>${escapeHtml(providerHealth?.message || providerHealth?.mode || "대기")}</td></tr>
                <tr><td>Provider 상태</td><td>${badge(providerHealth?.ok ? "정상" : "확인 필요", providerHealth?.ok ? "ok" : "warn")}</td><td>${escapeHtml(providerHealth?.activeProviderName || providerHealth?.providerName || providerHealthSummary.providerName || "미확인")}</td></tr>
                <tr><td>응답시간</td><td>${badge(`${Number(providerHealth?.latencyMs ?? providerHealthSummary.averageLatencyMs ?? 0)} ms`, "ok")}</td><td>최근 호출 기준</td></tr>
                <tr><td>마지막 호출</td><td>${providerHealth?.checkedAt ? escapeHtml(formatTime(providerHealth.checkedAt)) : "-"}</td><td>${providerHealthSummary.failureCount}건 실패 기록</td></tr>
              </tbody>
            </table>
          </div>
          <div class="media-grid">
            <article class="panel">
              <h4>Original</h4>
              ${capture.originalImageDataUrl
                ? `<img class="ocr-preview-image" src="${escapeHtml(capture.originalImageDataUrl)}" alt="Original OCR upload preview" />`
                : `<p class="label">업로드된 원본 이미지가 없습니다.</p>`}
            </article>
            <article class="panel">
              <h4>Preprocessed</h4>
              ${capture.preprocessedImageDataUrl
                ? `<img class="ocr-preview-image" src="${escapeHtml(capture.preprocessedImageDataUrl)}" alt="Preprocessed OCR preview" />`
                : `<p class="label">보정 결과가 아직 없습니다.</p>`}
            </article>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>품질 지표</th><th>값</th><th>의미</th></tr></thead>
              <tbody>
                <tr><td>해상도</td><td>${analysis ? `${analysis.width} x ${analysis.height}` : "-"}</td><td>원본 픽셀 크기</td></tr>
                <tr><td>평균 밝기</td><td>${analysis ? analysis.averageLuminance : "-"}</td><td>낮을수록 어둡습니다</td></tr>
                <tr><td>대비</td><td>${analysis ? analysis.contrast : "-"}</td><td>문자 선명도</td></tr>
                <tr><td>그림자 비율</td><td>${analysis ? `${analysis.darkRatio}%` : "-"}</td><td>검은 영역 비중</td></tr>
                <tr><td>엣지 밀도</td><td>${analysis ? analysis.edgeDensity : "-"}</td><td>텍스트 경계 추정</td></tr>
                <tr><td>권장 회전</td><td>${analysis ? `${analysis.recommendedRotation}°` : "-"}</td><td>자동 보정 방향</td></tr>
                <tr><td>경고</td><td colspan="2">${analysis ? (analysis.warnings.length ? analysis.warnings.map((warning) => badge(warning, "warn")).join(" ") : badge("없음", "ok")) : "-"}</td></tr>
                <tr><td>재촬영 판정</td><td>${intakeDecision ? (intakeDecision.recommendRecapture ? badge("권고", "danger") : badge("통과", "ok")) : badge("대기", "warn")}</td><td>${intakeDecision ? escapeHtml(intakeDecision.recaptureReasonCodes.join(", ") || "-") : "-"}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Supplier Template</th><th>Documents</th><th>Samples</th><th>Confidence</th><th>Quality</th></tr></thead>
              <tbody>
                ${ocrSupplierTemplateStore.list({ supplierName: capture.supplierName, providerId: capture.providerId }).map((template) => `
                  <tr>
                    <td>${escapeHtml(template.templateId)}</td>
                    <td>${template.documentCount}</td>
                    <td>${escapeHtml((template.sampleProductNames ?? []).slice(0, 3).join(", ") || "-")}</td>
                    <td>${template.avgConfidence}%</td>
                    <td>${template.qualityScore}%</td>
                  </tr>
                `).join("") || `<tr><td colspan="5">저장된 공급사 템플릿이 없습니다.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Stage</th><th>Status</th><th>Value</th></tr></thead>
              <tbody>
                ${pipelineRows || `<tr><td colspan="3">파이프라인이 아직 실행되지 않았습니다.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </article>
  `;
}

function renderInventory() {
  return `
    <article class="card span-12">
      <h3>Product Engine에서 Inventory Engine으로 연결된 현재고</h3>
      ${inventoryTable(inventoryEngine.getStockRows())}
    </article>
    <article class="card span-12">
      <h3>Inventory Item 연결 준비</h3>
      <p class="label">현재 단계는 Product Master를 기준으로 Inventory Item 스키마를 준비하는 구간입니다. 입고, 재고, 출고는 아직 OCR/POS와 직접 연결하지 않습니다.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>대상</th><th>연결 기준</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>Product Master</td><td>productId</td><td>${badge("연결됨", "ok")}</td></tr>
            <tr><td>Inventory Item</td><td>productId + warehouse scope</td><td>${badge("준비", "warn")}</td></tr>
            <tr><td>Ledger</td><td>inventory event</td><td>${badge("연결됨", "ok")}</td></tr>
            <tr><td>Stock Snapshot</td><td>ledger aggregate</td><td>${badge("계산됨", "ok")}</td></tr>
          </tbody>
        </table>
      </div>
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
  return `
    <article class="card span-8">
      <div class="toolbar">
        <h3>POS는 Core가 아니라 Plugin입니다</h3>
        <button class="primary-button" id="simulate-import">CSV 판매 Import</button>
      </div>
      <p class="label">POS Adapter는 Alias를 통해 표준상품을 찾고, 판매 데이터는 Inventory Engine 출고 Ledger로만 반영합니다.</p>
      ${state.lastImport ? `<p class="label">최근 Import: 총 ${state.lastImport.total}건, 성공 ${state.lastImport.imported}건, 미매칭 ${state.lastImport.unmatched}건</p>` : ""}
    </article>
    <article class="card span-4">
      <h3>POS Health Check</h3>
      <button class="primary-button" id="run-pos-scan">점검 실행</button>
      ${state.lastHealthCheck ? healthResult(state.lastHealthCheck) : ""}
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
      <p class="label">AI는 추천만 하고 최종 승인자는 사용자입니다.</p>
    </article>
  `;
}

function productTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>상품명</th><th>속성</th><th>분류</th><th>부위</th><th>단위</th><th>Confidence</th><th>Alias</th><th>Source</th><th>Last Modified</th><th>안전재고</th><th>상태</th><th>동작</th></tr></thead>
        <tbody>
          ${rows.map((product) => {
            const summary = productDictionarySummary(product);
            return `
            <tr>
              <td>
                <div>${product.name}</div>
                <div class="label">${escapeHtml(product.attributeSignature ?? "")}</div>
              </td>
              <td>${escapeHtml(productAttributeSummary(product))}</td>
              <td>${categoryName(product.categoryId)}</td>
              <td>${product.cutName}</td>
              <td>${product.baseUnit}</td>
              <td>${summary.confidence}%</td>
              <td>${summary.aliasCount}개</td>
              <td>${summary.sourceCount}개</td>
              <td>${escapeHtml(summary.lastModified)}</td>
              <td>${product.safeStock}${product.baseUnit}</td>
              <td>${product.isActive === false ? badge("비활성", "danger") : badge("활성", "ok")}</td>
              <td class="row-actions">
                <button class="text-button" data-product-edit="${product.id}">수정</button>
                <button class="text-button danger" data-product-deactivate="${product.id}">비활성</button>
              </td>
            </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function supplierTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>거래처</th><th>담당자</th><th>연락처</th><th>리드타임</th><th>상태</th><th>동작</th></tr></thead>
        <tbody>
          ${rows.map((supplier) => `
            <tr>
              <td>${supplier.name}</td>
              <td>${supplier.manager ?? ""}</td>
              <td>${supplier.phone ?? ""}</td>
              <td>${supplier.leadTimeDays}일</td>
              <td>${supplier.isActive === false ? badge("비활성", "danger") : badge("활성", "ok")}</td>
              <td class="row-actions">
                <button class="text-button" data-supplier-edit="${supplier.id}">수정</button>
                <button class="text-button danger" data-supplier-deactivate="${supplier.id}">비활성</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function aliasTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>원본명</th><th>표준상품</th><th>거래처</th><th>출처</th><th>신뢰도</th><th>확인</th><th>상태</th><th>동작</th></tr></thead>
        <tbody>
          ${rows.map((alias) => `
            <tr>
              <td>${alias.rawName}</td>
              <td>${alias.product?.name ?? "-"}</td>
              <td>${alias.supplier?.name ?? "-"}</td>
              <td>${alias.sourceType}</td>
              <td>${alias.confidence}%</td>
              <td>${alias.verified ? badge("확인됨", "ok") : badge("검토", "warn")}</td>
              <td>${alias.isActive === false ? badge("비활성", "danger") : badge("활성", "ok")}</td>
              <td class="row-actions">
                <button class="text-button" data-alias-edit="${alias.id}">수정</button>
                <button class="text-button danger" data-alias-deactivate="${alias.id}">비활성</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function aliasMemoryTable(rows) {
  if (!rows.length) {
    return `<p class="label">저장된 alias memory가 아직 없습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>원문명</th><th>표준명</th><th>상품</th><th>출처</th><th>유형</th><th>신뢰도</th><th>사용</th><th>검증</th><th>상태</th></tr></thead>
        <tbody>
          ${rows.map((entry) => `
            <tr>
              <td>${entry.rawName}</td>
              <td>${entry.displayName ?? entry.product?.name ?? "-"}</td>
              <td>${entry.product?.name ?? "-"}</td>
              <td>${entry.sourceDomain}</td>
              <td>${entry.sourceType}</td>
              <td>${entry.confidence}%</td>
              <td>${entry.usageCount}</td>
              <td>${entry.verified ? badge("검증", "ok") : badge("대기", "warn")}</td>
              <td>${entry.isActive === false ? badge("비활성", "danger") : badge("활성", "ok")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function learningTableRender(rows) {
  if (!rows.length) {
    return `<p class="label">저장된 학습 데이터가 아직 없습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>학습ID</th><th>원문명</th><th>표준상품</th><th>신뢰도</th><th>누적</th><th>자동</th><th>최근사용</th></tr></thead>
        <tbody>
          ${rows.map((entry) => `
            <tr>
              <td>${escapeHtml(entry.learningId)}</td>
              <td>${escapeHtml(entry.originalName)}</td>
              <td>${escapeHtml(productName(entry.productMasterId))}</td>
              <td>${entry.confidence}%</td>
              <td>${entry.learningCount}</td>
              <td>${entry.autoApply ? badge("자동", "ok") : badge("검토", "warn")}</td>
              <td>${escapeHtml(formatTime(entry.lastUsedAt))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function reviewQueueTable(aliases, learningTable) {
  const aliasRows = aliases
    .filter((item) => item.isActive !== false && (item.confidence < 90 || item.verified === false))
    .map((item) => ({
      kind: "Alias",
      id: item.id,
      source: item.rawName,
      target: item.product?.name ?? "-",
      confidence: item.confidence,
      sourceMeta: item.sourceType,
      supplier: item.supplier?.name ?? "-",
      attribute: productAttributeSummary(item.product),
      status: item.verified ? "needs_check" : "pending_review",
      detail: `${item.sourceType} / ${item.confidence}%`
    }));

  const learningRows = learningTable
    .filter((item) => !item.autoApply || item.confidence < 90)
    .map((item) => ({
      kind: "Learning",
      id: item.learningId,
      source: item.originalName,
      target: productName(item.productMasterId),
      confidence: item.confidence,
      sourceMeta: "learning",
      supplier: supplierName(item.supplierId),
      attribute: productAttributeSummary(productEngine.findProductById(item.productMasterId)),
      status: item.autoApply ? "candidate" : "review",
      detail: `${item.learningCount}회 / ${item.confidence}%`
    }));

  const rows = [...aliasRows, ...learningRows].slice(0, 12);

  if (!rows.length) {
    return `<p class="label">Review Queue가 비어 있습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>원본 상품명</th><th>추천 표준상품</th><th>Confidence</th><th>Source</th><th>Supplier</th><th>Attribute</th><th>상태</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.source)}</td>
              <td>${escapeHtml(row.target)}</td>
              <td>${escapeHtml(String(row.confidence ?? 0))}%</td>
              <td>${escapeHtml(row.sourceMeta)}</td>
              <td>${escapeHtml(row.supplier)}</td>
              <td>${escapeHtml(row.attribute)}</td>
              <td>${badge(row.status, row.status === "pending_review" || row.status === "review" ? "warn" : "")}</td>
              <td class="row-actions">
                <button class="text-button" data-review-approve="${row.kind}:${row.id}">승인</button>
                <button class="text-button danger" data-review-reject="${row.kind}:${row.id}">반려</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function reviewQueueCount(aliases, learningTable) {
  return aliases.filter((item) => item.isActive !== false && (item.confidence < 90 || item.verified === false)).length
    + learningTable.filter((item) => !item.autoApply || item.confidence < 90).length;
}

function productDictionarySummary(product) {
  if (!product) {
    return {
      confidence: 0,
      aliasCount: 0,
      sourceCount: 0,
      lastModified: "-"
    };
  }

  const relatedAliases = productEngine.listAliases({ activeOnly: false }).filter((alias) => alias.productId === product.id);
  const relatedMemory = productEngine.listAliasMemory({ activeOnly: false, productId: product.id });
  const relatedLearning = productCatalogService.listLearningTable().filter((entry) => entry.productMasterId === product.id);
  const confidenceValues = [...relatedAliases.map((alias) => alias.confidence), ...relatedLearning.map((entry) => entry.confidence)];
  const confidence = confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + Number(value ?? 0), 0) / confidenceValues.length) : 0;
  const sourceCount = new Set([
    ...relatedMemory.map((item) => item.sourceDomain),
    ...relatedLearning.map((item) => item.supplierId || "learning")
  ]).size;
  const timestamps = [
    ...relatedAliases.map((item) => item.updatedAt),
    ...relatedMemory.map((item) => item.lastSeenAt),
    ...relatedLearning.map((item) => item.updatedAt)
  ].filter(Boolean);
  const lastModified = timestamps.length ? new Date(timestamps.sort().at(-1)).toLocaleString("ko-KR") : "-";

  return {
    confidence,
    aliasCount: relatedAliases.length,
    sourceCount,
    lastModified
  };
}

function supplierName(supplierId) {
  return productEngine.findSupplierById(supplierId)?.name ?? "-";
}

function sourceTypeLabel(sourceType) {
  const labels = {
    government: "국가기관",
    public: "공공기관",
    association: "협회",
    paper: "논문",
    distributor: "유통사",
    supplier: "거래처",
    butcher_shop: "정육점",
    organization: "공공기관",
    unknown: "기타"
  };
  return labels[sourceType] ?? sourceType;
}

function sourceTypeOptionsRegistry(selectedValue) {
  const options = ["government", "public", "association", "paper", "distributor", "supplier", "butcher_shop"];
  return options.map((value) => `<option value="${value}" ${value === (selectedValue ?? "supplier") ? "selected" : ""}>${sourceTypeLabel(value)}</option>`).join("");
}

function authorityLevelOptions(selectedValue) {
  return ["L1", "L2", "L3", "L4", "L5", "L6"].map((value) => `<option value="${value}" ${value === (selectedValue ?? "L5") ? "selected" : ""}>${value}</option>`).join("");
}

function importQueueStatusBadge(status) {
  if (status === "MASTER") return badge("MASTER", "ok");
  if (status === "DICTIONARY") return badge("DICTIONARY", "ok");
  if (status === "APPROVED") return badge("APPROVED", "warn");
  if (status === "REVIEW") return badge("REVIEW", "warn");
  if (status === "NEW") return badge("NEW", "warn");
  return badge(status, "");
}

function providerName(providerId) {
  return OCR_PROVIDER_REGISTRY.find((provider) => provider.providerId === providerId)?.providerName ?? "미선택";
}

function providerFilterOptions(selectedValue) {
  const options = ["", ...OCR_PROVIDER_REGISTRY.map((provider) => provider.providerId)];
  return options.map((value) => {
    if (!value) return `<option value="" ${selectedValue === "" ? "selected" : ""}>Provider 전체</option>`;
    return `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(providerName(value))}</option>`;
  }).join("");
}

function providerSelectOptions(selectedValue) {
  return OCR_PROVIDER_REGISTRY.map((provider) => `
    <option value="${provider.providerId}" ${provider.providerId === selectedValue ? "selected" : ""}>
      ${escapeHtml(provider.providerName)}${provider.role === "primary" ? " · Primary" : provider.role === "fallback" ? " · Fallback" : ""}
    </option>
  `).join("");
}

function ocrStatusBadge(status) {
  const map = {
    CAPTURED: badge("CAPTURED", "warn"),
    UPLOADED: badge("UPLOADED", "ok"),
    OCR_PENDING: badge("OCR_PENDING", "warn"),
    OCR_COMPLETED: badge("OCR_COMPLETED", "ok"),
    PARSE_COMPLETED: badge("PARSE_COMPLETED", "ok"),
    REVIEW_REQUIRED: badge("REVIEW_REQUIRED", "warn"),
    APPROVED: badge("APPROVED", "ok"),
    POSTED: badge("POSTED", "ok"),
    OCR_FAILED: badge("OCR_FAILED", "danger"),
    PARSE_FAILED: badge("PARSE_FAILED", "danger")
  };
  return map[status] ?? badge(status);
}

function ocrReviewBadge(status) {
  const map = {
    PENDING: badge("PENDING", "warn"),
    HOLD: badge("HOLD", "warn"),
    APPROVED: badge("APPROVED", "ok"),
    REJECTED: badge("REJECTED", "danger"),
    SELECTED: badge("SELECTED", "ok"),
    UNKNOWN: badge("UNKNOWN", "danger")
  };
  return map[status] ?? badge(status);
}

function confidenceBadge(confidence) {
  const value = Math.max(0, Math.min(100, Math.round(Number(confidence ?? 0))));
  const tone = value >= 95 ? "ok" : value >= 80 ? "warn" : "danger";
  return badge(`${value}%`, tone);
}

function confidenceTierLabel(confidence) {
  const value = Math.max(0, Math.min(100, Math.round(Number(confidence ?? 0))));
  if (value >= 95) return "자동 승인 후보";
  if (value >= 80) return "확인 권장";
  return "Review 필수";
}

function confidenceTierTone(confidence) {
  const value = Math.max(0, Math.min(100, Math.round(Number(confidence ?? 0))));
  if (value >= 95) return "ok";
  if (value >= 80) return "warn";
  return "danger";
}

function ocrFlowStageLabel(status = "") {
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CAPTURED") return "업로드";
  if (normalized === "ANALYZED" || normalized === "RECAPTURE_RECOMMENDED") return "품질 검사";
  if (normalized === "UPLOADED") return "품질 검사";
  if (normalized === "OCR_PENDING" || normalized === "OCR_COMPLETED") return "OCR";
  if (normalized === "PARSE_COMPLETED") return "상품 분석";
  if (normalized === "REVIEW_REQUIRED") return "Review";
  if (normalized === "APPROVED" || normalized === "POSTED") return "완료";
  if (normalized === "OCR_FAILED" || normalized === "PARSE_FAILED") return "Review";
  return "업로드";
}

function ocrUxStageLabel(capture = {}, document = null) {
  const documentStatus = String(document?.status ?? "").toUpperCase();
  const captureStatus = String(capture?.status ?? "").toUpperCase();

  if (documentStatus === "APPROVED" || documentStatus === "POSTED") return "재고 반영 준비중";
  if (documentStatus === "REVIEW_REQUIRED" || captureStatus === "RECAPTURE_RECOMMENDED") return "품목 정리중";
  if (documentStatus === "OCR_PENDING" || documentStatus === "OCR_COMPLETED" || captureStatus === "OCR_PENDING") return "거래명세서 분석중";
  if (documentStatus === "PARSE_COMPLETED") return "품목 정리중";
  if (captureStatus === "ANALYZED" || captureStatus === "UPLOADED" || captureStatus === "CAPTURED") return "사진 확인중";
  if (capture?.file) return "사진 확인중";
  return "사진 촬영";
}

function renderOcrUxFlowTrack(currentStage = "사진 촬영") {
  const stages = ["사진 확인중", "거래명세서 분석중", "품목 정리중", "재고 반영 준비중"];
  const currentIndex = Math.max(0, stages.indexOf(currentStage));
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>진행 단계</th><th>상태</th><th>안내</th></tr></thead>
        <tbody>
          ${stages.map((stage, index) => `
            <tr>
              <td>${escapeHtml(stage)}</td>
              <td>${index < currentIndex ? badge("완료", "ok") : index === currentIndex ? badge("현재", "warn") : badge("대기", "warn")}</td>
              <td>${escapeHtml(index === currentIndex ? "진행 중입니다." : index < currentIndex ? "처리 완료" : "다음 단계")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOcrFlowTrack(currentStage = "업로드") {
  const stages = ["업로드", "품질 검사", "OCR", "상품 분석", "Dictionary", "Review", "완료"];
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>단계</th><th>상태</th><th>설명</th></tr></thead>
        <tbody>
          ${stages.map((stage) => `
            <tr>
              <td>${escapeHtml(stage)}</td>
              <td>${stage === currentStage ? badge("현재", "ok") : badge("대기", "warn")}</td>
              <td>${escapeHtml(stage === currentStage ? "진행 중" : "다음 단계")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOcrInputPicker() {
  return `
    <input class="hidden-input" id="ocr-camera-input" type="file" accept="image/*" capture="environment" />
    <input class="hidden-input" id="ocr-file-input" type="file" accept="image/*,application/pdf" />
    ${state.ocrInputPickerOpen ? `
      <div class="ocr-input-modal" role="dialog" aria-modal="true" aria-label="거래명세서 입력 선택">
        <div class="ocr-input-sheet">
          <div class="toolbar">
            <h3>거래명세서 입력</h3>
            <button class="text-button" data-ocr-input-close>닫기</button>
          </div>
          <p class="label">입력 방식만 고르고, 이후 흐름은 같습니다.</p>
          <div class="ocr-input-choice-grid">
            <button class="choice-button" data-ocr-input-camera>
              <span class="choice-icon" aria-hidden="true">●</span>
              <strong>사진 찍기</strong>
              <span>카메라로 바로 촬영합니다.</span>
            </button>
            <button class="choice-button" data-ocr-input-file>
              <span class="choice-icon" aria-hidden="true">▣</span>
              <strong>파일 불러오기</strong>
              <span>이미지 파일을 선택합니다.</span>
            </button>
          </div>
        </div>
      </div>
    ` : ""}
  `;
}

const OCR_PIPELINE_FLOW = [
  { order: 1, name: "업로드", description: "문서 이미지를 받아 저장합니다." },
  { order: 2, name: "품질 검사", description: "문서 잘림, 블러, 그림자를 검사합니다." },
  { order: 3, name: "OCR", description: "Provider가 글자와 표를 읽습니다." },
  { order: 4, name: "상품 분석", description: "행 단위 상품명을 정리합니다." },
  { order: 5, name: "Dictionary", description: "표준상품과 Alias를 매칭합니다." },
  { order: 6, name: "Review", description: "확인이 필요한 항목을 검토합니다." },
  { order: 7, name: "완료", description: "승인 또는 게시로 마무리합니다." }
];

function getTodayFailureCount(failureCases) {
  const today = new Date();
  return failureCases.filter((entry) => isSameLocalDay(entry.createdAt, today)).length;
}

function findTopFailureSupplier(failureCases) {
  const counts = new Map();
  for (const entry of failureCases) {
    const supplier = String(entry.supplierName || entry.supplierId || entry.providerName || "").trim();
    if (!supplier) continue;
    counts.set(supplier, (counts.get(supplier) ?? 0) + 1);
  }
  return topEntryFromCounts(counts);
}

function findTopCorrectionItem(corrections) {
  const counts = new Map();
  for (const entry of corrections) {
    const item = String(entry.afterText || entry.beforeText || "").trim();
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return topEntryFromCounts(counts);
}

function findRecentAlias(patterns, historyEntries) {
  const latestPattern = patterns.find((entry) => String(entry.targetPattern ?? "").trim()) ?? null;
  if (latestPattern?.targetPattern) return latestPattern.targetPattern;
  const latestHistory = [...historyEntries].reverse().find((entry) => entry.productName || entry.aliasMatch);
  return latestHistory?.productName || latestHistory?.aliasMatch || "";
}

function topEntryFromCounts(counts) {
  let bestKey = "";
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

function buildOcrConfidenceRows(document, selectedTopCandidate, lineItems) {
  const lineConfidenceValues = lineItems.map((item) => Number(item.confidence ?? item.topCandidate?.confidence ?? 0));
  const averageLineConfidence = lineConfidenceValues.length
    ? Math.round(lineConfidenceValues.reduce((sum, value) => sum + Number(value ?? 0), 0) / lineConfidenceValues.length)
    : 0;
  const supplierConfidence = Number(document.providerConfidence ?? document.meatosScore ?? 0);
  const selectedConfidence = Number(selectedTopCandidate?.confidence ?? averageLineConfidence ?? supplierConfidence);

  return [
    { label: "공급사명", confidence: supplierConfidence, note: confidenceTierLabel(supplierConfidence), tone: confidenceTierTone(supplierConfidence) },
    { label: "품목명", confidence: selectedConfidence, note: confidenceTierLabel(selectedConfidence), tone: confidenceTierTone(selectedConfidence) },
    { label: "수량", confidence: averageLineConfidence, note: confidenceTierLabel(averageLineConfidence), tone: confidenceTierTone(averageLineConfidence) },
    { label: "단가", confidence: Math.max(0, averageLineConfidence - 1), note: confidenceTierLabel(Math.max(0, averageLineConfidence - 1)), tone: confidenceTierTone(Math.max(0, averageLineConfidence - 1)) },
    { label: "금액", confidence: Math.max(0, Math.min(100, Number(document.meatosScore ?? supplierConfidence))), note: confidenceTierLabel(Math.max(0, Math.min(100, Number(document.meatosScore ?? supplierConfidence)))), tone: confidenceTierTone(Math.max(0, Math.min(100, Number(document.meatosScore ?? supplierConfidence)))) },
    { label: "합계", confidence: document.validation?.calculationOk ? 100 : 60, note: document.validation?.calculationOk ? "자동 승인 후보" : "Review 필수", tone: document.validation?.calculationOk ? "ok" : "danger" }
  ];
}

function ocrDocumentDetail(document, catalog, historyEntries = []) {
  const reviewResult = document.reviewResult ?? {};
  const lineItems = (document.lineItems ?? []).map((item) => {
    const candidates = buildOcrDictionaryCandidates({
      document,
      lineItem: item,
      catalog,
      historyEntries
    });
    const topCandidate = candidates[0];
    return {
      ...item,
      topCandidate,
      candidates
    };
  });
  const selectedLineNo = Number(state.ocrSelectedLineNo ?? lineItems[0]?.rowNo ?? 1);
  const selectedLineItem = lineItems.find((item) => item.rowNo === selectedLineNo) ?? lineItems[0] ?? null;
  const selectedCandidates = selectedLineItem ? selectedLineItem.candidates : [];
  const selectedTopCandidate = selectedCandidates[0] ?? null;
  const selectedRoute = selectedTopCandidate?.route ?? "UNKNOWN";
  const showUnknownAction = !selectedCandidates.length || selectedRoute === "UNKNOWN";
  const selectionHistory = ocrDictionaryHistoryStore.list({ documentId: document.documentId });
  const historySummary = ocrDictionaryHistoryStore.summary();
  const confidenceRows = buildOcrConfidenceRows(document, selectedTopCandidate, lineItems);

  return `
    <div class="stack-list">
      <div class="table-wrap">
        <table>
          <thead><tr><th>항목</th><th>값</th></tr></thead>
          <tbody>
            <tr><td>Status</td><td>${ocrStatusBadge(document.status)}</td></tr>
            <tr><td>Review</td><td>${ocrReviewBadge(document.reviewStatus)}</td></tr>
            <tr><td>MEATOS Score</td><td>${badge(`${document.meatosScore ?? 0}%`, (document.meatosScore ?? 0) >= 85 ? "ok" : "warn")}</td></tr>
            <tr><td>Provider Confidence</td><td>${badge(`${document.providerConfidence ?? 0}%`, (document.providerConfidence ?? 0) >= 85 ? "ok" : "warn")}</td></tr>
            <tr><td>Duplicate</td><td>${document.isDuplicate ? badge("DUPLICATE", "danger") : badge("UNIQUE", "ok")}</td></tr>
            <tr><td>Retry</td><td>${document.retryCount ? `${document.retryCount}회${document.nextRetryAt ? ` / ${escapeHtml(formatTime(document.nextRetryAt))}` : ""}` : "-"}</td></tr>
            <tr><td>Processing</td><td>${document.processingMs ? `${document.processingMs} ms` : "-"}</td></tr>
            <tr><td>Failure</td><td>${escapeHtml(document.failureStage || "-")} / ${escapeHtml(document.failureReason || "-")}</td></tr>
            <tr><td>Selected Route</td><td>${badge(selectedRoute, selectedRoute === "AUTO_APPROVED" ? "ok" : selectedRoute === "UNKNOWN" ? "danger" : "warn")}</td></tr>
            <tr><td>Learning Score</td><td>${badge(`${historySummary.learningScore}%`, historySummary.learningScore >= 70 ? "ok" : "warn")}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Original Image</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>File</td><td>${escapeHtml(document.originalImage?.fileName ?? document.fileName ?? "")}</td></tr>
            <tr><td>Hash</td><td>${escapeHtml(document.originalImageHash || document.fileHash || "-")}</td></tr>
            <tr><td>Mime Type</td><td>${escapeHtml(document.originalImage?.mimeType ?? "-")}</td></tr>
            <tr><td>Captured At</td><td>${escapeHtml(formatTime(document.originalImage?.capturedAt ?? document.createdAt))}</td></tr>
            <tr><td>Supplier</td><td>${escapeHtml(document.documentFields?.supplierName ?? "")}</td></tr>
            <tr><td>Business No</td><td>${escapeHtml(document.documentFields?.supplierBusinessNo ?? "")}</td></tr>
            <tr><td>Invoice No</td><td>${escapeHtml(document.documentFields?.invoiceNo ?? "")}</td></tr>
            <tr><td>Invoice Date</td><td>${escapeHtml(document.documentFields?.invoiceDate ?? "")}</td></tr>
            <tr><td>Supply Amount</td><td>${formatMoney(document.documentFields?.supplyAmount ?? 0)}</td></tr>
            <tr><td>Tax Amount</td><td>${formatMoney(document.documentFields?.taxAmount ?? 0)}</td></tr>
            <tr><td>Total Amount</td><td>${formatMoney(document.documentFields?.totalAmount ?? 0)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Field</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>OCR Raw JSON</td><td><pre class="code-block">${escapeHtml(JSON.stringify(document.ocrRawJson ?? {}, null, 2))}</pre></td></tr>
            <tr><td>Parsed JSON</td><td><pre class="code-block">${escapeHtml(JSON.stringify(document.parsedJson ?? {}, null, 2))}</pre></td></tr>
            <tr><td>Review Result</td><td><pre class="code-block">${escapeHtml(JSON.stringify(reviewResult, null, 2))}</pre></td></tr>
          </tbody>
        </table>
      </div>

      <p class="label">95~100 자동 승인 후보 / 80~94 확인 권장 / 80 미만 Review 필수</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Confidence HeatMap</th><th>신뢰도</th><th>메모</th></tr></thead>
          <tbody>
            ${confidenceRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${badge(`${Math.max(0, Math.min(100, Math.round(Number(row.confidence ?? 0))))}%`, row.tone)}</td><td>${escapeHtml(row.note)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>

      <div class="media-grid">
        <article class="panel">
          <h4>Original Image</h4>
          ${document.originalImageDataUrl
            ? `<img class="ocr-preview-image" src="${escapeHtml(document.originalImageDataUrl)}" alt="Original OCR image" />`
            : `<p class="label">원본 이미지가 저장되어 있지 않습니다.</p>`}
        </article>
        <article class="panel">
          <h4>Preprocessed Image</h4>
          ${document.preprocessedImageDataUrl
            ? `<img class="ocr-preview-image" src="${escapeHtml(document.preprocessedImageDataUrl)}" alt="Preprocessed OCR image" />`
            : `<p class="label">보정 이미지가 저장되어 있지 않습니다.</p>`}
        </article>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Image Analysis</th><th>Value</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>Resolution</td><td>${document.imageAnalysis ? `${document.imageAnalysis.width} x ${document.imageAnalysis.height}` : "-"}</td><td>원본 픽셀</td></tr>
            <tr><td>Brightness</td><td>${document.imageAnalysis?.averageLuminance ?? "-"}</td><td>평균 휘도</td></tr>
            <tr><td>Contrast</td><td>${document.imageAnalysis?.contrast ?? "-"}</td><td>문자 대비</td></tr>
            <tr><td>Warnings</td><td colspan="2">${document.imageAnalysis?.warnings?.length ? document.imageAnalysis.warnings.map((warning) => badge(warning, "warn")).join(" ") : badge("없음", "ok")}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Pipeline Step</th><th>Status</th><th>Value</th></tr></thead>
          <tbody>
            ${(document.pipelineTrace ?? []).map((entry) => `
              <tr>
                <td>${escapeHtml(entry.step)}</td>
                <td>${badge(escapeHtml(entry.status), entry.status === "DONE" || entry.status === "FAST_PATH" ? "ok" : entry.status === "REVIEW_REQUIRED" ? "warn" : "")}</td>
                <td>${escapeHtml(String(entry.score ?? entry.rotationDegrees ?? "-"))}</td>
              </tr>
            `).join("") || `<tr><td colspan="3">파이프라인 기록이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>행</th><th>원문</th><th>추천 표준상품</th><th>Confidence</th><th>Alias 일치</th><th>Source Count</th><th>선택</th></tr></thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr>
                <td>${item.rowNo}</td>
                <td>
                  <div>${escapeHtml(item.rawProductName)}</div>
                  ${item.rowNo === selectedLineNo ? `<div class="label">선택중</div>` : ""}
                </td>
                <td>${escapeHtml(item.topCandidate?.standardProductName ?? "-")}</td>
                <td>${badge(`${item.topCandidate?.confidence ?? 0}%`, (item.topCandidate?.confidence ?? 0) >= 85 ? "ok" : "warn")}</td>
                <td>${escapeHtml(item.topCandidate?.aliasMatch ?? "-")}</td>
                <td>${item.topCandidate?.sourceCount ?? 0}</td>
                <td class="row-actions">
                  <button class="text-button" data-ocr-line-select="${document.documentId}:${item.rowNo}">후보 보기</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <div class="toolbar">
          <h4>후보 선택 / Dictionary Candidate</h4>
          <span class="label">${escapeHtml(selectedLineItem?.rawProductName ?? "-")}</span>
        </div>
        <p class="label">공용 Alias / Supplier Alias / Learning 기준으로 후보를 비교합니다.</p>
        ${showUnknownAction ? `<p class="label danger">현재 후보 신뢰도가 낮습니다. Unknown으로 등록하면 학습 데이터로 남깁니다.</p>` : ""}
        <table>
          <thead><tr><th>표준상품명</th><th>Confidence</th><th>Route</th><th>Alias 일치</th><th>Match</th><th>Source Count</th><th>이유</th><th>선택</th></tr></thead>
          <tbody>
            ${selectedCandidates.length ? selectedCandidates.map((candidate) => `
              <tr>
                <td>${escapeHtml(candidate.standardProductName)}</td>
                <td>${badge(`${candidate.confidence}%`, candidate.confidence >= 85 ? "ok" : "warn")}</td>
                <td>${badge(candidate.route, candidate.route === "AUTO_APPROVED" ? "ok" : candidate.route === "UNKNOWN" ? "danger" : "warn")}</td>
                <td>${escapeHtml(candidate.aliasMatch)}</td>
                <td>${escapeHtml(candidate.matchStrategy ?? "-")}</td>
                <td>${candidate.sourceCount}</td>
                <td>${escapeHtml(candidate.reason)}</td>
                <td class="row-actions">
                  <button class="primary-button" data-ocr-candidate-select="${document.documentId}:${selectedLineNo}:${candidate.productId}">선택</button>
                </td>
              </tr>
            `).join("") : `<tr><td colspan="8">후보가 없습니다.</td></tr>`}
          </tbody>
        </table>
        ${showUnknownAction ? `
          <div class="row-actions" style="margin-top:12px">
            <button class="text-button danger" data-ocr-unknown="${document.documentId}:${selectedLineNo}">Unknown 등록</button>
          </div>
        ` : ""}
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th>검증</th><th>상태</th></tr></thead>
          <tbody>
            <tr><td>행 개수</td><td>${badge(String(document.validation?.lineCount ?? 0), "ok")}</td></tr>
            <tr><td>계산 검증</td><td>${document.validation?.calculationOk ? badge("PASS", "ok") : badge("FAIL", "danger")}</td></tr>
            <tr><td>품질 점수</td><td>${badge(`${document.qualityScore}%`, document.qualityScore >= 85 ? "ok" : "warn")}</td></tr>
            <tr><td>MEATOS Score</td><td>${badge(`${document.meatosScore ?? 0}%`, (document.meatosScore ?? 0) >= 85 ? "ok" : "warn")}</td></tr>
            <tr><td>Issues</td><td>${escapeHtml((document.validation?.issues ?? []).join(", ") || "-")}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap">
        <div class="toolbar">
          <h4>History</h4>
          <span class="label">${selectionHistory.length}건</span>
        </div>
        <table>
          <thead><tr><th>원본</th><th>선택 상품</th><th>Alias</th><th>Supplier</th><th>Confidence</th><th>Source</th><th>반복</th></tr></thead>
          <tbody>
            ${selectionHistory.length ? selectionHistory.slice(0, 8).map((entry) => `
              <tr>
                <td>${escapeHtml(entry.rawName)}</td>
                <td>${escapeHtml(entry.productName)}</td>
                <td>${escapeHtml(entry.aliasMatch)}</td>
                <td>${escapeHtml(entry.supplierName || document.supplierName || "-")}</td>
                <td>${badge(`${entry.confidence}%`, entry.confidence >= 85 ? "ok" : "warn")}</td>
                <td>${escapeHtml(entry.sourceLabel || "ocr")}</td>
                <td>${entry.selectionCount}</td>
              </tr>
            `).join("") : `<tr><td colspan="7">이력이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="row-actions">
        <button class="primary-button" data-ocr-approve="${document.documentId}">승인</button>
        <button class="secondary-button" data-ocr-post="${document.documentId}">게시</button>
        <button class="text-button danger" data-ocr-reject="${document.documentId}">반려</button>
        <button class="text-button" data-ocr-fail-ocr="${document.documentId}">OCR 실패</button>
        <button class="text-button" data-ocr-fail-parse="${document.documentId}">Parse 실패</button>
      </div>
    </div>
  `;
}

function createEmptyRealWorldCaptureState() {
  return {
    file: null,
    fileName: "",
    mimeType: "",
    fileSize: 0,
    pageCount: 1,
    inputType: "camera",
    source: "mobile-camera",
    capturedAt: "",
    uploadedAt: "",
    documentHash: "",
    supplierName: "",
    providerId: "paddleocr",
    rotationDegrees: "auto",
    ocrText: "",
    originalImageDataUrl: "",
    preprocessedImageDataUrl: "",
    imageAnalysis: null,
    intakeDecision: null,
    pipelineTrace: [],
    qualityScore: 0,
    warnings: [],
    status: "idle",
    error: "",
    documentId: ""
  };
}

function ocrInputModeLabel(inputType = "") {
  const normalized = String(inputType ?? "").toLowerCase();
  if (normalized === "file") return "파일 불러오기";
  if (normalized === "camera") return "사진 찍기";
  return "입력 대기";
}

function extractTemplateSamples(rawText) {
  return String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index > 0 && !/합계|총액|계산|세액/i.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 8);
}

function failureTypeFromQuality(imageAnalysis, intakeDecision) {
  const warnings = Array.isArray(imageAnalysis?.warnings) ? imageAnalysis.warnings : [];
  if (warnings.includes("LOW_RESOLUTION")) return "LOW_RESOLUTION";
  if (warnings.includes("LOW_BRIGHTNESS")) return "LOW_BRIGHTNESS";
  if (warnings.includes("LOW_CONTRAST")) return "LOW_CONTRAST";
  if (warnings.includes("SHADOW_RISK")) return "SHADOW";
  if (warnings.includes("BLUR_RISK")) return "BLUR";
  if (warnings.includes("ROTATION_RECOMMENDED") || warnings.includes("ROTATION_REVIEW_REQUIRED")) return "CROPPED";
  if (intakeDecision?.recommendRecapture) return "UNKNOWN";
  return "UNKNOWN";
}

function buildTemplateProfileSnapshot(supplierName, providerId) {
  const template = ocrSupplierTemplateStore.list({ supplierName, providerId })[0] ?? null;
  if (!template) return {};

  return {
    templateId: template.templateId,
    templateName: template.templateName ?? `${template.supplierName} ${template.providerId}`,
    headerAliases: template.headerAliases ?? [],
    columnLayout: template.columnLayout ?? {},
    anchorWords: template.anchorWords ?? [],
    expectedFields: template.expectedFields ?? [],
    qualityRules: template.qualityRules ?? {}
  };
}

async function resolveRealWorldOcrProvider(capture, options = {}) {
  const fullHealthCheck = Boolean(options.fullHealthCheck);
  const requestedProviderId = capture.providerId || "paddleocr";
  const mobileRuntime = isMobileOcrRuntime();
  const mobileCloudFirst = requestedProviderId === "paddleocr"
    && mobileRuntime
    && navigator.onLine
    && Boolean(SUPABASE_PUBLIC_CONFIG.ocrFunctionUrl);
  const effectivePrimaryProviderId = mobileCloudFirst ? "clova-general" : requestedProviderId;
  const primaryAdapter = createOcrProviderAdapter(effectivePrimaryProviderId, {
    functionUrl: SUPABASE_PUBLIC_CONFIG.ocrFunctionUrl,
    supabaseUrl: SUPABASE_PUBLIC_CONFIG.url,
    modelAssetBaseUrl: OCR_RUNTIME_CONFIG.paddleModelBaseUrl
  });
  const primaryHealth = fullHealthCheck
    ? await primaryAdapter.healthCheck()
    : buildStandbyProviderHealth(primaryAdapter, isOcrProviderConfigured(effectivePrimaryProviderId));
  const primaryHealthy = Boolean(primaryHealth.ok) && primaryHealth.mode !== "unconfigured";
  const easyOcrAdapter = createOcrProviderAdapter("easyocr-compare", {
    serviceUrl: OCR_RUNTIME_CONFIG.easyOcrServiceUrl,
    timeoutMs: 45000
  });
  const easyOcrHealth = fullHealthCheck
    ? await easyOcrAdapter.healthCheck()
    : buildStandbyProviderHealth(easyOcrAdapter, Boolean(OCR_RUNTIME_CONFIG.easyOcrServiceUrl));
  const comparisonAdapter = createOcrProviderAdapter("tesseract-compare", {
    workerPath: OCR_RUNTIME_CONFIG.tesseractWorkerPath,
    corePath: OCR_RUNTIME_CONFIG.tesseractCorePath,
    langPath: OCR_RUNTIME_CONFIG.tesseractLangPath,
    languages: OCR_RUNTIME_CONFIG.tesseractLanguages
  });
  const comparisonHealth = fullHealthCheck
    ? await comparisonAdapter.healthCheck()
    : buildStandbyProviderHealth(comparisonAdapter, true);
  const secondaryAdapter = effectivePrimaryProviderId === "clova-general"
    ? primaryAdapter
    : createOcrProviderAdapter("clova-general", {
        functionUrl: SUPABASE_PUBLIC_CONFIG.ocrFunctionUrl,
        supabaseUrl: SUPABASE_PUBLIC_CONFIG.url
      });
  const secondaryHealth = secondaryAdapter.getProviderId() === primaryAdapter.getProviderId()
    ? primaryHealth
    : (fullHealthCheck || !primaryHealthy)
      ? await secondaryAdapter.healthCheck()
      : buildStandbyProviderHealth(secondaryAdapter, Boolean(SUPABASE_PUBLIC_CONFIG.ocrFunctionUrl));
  const activeAdapter = primaryHealthy ? primaryAdapter : secondaryAdapter;
  const healthEntry = ocrProviderHealthLogStore.record({
    providerName: primaryAdapter.getProviderName(),
    providerVersion: primaryAdapter.getProviderVersion(),
    providerMode: primaryHealth.mode ?? "browser-sdk",
    ok: primaryHealth.ok,
    secretConnected: Boolean(primaryHealth.secretConnected),
    secretFingerprint: primaryHealth.secretFingerprint ?? "",
    latencyMs: primaryHealth.latencyMs ?? 0,
    message: primaryHealthy
      ? primaryHealth.message || "Provider healthy"
      : `${primaryHealth.message || "Provider unavailable"} / ${secondaryAdapter.getProviderName()} fallback`,
    errorCode: primaryHealth.errorCode ?? "",
    source: "capture"
  });

  state.ocrProviderHealth = {
    ...healthEntry,
    requestedProviderId,
    requestedProviderName: requestedProviderId === effectivePrimaryProviderId ? primaryAdapter.getProviderName() : "PaddleOCR Browser",
    requestedProviderVersion: requestedProviderId === effectivePrimaryProviderId ? primaryAdapter.getProviderVersion() : "PP-OCRv5-mobile",
    requestedProviderHealth: primaryHealth,
    routingMode: mobileCloudFirst ? "mobile-cloud-first" : "configured-primary",
    comparisonProviderId: comparisonAdapter.getProviderId(),
    comparisonProviderName: comparisonAdapter.getProviderName(),
    comparisonProviderVersion: comparisonAdapter.getProviderVersion(),
    comparisonProviderHealth: comparisonHealth,
    easyOcrProviderId: easyOcrAdapter.getProviderId(),
    easyOcrProviderName: easyOcrAdapter.getProviderName(),
    easyOcrProviderVersion: easyOcrAdapter.getProviderVersion(),
    easyOcrProviderHealth: easyOcrHealth,
    secondaryProviderId: secondaryAdapter.getProviderId(),
    secondaryProviderName: secondaryAdapter.getProviderName(),
    secondaryProviderVersion: secondaryAdapter.getProviderVersion(),
    secondaryProviderHealth: secondaryHealth,
    activeProviderId: activeAdapter.getProviderId(),
    activeProviderName: activeAdapter.getProviderName(),
    activeProviderVersion: activeAdapter.getProviderVersion(),
    fallbackApplied: mobileCloudFirst || !primaryHealthy,
    fallbackToClova: mobileCloudFirst || (!primaryHealthy && requestedProviderId !== "clova-general")
  };

  return {
    primaryAdapter,
    primaryHealth,
    easyOcrAdapter,
    easyOcrHealth,
    comparisonAdapter,
    comparisonHealth,
    secondaryAdapter,
    secondaryHealth,
    activeAdapter,
    providerHealth: state.ocrProviderHealth,
    fallbackToClova: mobileCloudFirst || (!primaryHealthy && requestedProviderId !== "clova-general"),
    mobileRuntime,
    mobileCloudFirst,
    skipLocalComparisons: mobileRuntime
  };
}

function renderServices() {
  const serviceItems = [
    { view: "ocr", title: "검토 대기", hint: "인식 결과 확인" },
    { view: "dataCollection", title: "서비스 목록", hint: "연결 서비스 확인" },
    { view: "ocr", title: "AI 이미지 보정", hint: "촬영 이미지 품질 확인" },
    { view: "ocr", title: "OCR 결과 확인", hint: "거래명세서 분석 결과" },
    { view: "products", title: "상품 자동등록", hint: "표준상품 연결" },
    { view: "inventory", title: "재고 자동등록", hint: "재고 반영 준비" }
  ];

  return `
    <article class="card span-12 mobile-detail-card">
      <div class="mobile-service-list">
        ${serviceItems.map((item) => `
          <button type="button" data-home-view="${item.view}">
            <span><strong>${item.title}</strong><small>${item.hint}</small></span>
            <b aria-hidden="true">›</b>
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

async function probeRealWorldOcrProvider() {
  const result = await resolveRealWorldOcrProvider(state.ocrRealWorld, { fullHealthCheck: true });
  return result.providerHealth;
}

function buildStandbyProviderHealth(adapter, configured) {
  return {
    ok: Boolean(configured),
    providerName: adapter.getProviderName(),
    providerVersion: adapter.getProviderVersion(),
    mode: configured ? "standby" : "unconfigured",
    secretConnected: false,
    latencyMs: 0,
    checkedAt: new Date().toISOString(),
    message: configured ? "필요할 때만 실행합니다." : "연결 설정이 없습니다."
  };
}

function isMobileOcrRuntime() {
  return window.matchMedia?.("(max-width: 720px)")?.matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isOcrProviderConfigured(providerId) {
  if (providerId === "clova-general") return Boolean(SUPABASE_PUBLIC_CONFIG.ocrFunctionUrl);
  if (providerId === "paddleocr") return Boolean(OCR_RUNTIME_CONFIG.paddleModelBaseUrl);
  return true;
}

function recordOcrOperationLog(input) {
  return ocrOperationLogStore.record({
    documentId: input.documentId,
    supplierName: input.supplierName,
    providerName: input.providerName,
    providerVersion: input.providerVersion,
    activeProviderName: input.activeProviderName ?? input.providerName,
    activeProviderVersion: input.activeProviderVersion ?? input.providerVersion,
    resultStatus: input.resultStatus ?? "SUCCESS",
    durationMs: Number(input.durationMs ?? 0),
    confidence: Number(input.confidence ?? 0),
    costEstimate: Number(input.costEstimate ?? 0),
    retryCount: Number(input.retryCount ?? 0),
    secretConnected: Boolean(input.secretConnected ?? false),
    recentAlias: String(input.recentAlias ?? "").trim(),
    fallbackApplied: Boolean(input.fallbackApplied ?? false),
    failureReason: String(input.failureReason ?? ""),
    occurredAt: input.occurredAt ?? new Date().toISOString()
  });
}

async function loadRealWorldOcrFile(file, inputType = "file", source = "gallery") {
  if (!file) throw new Error("파일을 선택하세요.");
  if (!String(file.type ?? "").startsWith("image/")) {
    throw new Error("현재는 이미지 파일만 지원합니다. PDF는 다음 단계에서 지원합니다.");
  }
  const rotationDegrees = state.ocrRealWorld.rotationDegrees === "auto" ? undefined : Number(state.ocrRealWorld.rotationDegrees);
  const processed = await processUploadedOcrImage(file, { rotationDegrees });
  state.ocrRealWorld = {
    ...state.ocrRealWorld,
    file,
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    fileSize: Number(file.size ?? 0),
    pageCount: 1,
    inputType,
    source,
    captureContext: {
      mode: inputType === "camera" ? "REAL_CAPTURE" : "EXISTING_FILE",
      userAgent: String(globalThis.navigator?.userAgent ?? ""),
      platform: String(globalThis.navigator?.platform ?? ""),
      viewportWidth: Number(globalThis.innerWidth ?? 0),
      viewportHeight: Number(globalThis.innerHeight ?? 0),
      devicePixelRatio: Number(globalThis.devicePixelRatio ?? 1)
    },
    capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
    uploadedAt: new Date().toISOString(),
    documentHash: processed.originalImageHash,
    originalImageDataUrl: processed.originalImageDataUrl,
    preprocessedImageDataUrl: processed.preprocessedImageDataUrl,
    imageAnalysis: processed.imageAnalysis,
    intakeDecision: evaluateOcrIntakeQuality(processed.imageAnalysis),
    pipelineTrace: processed.pipelineTrace,
    qualityScore: processed.qualityScore,
    warnings: processed.warnings,
    processedImageResult: processed,
    status: processed.qualityScore >= 85 ? "ANALYZED" : "RECAPTURE_RECOMMENDED",
    error: ""
  };
  return processed;
}

async function runRealWorldOcrPipeline() {
  const capture = state.ocrRealWorld;
  if (!capture.file) throw new Error("먼저 이미지를 업로드하세요.");

  const rotationDegrees = capture.rotationDegrees === "auto" ? undefined : Number(capture.rotationDegrees);
  const processed = capture.processedImageResult
    ?? await processUploadedOcrImage(capture.file, { rotationDegrees });
  const intakeDecision = evaluateOcrIntakeQuality(processed.imageAnalysis);
  const recaptureRequiredByQuality = Boolean(intakeDecision.recommendRecapture);
  const {
    primaryAdapter,
    easyOcrAdapter,
    comparisonAdapter,
    secondaryAdapter,
    activeAdapter,
    providerHealth,
    mobileCloudFirst,
    skipLocalComparisons
  } = await resolveRealWorldOcrProvider(capture);
  const nowIso = new Date().toISOString();
  const fileHash = processed.originalImageHash;
  const sampleProductNames = extractTemplateSamples(capture.ocrText);
  const created = ocrDocumentQueueStore.create({
    sourceId: "src-l5-good-chuksan",
    sourceName: capture.supplierName || "실제 거래명세서",
    supplierName: capture.supplierName || "실제 거래명세서",
    fileName: capture.file.name,
    fileHash,
    rawText: String(capture.ocrText ?? "").trim(),
    status: "CAPTURED",
    reviewStatus: "PENDING",
    qualityScore: processed.qualityScore,
    meatosScore: processed.qualityScore,
    providerConfidence: processed.qualityScore,
    ocrProviderId: providerHealth.activeProviderId ?? capture.providerId,
    originalImage: processed.originalImage,
    captureContext: capture.captureContext,
    originalImageHash: processed.originalImageHash,
    originalImageDataUrl: processed.originalImageDataUrl,
    preprocessedImage: processed.preprocessedImage,
    preprocessedImageHash: processed.preprocessedImageHash,
    preprocessedImageDataUrl: processed.preprocessedImageDataUrl,
    imageAnalysis: processed.imageAnalysis,
    pipelineTrace: processed.pipelineTrace,
    intakeDecision,
    providerName: activeAdapter.getProviderName(),
    providerVersion: activeAdapter.getProviderVersion(),
    reviewResult: {
      outcome: intakeDecision.recommendRecapture ? "RECAPTURE_RECOMMENDED" : "REVIEW_REQUIRED",
      confidence: processed.qualityScore,
      issues: intakeDecision.recaptureReasonCodes,
      action: intakeDecision.recommendRecapture ? "recapture" : "review",
      capturedAt: nowIso
    }
  });

  ocrDocumentQueueStore.markUploaded(created.documentId, {
    fileHash,
    originalImageHash: processed.originalImageHash,
    originalImage: processed.originalImage
  });

  ocrSupplierTemplateStore.recordTemplate({
    supplierName: capture.supplierName,
    providerId: activeAdapter.getProviderId(),
    sampleProductNames,
    avgConfidence: processed.qualityScore,
    qualityScore: processed.qualityScore,
    documentCount: 1,
    lastObservedAt: nowIso
  });

  if (recaptureRequiredByQuality) {
    ocrFailureLearningStore.recordFailureCase({
      tenantId: "SMARTPD_DEV",
      ocrDocumentId: created.documentId,
      supplierId: "",
      supplierName: capture.supplierName,
      templateId: "",
      failureType: failureTypeFromQuality(processed.imageAnalysis, intakeDecision),
      rawText: String(capture.ocrText ?? ""),
      providerName: activeAdapter.getProviderName(),
      providerConfidence: 0,
      qualityGrade: processed.imageAnalysis?.qualityLevel ?? "E",
      failureReasonCodes: intakeDecision.recaptureReasonCodes,
      status: "OPEN"
    });
  }

  const ocrStartedAt = Date.now();
  const baseRecognitionInput = {
    documentId: created.documentId,
    tenantId: "SMARTPD_DEV",
    file: capture.file,
    imageBlob: processed.preprocessedImageBlob,
    imageDataUrl: processed.preprocessedImageDataUrl || processed.originalImageDataUrl,
    supplierName: capture.supplierName,
    qualityScore: processed.qualityScore,
    rawText: String(capture.ocrText ?? "").trim(),
    imageHash: processed.originalImageHash
  };

  const buildRecognitionInput = (adapter) => ({
    ...baseRecognitionInput,
    templateProfile: buildTemplateProfileSnapshot(capture.supplierName, adapter.getProviderId())
  });

  const primaryAttempt = await runProviderRecognitionAttempt(
    primaryAdapter,
    buildRecognitionInput(primaryAdapter),
    mobileCloudFirst ? 15000 : 10000
  );
  let providerResult = primaryAttempt.result;
  let activeProviderAdapter = primaryAdapter;
  let fallbackApplied = false;
  let fallbackReason = "";

  if (shouldFallbackToSecondaryResult(providerResult)) {
    fallbackApplied = true;
    fallbackReason = primaryAttempt.error?.message || "Primary OCR result was weak";
    if (primaryAttempt.error || providerResult) {
      recordOcrRecognitionFailure({
        tenantId: "SMARTPD_DEV",
        ocrDocumentId: created.documentId,
        supplierName: capture.supplierName,
        providerName: primaryAdapter.getProviderName(),
        providerConfidence: providerResult?.providerConfidence ?? 0,
        qualityGrade: processed.imageAnalysis?.qualityLevel ?? "E",
        failureType: primaryAttempt.error ? "PROVIDER_ERROR" : "PRODUCT_MATCH_FAILED",
        rawText: String(capture.ocrText ?? ""),
        expectedText: "",
        failureReasonCodes: [fallbackReason],
        status: "OPEN"
      });
    }

    const selectiveRegions = skipLocalComparisons ? [] : buildSelectiveOcrRegions(providerResult, {
      maxRegions: 4,
      confidenceThreshold: 88,
      templateProfile: buildTemplateProfileSnapshot(capture.supplierName, primaryAdapter.getProviderId())
    });
    const easyOcrAttempt = skipLocalComparisons
      ? { result: null, error: null }
      : await runProviderRecognitionAttempt(easyOcrAdapter, {
          ...buildRecognitionInput(easyOcrAdapter),
          imageDataUrl: processed.originalImageDataUrl,
          regions: selectiveRegions
        }, 8000);
    const ensembleResult = easyOcrAttempt.result
      ? mergeSelectiveOcrResults(providerResult, easyOcrAttempt.result)
      : providerResult;
    if (easyOcrAttempt.result && (!providerResult || isBetterOcrResult(ensembleResult, providerResult))) {
      providerResult = ensembleResult;
      activeProviderAdapter = easyOcrAdapter;
      const selectiveSummary = summarizeSelectiveRegions(selectiveRegions);
      fallbackReason = selectiveRegions.length
        ? `PaddleOCR uncertain fields compared with EasyOCR (${selectiveSummary.regionCount} regions)`
        : "PaddleOCR failed; EasyOCR full document comparison selected";
    }

    if (!skipLocalComparisons && shouldFallbackToSecondaryResult(providerResult)) {
      const comparisonAttempt = await runProviderRecognitionAttempt(
        comparisonAdapter,
        buildRecognitionInput(comparisonAdapter),
        8000
      );
      if (comparisonAttempt.result && (!providerResult || isBetterOcrResult(comparisonAttempt.result, providerResult))) {
        providerResult = comparisonAttempt.result;
        activeProviderAdapter = comparisonAdapter;
        fallbackReason = "EasyOCR remained uncertain; Tesseract validation selected";
      }
    }

    if (!providerResult || shouldFallbackToPaidProvider(providerResult)) {
      if (secondaryAdapter.getProviderId() !== primaryAdapter.getProviderId()) {
        const secondaryAttempt = await runProviderRecognitionAttempt(
          secondaryAdapter,
          buildRecognitionInput(secondaryAdapter),
          15000
        );
        if (secondaryAttempt.result && (!providerResult || isBetterOcrResult(secondaryAttempt.result, providerResult))) {
          providerResult = secondaryAttempt.result;
          activeProviderAdapter = secondaryAdapter;
          fallbackReason = "Comparison engine unavailable or weaker; CLOVA fallback selected";
        }
      }
    }
  }

  if (!providerResult) {
    const failureMessage = primaryAttempt.error?.message || "OCR provider failed";
    recordOcrRecognitionFailure({
      tenantId: "SMARTPD_DEV",
      ocrDocumentId: created.documentId,
      supplierName: capture.supplierName,
      providerName: activeAdapter.getProviderName(),
      providerConfidence: 0,
      qualityGrade: processed.imageAnalysis?.qualityLevel ?? "E",
      failureType: "PROVIDER_ERROR",
      rawText: String(capture.ocrText ?? ""),
      expectedText: "",
      failureReasonCodes: [failureMessage],
      status: "OPEN"
    });
    throw new Error(`실제 문서를 인식하지 못했습니다. 테스트 데이터로 대체하지 않습니다. (${failureMessage})`);
  }

  const providerItems = Array.isArray(providerResult.rawJson?.items)
    ? providerResult.rawJson.items
    : Array.isArray(providerResult.rawJson?.primary?.items)
      ? providerResult.rawJson.primary.items
      : [];
  const providerLines = Array.isArray(providerResult.rawJson?.lines)
    ? providerResult.rawJson.lines
    : Array.isArray(providerResult.rawJson?.primary?.lines)
      ? providerResult.rawJson.primary.lines
      : [];
  const imageWidth = Number(providerResult.rawJson?.image?.width ?? processed.preprocessedImage?.width ?? processed.originalImage?.width ?? 0);
  const imageHeight = Number(providerResult.rawJson?.image?.height ?? processed.preprocessedImage?.height ?? processed.originalImage?.height ?? 0);
  const inferredColumnLayout = inferSupplierColumnLayout({
    items: providerItems,
    lines: providerLines,
    imageWidth,
    imageHeight
  });
  if (inferredColumnLayout.columns.length >= 3) {
    ocrSupplierTemplateStore.recordTemplate({
      supplierName: capture.supplierName,
      providerId: primaryAdapter.getProviderId(),
      sampleProductNames: providerResult.lineItems?.map((item) => item.rawProductName).filter(Boolean) ?? [],
      avgConfidence: inferredColumnLayout.confidence,
      qualityScore: processed.qualityScore,
      headerAliases: inferredColumnLayout.headerAliases,
      columnLayout: inferredColumnLayout,
      anchorWords: Object.values(inferredColumnLayout.headerAliases),
      expectedFields: inferredColumnLayout.columns.map((column) => column.key),
      qualityRules: { minimumHeaderCount: 3, selectiveCellRecognition: true },
      lastObservedAt: nowIso
    });
  }

  const operationLog = recordOcrOperationLog({
    documentId: created.documentId,
    supplierName: capture.supplierName,
    providerName: providerResult.providerName ?? activeProviderAdapter.getProviderName(),
    providerVersion: providerResult.providerVersion ?? activeProviderAdapter.getProviderVersion(),
    activeProviderName: activeProviderAdapter.getProviderName(),
    activeProviderVersion: activeProviderAdapter.getProviderVersion(),
    resultStatus: providerResult.recaptureRequired ? "REVIEW" : "SUCCESS",
    durationMs: Date.now() - ocrStartedAt,
    confidence: providerResult.meatosScore ?? providerResult.providerConfidence ?? processed.qualityScore,
    costEstimate: fallbackApplied ? 0 : 1,
    retryCount: providerResult.recaptureRequired ? 1 : 0,
    secretConnected: Boolean(providerHealth.secretConnected),
    recentAlias: providerResult.lineItems?.[0]?.normalizedProductName || providerResult.lineItems?.[0]?.rawProductName || sampleProductNames[0] || "",
    fallbackApplied: Boolean(fallbackApplied || providerHealth.fallbackApplied),
    failureReason: fallbackReason || providerHealth.message || ""
  });

  ocrDocumentQueueStore.queueOcr(created.documentId, activeProviderAdapter.getProviderId(), providerResult.providerConfidence ?? processed.qualityScore);
  ocrDocumentQueueStore.transition(created.documentId, "OCR_COMPLETED", {
    ocrProviderId: activeProviderAdapter.getProviderId(),
    providerName: providerResult.providerName,
    providerVersion: providerResult.providerVersion,
    ocrRawJson: providerResult.rawJson,
    providerConfidence: providerResult.providerConfidence,
    qualityScore: providerResult.qualityScore,
    meatosScore: providerResult.meatosScore,
    qualityGrade: providerResult.qualityGrade,
    recaptureRequired: providerResult.recaptureRequired,
    recaptureReasonCodes: providerResult.recaptureReasonCodes,
    reconstructedText: providerResult.reconstructedText,
    reconstructionConfidence: providerResult.reconstructionConfidence,
    reconstructionBasis: providerResult.reconstructionBasis
  });
  ocrDocumentQueueStore.transition(created.documentId, "PARSE_COMPLETED", {
    parsedJson: providerResult.parsedJson,
    documentFields: providerResult.documentFields,
    lineItems: providerResult.lineItems,
    validation: providerResult.validation,
    qualityGrade: providerResult.qualityGrade,
    meatosScore: providerResult.meatosScore,
    providerConfidence: providerResult.providerConfidence,
    reviewResult: {
      outcome: providerResult.recaptureRequired || recaptureRequiredByQuality ? "REVIEW_REQUIRED" : "FAST_REVIEW",
      confidence: providerResult.meatosScore,
      issues: [...(providerResult.recaptureReasonCodes ?? []), ...(recaptureRequiredByQuality ? intakeDecision.recaptureReasonCodes : [])],
      action: providerResult.recaptureRequired || recaptureRequiredByQuality ? "review" : "approve",
      providerName: providerResult.providerName,
      providerVersion: providerResult.providerVersion
    }
  });
  const parsedDocument = ocrDocumentQueueStore.transition(created.documentId, "REVIEW_REQUIRED", {
    reviewStatus: "PENDING",
    reviewResult: {
      outcome: providerResult.recaptureRequired || recaptureRequiredByQuality ? "REVIEW_REQUIRED" : "FAST_REVIEW",
      confidence: providerResult.meatosScore,
      issues: [...(providerResult.recaptureReasonCodes ?? []), ...(recaptureRequiredByQuality ? intakeDecision.recaptureReasonCodes : [])],
      action: providerResult.recaptureRequired || recaptureRequiredByQuality ? "review" : "approve",
      providerName: providerResult.providerName,
      providerVersion: providerResult.providerVersion,
      updatedAt: nowIso
    }
  });

  const matchedDocument = syncOcrProductCandidates(parsedDocument);
  ocrSupplierTemplateStore.recordTemplate({
    supplierName: capture.supplierName,
    providerId: activeProviderAdapter.getProviderId(),
    sampleProductNames: (matchedDocument.lineItems ?? []).map((item) => item.rawProductName).filter(Boolean),
    avgConfidence: matchedDocument.meatosScore ?? processed.qualityScore,
    qualityScore: processed.qualityScore,
    documentCount: 1,
    lastObservedAt: nowIso
  });
  ocrFailureLearningStore.recordPatternLearning({
    tenantId: "SMARTPD_DEV",
    supplierId: "",
    templateId: "",
    patternType: "SUPPLIER_DOCUMENT",
    sourcePattern: capture.supplierName,
    targetPattern: providerResult.providerName,
    sampleCount: 1,
    successCount: providerResult.recaptureRequired ? 0 : 1,
    confidence: providerResult.meatosScore,
    lastUsedAt: nowIso
  });

  state.ocrProviderHealth = {
    ...(state.ocrProviderHealth ?? {}),
    lastOperationAt: operationLog.occurredAt,
    lastDurationMs: operationLog.durationMs,
    lastConfidence: operationLog.confidence,
    lastResultStatus: operationLog.resultStatus,
    fallbackApplied,
    fallbackReason,
    activeProviderId: activeProviderAdapter.getProviderId(),
    activeProviderName: activeProviderAdapter.getProviderName(),
    activeProviderVersion: activeProviderAdapter.getProviderVersion()
  };

  state.ocrRealWorld = {
    ...capture,
    file: capture.file,
    fileName: capture.file.name,
    originalImageDataUrl: processed.originalImageDataUrl,
    preprocessedImageDataUrl: processed.preprocessedImageDataUrl,
    imageAnalysis: processed.imageAnalysis,
    pipelineTrace: processed.pipelineTrace,
    intakeDecision,
    qualityScore: processed.qualityScore,
    warnings: processed.warnings,
    status: matchedDocument.status,
    error: "",
    documentId: matchedDocument.documentId
  };
  state.ocrDocumentId = matchedDocument.documentId;
  state.ocrSelectedLineNo = 1;
  state.lastOcrRun = matchedDocument;
  return matchedDocument;
}

async function runRealWorldOcrPipelineFromUi(successMessage) {
  if (!state.ocrRealWorld.file) {
    showToast("먼저 사진 찍기 또는 파일 불러오기를 선택하세요.");
    return null;
  }

  state.ocrRealWorld.status = "OCR_PENDING";
  state.ocrRealWorld.error = "";
  render();
  await waitForBrowserPaint();

  try {
    const document = await runRealWorldOcrPipeline();
    state.ocrDocumentId = document.documentId;
    state.ocrSelectedLineNo = 1;
    showToast(successMessage);
    return document;
  } catch (error) {
    state.ocrRealWorld.status = "REVIEW_REQUIRED";
    state.ocrRealWorld.error = error.message;
    showToast(error.message);
    return null;
  } finally {
    render();
  }
}

async function waitForBrowserPaint() {
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

async function runProviderRecognitionAttempt(adapter, input, timeoutMs = 15000) {
  try {
    const result = await withOcrTimeout(
      adapter.recognizeDocument(input),
      timeoutMs,
      adapter.getProviderName()
    );
    return { result, error: null };
  } catch (error) {
    return { result: null, error };
  }
}

function withOcrTimeout(promise, timeoutMs, providerName) {
  return new Promise((resolve, reject) => {
    const timerId = window.setTimeout(() => {
      const error = new Error(`${providerName} 응답 시간이 초과되었습니다.`);
      error.code = "OCR_TIMEOUT";
      reject(error);
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timerId);
        reject(error);
      }
    );
  });
}

function shouldFallbackToSecondaryResult(result) {
  if (!result) return true;
  if (String(result.status ?? "").toUpperCase() === "OCR_FAILED") return true;
  if (!Array.isArray(result.lineItems) || result.lineItems.length === 0) return true;
  if (Number(result.meatosScore ?? 0) < 92) return true;
  if (result.validation?.calculationOk === false) return true;
  return Boolean(result.recaptureRequired);
}

function shouldFallbackToPaidProvider(result) {
  if (!result) return true;
  if (String(result.status ?? "").toUpperCase() === "OCR_FAILED") return true;
  if (!Array.isArray(result.lineItems) || result.lineItems.length === 0) return true;
  if (result.validation?.calculationOk === false) return true;
  return Number(result.meatosScore ?? 0) < 92;
}

function shouldFallbackToMock(result) {
  if (!result) return true;
  if (String(result.status ?? "").toUpperCase() === "OCR_FAILED") return true;
  return false;
}

function isBetterOcrResult(candidate, current) {
  const candidateValidationRank = ocrValidationRank(candidate?.validation ?? {});
  const currentValidationRank = ocrValidationRank(current?.validation ?? {});
  if (candidateValidationRank !== currentValidationRank) {
    return candidateValidationRank > currentValidationRank;
  }
  const candidateScore = Number(candidate?.meatosScore ?? candidate?.providerConfidence ?? 0);
  const currentScore = Number(current?.meatosScore ?? current?.providerConfidence ?? 0);
  const candidateLines = Array.isArray(candidate?.lineItems) ? candidate.lineItems.length : 0;
  const currentLines = Array.isArray(current?.lineItems) ? current.lineItems.length : 0;
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore;
  }
  if (candidateLines !== currentLines) {
    return candidateLines > currentLines;
  }
  return Number(candidate?.providerConfidence ?? 0) > Number(current?.providerConfidence ?? 0);
}

function ocrValidationRank(validation = {}) {
  let rank = 0;
  if (validation.calculationOk) rank += 4;
  if (validation.totalAmountMatched) rank += 3;
  if (Number(validation.lineCount ?? 0) > 0) rank += 2;
  if (!Array.isArray(validation.issues) || validation.issues.length === 0) rank += 1;
  return rank;
}

function recordOcrRecognitionFailure(input) {
  ocrFailureLearningStore.recordFailureCase({
    tenantId: String(input.tenantId ?? "SMARTPD_DEV"),
    ocrDocumentId: String(input.ocrDocumentId ?? "").trim(),
    supplierId: String(input.supplierId ?? "").trim(),
    supplierName: String(input.supplierName ?? "").trim(),
    templateId: String(input.templateId ?? "").trim(),
    failureType: String(input.failureType ?? "UNKNOWN").trim(),
    rawText: String(input.rawText ?? ""),
    expectedText: String(input.expectedText ?? ""),
    providerName: String(input.providerName ?? "").trim(),
    providerConfidence: Number(input.providerConfidence ?? 0),
    qualityGrade: String(input.qualityGrade ?? "E").trim(),
    failureReasonCodes: Array.isArray(input.failureReasonCodes) ? input.failureReasonCodes : [String(input.failureReasonCodes ?? "")].filter(Boolean),
    status: String(input.status ?? "OPEN").trim()
  });
}

function goodChuksanSourceTable(rows) {
  if (!rows.length) {
    return `<p class="label">조건에 맞는 원본 행이 없습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>행</th><th>상품코드</th><th>원문명</th><th>원산지</th><th>등급</th><th>단위2</th><th>축종</th><th>보관</th><th>매입가</th><th>매출가</th><th>상태</th><th>표준 후보</th><th>검토</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.rowNo}</td>
              <td>${row.sourceProductCode}</td>
              <td>
                <div>${row.sourceProductName}</div>
                <div class="label">${row.supplierName}</div>
              </td>
              <td>${row.originRaw || "-"}</td>
              <td>${row.gradeRaw || "-"}</td>
              <td>${row.unit2Raw || "-"}</td>
              <td>${row.inferredSpecies}</td>
              <td>${row.inferredStorageType}</td>
              <td>${formatMoney(row.purchasePrice)}</td>
              <td>${formatMoney(row.salesPrice)}</td>
              <td>${goodChuksanStatusBadge(row.mappingStatus, row.reviewStatus)}</td>
              <td>
                <select class="select" data-good-chuksan-candidate="${row.id}">
                  <option value="">표준상품 선택</option>
                  ${productOptions(row.mappedProductId)}
                </select>
              </td>
              <td class="row-actions">
                <button class="text-button" data-good-chuksan-approve="${row.id}">승인</button>
                <button class="text-button" data-good-chuksan-reject="${row.id}">반려</button>
                <button class="text-button danger" data-good-chuksan-duplicate="${row.id}">중복</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function goodChuksanReviewTable(rows) {
  if (!rows.length) {
    return `<p class="label">검토 대기 항목이 없습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>상품명</th><th>원산지</th><th>단위2</th><th>상태</th></tr></thead>
        <tbody>
          ${rows.slice(0, 8).map((row) => `
            <tr>
              <td>${row.sourceProductName}</td>
              <td>${row.originRaw || "-"}</td>
              <td>${row.unit2Raw || "-"}</td>
              <td>${goodChuksanStatusBadge(row.mappingStatus, row.reviewStatus)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function goodChuksanDuplicateTable(groups) {
  if (!groups.length) {
    return `<p class="label">중복 그룹이 없습니다.</p>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>그룹</th><th>건수</th><th>원문명</th></tr></thead>
        <tbody>
          ${groups.slice(0, 8).map((group) => `
            <tr>
              <td>${group.key}</td>
              <td>${group.count}</td>
              <td>${group.rows.map((row) => row.sourceProductName).join(", ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function inventoryTable(stockRows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>표준상품</th><th>분류</th><th>현재고</th><th>안전재고</th><th>상태</th></tr></thead>
        <tbody>
          ${stockRows.map((row) => `
            <tr>
              <td>${row.name}</td>
              <td>${categoryName(row.categoryId)}</td>
              <td>${row.currentStock}${row.baseUnit}</td>
              <td>${row.safeStock}${row.baseUnit}</td>
              <td>${inventoryStatus(row.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function ledgerTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>시간</th><th>상품</th><th>이벤트</th><th>방향</th><th>수량</th><th>Source</th></tr></thead>
        <tbody>
          ${rows.map((entry) => `
            <tr>
              <td>${formatTime(entry.createdAt)}</td>
              <td>${productName(entry.productId)}</td>
              <td>${entry.eventType}</td>
              <td>${entry.direction === "in" ? badge("입고", "ok") : badge("출고", "warn")}</td>
              <td>${entry.quantity}kg</td>
              <td>${entry.source}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function eventTable(events) {
  if (!events.length) {
    return `<p class="label">아직 저장된 이벤트가 없습니다.</p>`;
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

function bindViewEvents() {
  document.querySelectorAll("[data-home-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.homeView;
      render();
    });
  });

  document.querySelector("#save-category")?.addEventListener("click", () => {
    const payload = {
      code: value("category-code"),
      name: value("category-name"),
      isActive: checked("category-is-active")
    };

    if (state.editCategoryId) {
      productCatalogService.updateCategory(state.editCategoryId, payload);
      showToast("카테고리를 수정했습니다.");
    } else {
      productCatalogService.createCategory(payload);
      showToast("카테고리를 등록했습니다.");
    }

    state.editCategoryId = null;
    render();
  });

  document.querySelector("#cancel-category-edit")?.addEventListener("click", () => {
    state.editCategoryId = null;
    render();
  });

  document.querySelector("#global-search")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
  });

  document.querySelector("#good-chuksan-query")?.addEventListener("input", (event) => {
    state.goodChuksanQuery = event.target.value.trim();
    render();
  });

  document.querySelector("#good-chuksan-unit2")?.addEventListener("input", (event) => {
    state.goodChuksanUnit2 = event.target.value.trim();
    render();
  });

  document.querySelector("#good-chuksan-origin")?.addEventListener("input", (event) => {
    state.goodChuksanOrigin = event.target.value.trim();
    render();
  });

  document.querySelector("#good-chuksan-storage")?.addEventListener("change", (event) => {
    state.goodChuksanStorage = event.target.value;
    render();
  });

  document.querySelector("#good-chuksan-mapping-status")?.addEventListener("change", (event) => {
    state.goodChuksanMappingStatus = event.target.value;
    render();
  });

  document.querySelector("#good-chuksan-review-status")?.addEventListener("change", (event) => {
    state.goodChuksanReviewStatus = event.target.value;
    render();
  });

  document.querySelector("#good-chuksan-only-duplicates")?.addEventListener("change", (event) => {
    state.goodChuksanOnlyDuplicates = event.target.checked;
    render();
  });

  document.querySelector("#good-chuksan-only-cost-items")?.addEventListener("change", (event) => {
    state.goodChuksanOnlyCostItems = event.target.checked;
    render();
  });

  document.querySelector("#source-registry-query")?.addEventListener("input", (event) => {
    state.sourceRegistryQuery = event.target.value.trim();
    render();
  });

  document.querySelector("#import-queue-query")?.addEventListener("input", (event) => {
    state.importQueueQuery = event.target.value.trim();
    render();
  });

  document.querySelector("#ocr-query")?.addEventListener("input", (event) => {
    state.ocrQuery = event.target.value.trim();
    render();
  });

  document.querySelector("#ocr-provider-filter")?.addEventListener("change", (event) => {
    state.ocrProviderId = event.target.value;
    render();
  });

  document.querySelector("#ocr-review-filter")?.addEventListener("change", (event) => {
    state.ocrReviewStatus = event.target.value;
    render();
  });

  document.querySelector("#reset-good-chuksan-filters")?.addEventListener("click", () => {
    state.goodChuksanQuery = "";
    state.goodChuksanUnit2 = "";
    state.goodChuksanOrigin = "";
    state.goodChuksanStorage = "";
    state.goodChuksanMappingStatus = "";
    state.goodChuksanReviewStatus = "";
    state.goodChuksanOnlyDuplicates = false;
    state.goodChuksanOnlyCostItems = false;
    render();
  });

  document.querySelector("#save-source-registry")?.addEventListener("click", () => {
    const payload = readSourceRegistryForm();
    if (state.editSourceRegistryId) {
      sourceRegistryStore.update(state.editSourceRegistryId, payload);
      showToast("Source Registry를 수정했습니다.");
    } else {
      sourceRegistryStore.create(payload);
      showToast("Source Registry를 등록했습니다.");
    }
    state.editSourceRegistryId = null;
    render();
  });

  document.querySelector("#cancel-source-registry-edit")?.addEventListener("click", () => {
    state.editSourceRegistryId = null;
    render();
  });

  document.querySelector("#ocr-capture-sample")?.addEventListener("click", () => {
    const created = ocrDocumentQueueStore.create({
      sourceId: "src-l5-good-chuksan",
      sourceName: "좋은축산",
      supplierName: "좋은축산",
      fileName: `good-chuksan-sample-${Date.now()}.jpg`,
      fileHash: `sample-${Date.now()}`,
      rawText: `좋은축산\n010-1111-2222\n삼겹살 2 14500\n미박앞다리살 3 11200\n합계 63400`
    });
    ocrDocumentQueueStore.markUploaded(created.documentId, {
      fileHash: created.fileHash,
      originalImage: {
        fileName: created.fileName,
        mimeType: "image/jpeg",
        hash: created.fileHash,
        capturedAt: new Date().toISOString()
      }
    });
    const doc = ocrDocumentQueueStore.runMockOcr(created.documentId, "clova-general");
    recordOcrOperationLog({
      documentId: doc.documentId,
      supplierName: doc.supplierName,
      providerName: "Mock OCR Provider",
      providerVersion: "mock-1.0",
      activeProviderName: "Mock OCR Provider",
      activeProviderVersion: "mock-1.0",
      resultStatus: "SUCCESS",
      durationMs: 0,
      confidence: Number(doc.meatosScore ?? doc.providerConfidence ?? doc.qualityScore ?? 0),
      costEstimate: 0,
      retryCount: Number(doc.retryCount ?? 0),
      secretConnected: false,
      recentAlias: doc.lineItems?.[0]?.normalizedProductName || doc.lineItems?.[0]?.rawProductName || "",
      fallbackApplied: true
    });
    state.ocrDocumentId = created.documentId;
    state.ocrSelectedLineNo = 1;
    showToast("샘플 OCR 문서를 추가했습니다.");
    render();
  });

  document.querySelector("#ocr-input-open")?.addEventListener("click", () => {
    state.ocrInputPickerOpen = true;
    render();
  });

  document.querySelectorAll("[data-ocr-input-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ocrInputPickerOpen = true;
      render();
    });
  });

  document.querySelectorAll("[data-ocr-input-close]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ocrInputPickerOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-ocr-input-camera]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ocrInputPickerOpen = false;
      state.ocrInputSource = "camera";
      state.view = "ocr";
      render();
      window.setTimeout(() => {
        document.querySelector("#ocr-camera-input")?.click();
      }, 0);
    });
  });

  document.querySelectorAll("[data-ocr-input-file]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ocrInputPickerOpen = false;
      state.ocrInputSource = "file";
      state.view = "ocr";
      render();
      window.setTimeout(() => {
        document.querySelector("#ocr-file-input")?.click();
      }, 0);
    });
  });

  document.querySelector("#ocr-camera-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    try {
      await loadRealWorldOcrFile(file, "camera", "mobile-camera");
      showToast("사진을 확인했습니다. 거래명세서를 분석합니다.");
      await runRealWorldOcrPipelineFromUi("거래명세서 분석이 끝났습니다.");
    } catch (error) {
      state.ocrRealWorld.error = error.message;
      showToast(error.message);
      render();
    }
  });

  document.querySelector("#ocr-file-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    try {
      await loadRealWorldOcrFile(file, "file", "gallery");
      showToast("파일을 확인했습니다. 거래명세서를 분석합니다.");
      await runRealWorldOcrPipelineFromUi("거래명세서 분석이 끝났습니다.");
    } catch (error) {
      state.ocrRealWorld.error = error.message;
      showToast(error.message);
      render();
    }
  });

  document.querySelector("#ocr-realworld-supplier")?.addEventListener("input", (event) => {
    state.ocrRealWorld.supplierName = event.target.value.trim();
  });

  document.querySelector("#ocr-realworld-provider")?.addEventListener("change", (event) => {
    state.ocrRealWorld.providerId = event.target.value;
    state.ocrProviderHealth = null;
  });

  document.querySelector("#ocr-realworld-rotation")?.addEventListener("change", async (event) => {
    state.ocrRealWorld.rotationDegrees = event.target.value;
    if (state.ocrRealWorld.file) {
      try {
        await loadRealWorldOcrFile(
          state.ocrRealWorld.file,
          state.ocrRealWorld.inputType,
          state.ocrRealWorld.source
        );
      } catch (error) {
        state.ocrRealWorld.error = error.message;
      }
      render();
    }
  });

  document.querySelector("#ocr-realworld-text")?.addEventListener("input", (event) => {
    state.ocrRealWorld.ocrText = event.target.value;
  });

  document.querySelector("#ocr-realworld-analyze")?.addEventListener("click", async () => {
    await runRealWorldOcrPipelineFromUi("실제 OCR 파이프라인을 실행했습니다.");
  });

  document.querySelectorAll("[data-mobile-ocr-save]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const result = saveMobileOcrCorrections(button.dataset.mobileOcrSave);
        showToast(result.ok ? "금액 검산이 끝났습니다." : result.messages[0]);
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-mobile-ocr-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const validation = saveMobileOcrCorrections(button.dataset.mobileOcrApprove);
        if (!validation.ok) {
          showToast(validation.messages[0]);
          render();
          return;
        }
        const document = ocrDocumentQueueStore.approve(button.dataset.mobileOcrApprove);
        applyOcrDocumentLearning(document);
        showToast("확인이 끝났습니다. 재고 반영이 가능합니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelector("#ocr-realworld-run")?.addEventListener("click", async () => {
    await runRealWorldOcrPipelineFromUi("실제 문서 파이프라인을 실행했습니다.");
  });

  document.querySelector("#ocr-realworld-health-check")?.addEventListener("click", async () => {
    try {
      await probeRealWorldOcrProvider();
      showToast("OCR 연결 상태를 확인했습니다.");
    } catch (error) {
      state.ocrRealWorld.error = error.message;
      showToast(error.message);
    }
    render();
  });

  document.querySelector("#ocr-realworld-clear")?.addEventListener("click", () => {
    state.ocrRealWorld = createEmptyRealWorldCaptureState();
    state.ocrProviderHealth = null;
    state.ocrInputPickerOpen = false;
    render();
  });

  document.querySelector("#create-product")?.addEventListener("click", () => {
    state.editProductId = null;
    state.editSupplierId = null;
    state.editAliasId = null;
    state.editCategoryId = null;
    state.view = "products";
    state.query = "";
    render();
  });

  document.querySelector("#create-supplier")?.addEventListener("click", () => {
    state.editSupplierId = null;
    state.editCategoryId = null;
    state.view = "products";
    render();
  });

  document.querySelector("#create-alias")?.addEventListener("click", () => {
    state.editAliasId = null;
    state.editCategoryId = null;
    state.view = "products";
    render();
  });

  document.querySelectorAll("[data-good-chuksan-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowId = button.dataset.goodChuksanApprove;
      const candidate = document.querySelector(`[data-good-chuksan-candidate="${rowId}"]`)?.value ?? "";
      const sourceRow = goodChuksanSourceStore.assignMapping(rowId, {
        mappedProductId: candidate,
        reviewStatus: candidate ? "approved" : "changed",
        reviewNote: candidate ? "표준상품 승인" : "후보 미선택"
      });
      if (candidate) {
        syncLearningFromSourceRow(sourceRow, candidate);
      }
      showToast("좋은축산 원본 행을 승인했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-good-chuksan-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowId = button.dataset.goodChuksanReject;
      goodChuksanSourceStore.updateRow(rowId, {
        reviewStatus: "rejected",
        mappingStatus: "pending_review",
        reviewNote: "반려"
      });
      showToast("좋은축산 원본 행을 반려했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-good-chuksan-duplicate]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowId = button.dataset.goodChuksanDuplicate;
      goodChuksanSourceStore.markDuplicate(rowId);
      showToast("중복 행으로 표시했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-source-registry-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editSourceRegistryId = button.dataset.sourceRegistryEdit;
      render();
    });
  });

  document.querySelectorAll("[data-source-registry-deactivate]").forEach((button) => {
    button.addEventListener("click", () => {
      sourceRegistryStore.deactivate(button.dataset.sourceRegistryDeactivate);
      showToast("Source Registry를 비활성화했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-import-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      importQueueStore.approve(button.dataset.importApprove, "승인");
      showToast("Import Queue를 승인했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-import-hold]").forEach((button) => {
    button.addEventListener("click", () => {
      importQueueStore.hold(button.dataset.importHold, "보류");
      showToast("Import Queue를 보류했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-import-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      importQueueStore.reject(button.dataset.importReject, "반려");
      showToast("Import Queue를 반려했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-ocr-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ocrDocumentId = button.dataset.ocrOpen;
      state.ocrSelectedLineNo = 1;
      render();
    });
  });

  document.querySelectorAll("[data-ocr-line-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const [, lineNo] = String(button.dataset.ocrLineSelect ?? "").split(":");
      state.ocrSelectedLineNo = Number(lineNo ?? 1) || 1;
      render();
    });
  });

  document.querySelectorAll("[data-ocr-candidate-select]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const [documentId, lineNo, productId] = String(button.dataset.ocrCandidateSelect ?? "").split(":");
        recordOcrDictionarySelection(documentId, Number(lineNo ?? 0), productId);
        showToast("Dictionary 후보를 선택했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-unknown]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const [documentId, lineNo] = String(button.dataset.ocrUnknown ?? "").split(":");
        recordOcrUnknownSelection(documentId, Number(lineNo ?? 0));
        showToast("Unknown을 학습 데이터로 등록했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-upload]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        ocrDocumentQueueStore.markUploaded(button.dataset.ocrUpload);
        showToast("OCR 문서를 업로드 상태로 전환했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-run]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const doc = ocrDocumentQueueStore.runMockOcr(button.dataset.ocrRun, state.ocrProviderId || "clova-general");
        syncOcrProductCandidates(doc);
        recordOcrOperationLog({
          documentId: doc.documentId,
          supplierName: doc.supplierName,
          providerName: providerName(doc.ocrProviderId),
          providerVersion: String(doc.ocrProviderId ?? "mock"),
          activeProviderName: providerName(doc.ocrProviderId),
          activeProviderVersion: String(doc.ocrProviderId ?? "mock"),
          resultStatus: "SUCCESS",
          durationMs: 0,
          confidence: Number(doc.meatosScore ?? doc.providerConfidence ?? doc.qualityScore ?? 0),
          costEstimate: 0,
          retryCount: Number(doc.retryCount ?? 0),
          secretConnected: false,
          recentAlias: doc.lineItems?.[0]?.normalizedProductName || doc.lineItems?.[0]?.rawProductName || "",
          fallbackApplied: true
        });
        state.lastOcrRun = doc;
        state.ocrDocumentId = doc.documentId;
        showToast("OCR 모의 파싱을 실행했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const document = ocrDocumentQueueStore.approve(button.dataset.ocrApprove);
        applyOcrDocumentLearning(document);
        showToast("OCR 문서를 승인했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        ocrDocumentQueueStore.reject(button.dataset.ocrReject);
        showToast("OCR 문서를 반려했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-post]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const document = ocrDocumentQueueStore.getById(button.dataset.ocrPost);
        const result = postApprovedOcrDocumentToInventory({
          document,
          productEngine,
          inventoryEngine,
          documentStore: ocrDocumentQueueStore,
          actor: "user"
        });
        state.ocrDocumentId = result.document.documentId;
        showToast(`${result.entries.length}개 품목을 재고에 반영했습니다.`);
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-fail-ocr]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        ocrDocumentQueueStore.registerFailure(button.dataset.ocrFailOcr, "ocr", "OCR provider error");
        showToast("OCR 실패를 기록했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-ocr-fail-parse]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        ocrDocumentQueueStore.registerFailure(button.dataset.ocrFailParse, "parse", "Parser validation error");
        showToast("Parse 실패를 기록했습니다.");
      } catch (error) {
        showToast(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-review-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      const [kind, id] = String(button.dataset.reviewApprove ?? "").split(":");
      if (kind === "Alias") {
        const alias = productEngine.findAliasById(id);
        if (alias) {
          productCatalogService.updateProductAlias(id, { verified: true, confidence: Math.max(alias.confidence, 90) });
          productCatalogService.recordLearning({
            supplierId: alias.supplierId ?? "",
            originalName: alias.rawName,
            productMasterId: alias.productId,
            confidence: Math.max(alias.confidence, 90),
            learningCount: 1,
            autoApply: true,
            lastUsedAt: new Date().toISOString()
          });
        }
      } else if (kind === "Learning") {
        learningTableStore.approve(id);
      }
      showToast("Review를 승인했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-review-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      const [kind, id] = String(button.dataset.reviewReject ?? "").split(":");
      if (kind === "Alias") {
        productCatalogService.deactivateProductAlias(id);
      } else if (kind === "Learning") {
        learningTableStore.reject(id);
      }
      showToast("Review를 반려했습니다.");
      render();
    });
  });

  document.querySelector("#cancel-product-edit")?.addEventListener("click", () => {
    state.editProductId = null;
    render();
  });

  document.querySelector("#cancel-supplier-edit")?.addEventListener("click", () => {
    state.editSupplierId = null;
    render();
  });

  document.querySelector("#cancel-alias-edit")?.addEventListener("click", () => {
    state.editAliasId = null;
    render();
  });

  document.querySelector("#save-product")?.addEventListener("click", () => {
    const payload = readProductForm();
    if (state.editProductId) {
      productCatalogService.updateStandardProduct(state.editProductId, payload);
      showToast("표준상품을 수정했습니다.");
    } else {
      productCatalogService.createStandardProduct(payload);
      showToast("표준상품을 등록했습니다.");
    }
    state.editProductId = null;
    render();
  });

  document.querySelector("#save-supplier")?.addEventListener("click", () => {
    const payload = readSupplierForm();
    if (state.editSupplierId) {
      productCatalogService.updateSupplier(state.editSupplierId, payload);
      showToast("거래처를 수정했습니다.");
    } else {
      productCatalogService.createSupplier(payload);
      showToast("거래처를 등록했습니다.");
    }
    state.editSupplierId = null;
    render();
  });

  document.querySelector("#save-alias")?.addEventListener("click", () => {
    const payload = readAliasForm();
    if (state.editAliasId) {
      productCatalogService.updateProductAlias(state.editAliasId, payload);
      showToast("Alias를 수정했습니다.");
    } else {
      productCatalogService.createProductAlias(payload);
      showToast("Alias를 등록했습니다.");
    }
    state.editAliasId = null;
    render();
  });
  document.querySelector("#save-alias-memory")?.addEventListener("click", () => {
    const payload = readAliasMemoryForm();
    productCatalogService.recordAliasMemory(payload);
    productCatalogService.recordLearning({
      supplierId: payload.supplierId ?? "",
      originalName: payload.rawName,
      productMasterId: payload.productId,
      confidence: payload.confidence,
      learningCount: 1,
      autoApply: payload.verified || payload.confidence >= 90,
      lastUsedAt: new Date().toISOString()
    });
    showToast("Alias memory를 학습 저장했습니다.");
    render();
  });
  document.querySelectorAll("[data-product-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editProductId = button.dataset.productEdit;
      state.editCategoryId = null;
      state.editSupplierId = null;
      state.editAliasId = null;
      render();
    });
  });

  document.querySelectorAll("[data-supplier-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editSupplierId = button.dataset.supplierEdit;
      state.editCategoryId = null;
      state.editProductId = null;
      state.editAliasId = null;
      render();
    });
  });

  document.querySelectorAll("[data-alias-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editAliasId = button.dataset.aliasEdit;
      state.editCategoryId = null;
      state.editProductId = null;
      state.editSupplierId = null;
      render();
    });
  });

  document.querySelectorAll("[data-product-deactivate]").forEach((button) => {
    button.addEventListener("click", () => {
      productCatalogService.deactivateStandardProduct(button.dataset.productDeactivate);
      showToast("표준상품을 비활성화했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-supplier-deactivate]").forEach((button) => {
    button.addEventListener("click", () => {
      productCatalogService.deactivateSupplier(button.dataset.supplierDeactivate);
      showToast("거래처를 비활성화했습니다.");
      render();
    });
  });

  document.querySelectorAll("[data-alias-deactivate]").forEach((button) => {
    button.addEventListener("click", () => {
      productCatalogService.deactivateProductAlias(button.dataset.aliasDeactivate);
      showToast("Alias를 비활성화했습니다.");
      render();
    });
  });

  document.querySelector("#recommend-alias")?.addEventListener("click", () => {
    const payload = readAliasMemoryForm();
    const recommendation = productCatalogService.recommendAlias(payload.rawName, {
      supplierId: payload.supplierId,
      sourceDomain: payload.sourceDomain,
      sourceType: payload.sourceType
    });
    const result = document.querySelector("#alias-result");
    result.textContent = `${payload.rawName} -> ${recommendation.displayName ?? recommendation.product?.name ?? "미매칭"} (${recommendation.score}%, ${recommendation.status})`;
    showToast("Alias 추천 결과를 갱신했습니다.");
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

  document.querySelectorAll("[data-category-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editCategoryId = button.dataset.categoryEdit;
      state.editProductId = null;
      state.editSupplierId = null;
      state.editAliasId = null;
      render();
    });
  });

  document.querySelectorAll("[data-category-deactivate]").forEach((button) => {
    button.addEventListener("click", () => {
      productCatalogService.deactivateCategory(button.dataset.categoryDeactivate);
      showToast("카테고리를 비활성화했습니다.");
      render();
    });
  });
}

function runHealthCheck() {
  state.lastHealthCheck = posAdapter.runHealthCheck();
  state.view = "pos";
  showToast("POS Health Check 결과를 Event Log에 저장했습니다.");
  render();
}

function render() {
  document.body.dataset.view = state.view;
  viewTitle.textContent = titles[state.view];
  menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  const views = {
    dashboard: renderDashboard,
    sales: renderSales,
    services: renderServices,
    more: renderMore,
    engines: renderEngines,
    products: renderProductManagement,
    goodChuksan: renderGoodChuksan,
    ocr: renderOcr,
    dataCollection: renderDataCollection,
    inventory: renderInventory,
    events: renderEvents,
    pos: renderPos,
    ai: renderAi
  };

  appView.innerHTML = `${views[state.view]()}${renderOcrInputPicker()}`;
  bindViewEvents();
}

function readProductForm() {
  return {
    name: value("product-name"),
    categoryId: value("product-category"),
    supplierId: emptyToUndefined(value("product-supplier")),
    cutName: value("product-cut-name"),
    species: value("product-species"),
    part: value("product-part"),
    processingType: value("product-processing-type"),
    skinType: value("product-skin-type"),
    boneType: value("product-bone-type"),
    storageType: value("product-storage-type"),
    origin: value("product-origin"),
    grade: value("product-grade"),
    brand: value("product-brand"),
    baseUnit: value("product-base-unit"),
    safeStock: numberValue("product-safe-stock", 0),
    moq: numberValue("product-moq", 0),
    traceRequired: checked("product-trace-required"),
    isActive: checked("product-is-active")
  };
}

function readSupplierForm() {
  return {
    name: value("supplier-name"),
    businessNumber: value("supplier-business-number"),
    manager: value("supplier-manager"),
    phone: value("supplier-phone"),
    leadTimeDays: numberValue("supplier-lead-time-days", 1),
    isActive: checked("supplier-is-active")
  };
}

function readAliasForm() {
  return {
    rawName: value("alias-raw-name"),
    normalizedName: value("alias-normalized-name"),
    productId: value("alias-product-id"),
    supplierId: emptyToUndefined(value("alias-supplier-id")),
    sourceType: value("alias-source-type"),
    confidence: numberValue("alias-confidence", 100),
    verified: checked("alias-verified"),
    isActive: checked("alias-is-active")
  };
}

function readAliasMemoryForm() {
  return {
    rawName: value("alias-memory-raw-name"),
    displayName: value("alias-memory-display-name"),
    productId: value("alias-memory-product-id"),
    supplierId: emptyToUndefined(value("alias-memory-supplier-id")),
    sourceDomain: value("alias-memory-source-domain"),
    sourceType: value("alias-memory-source-type"),
    confidence: numberValue("alias-memory-confidence", 100),
    verified: checked("alias-memory-verified"),
    isActive: checked("alias-memory-is-active")
  };
}

function readSourceRegistryForm() {
  return {
    sourceId: value("source-registry-id"),
    sourceName: value("source-registry-name"),
    sourceType: value("source-registry-type"),
    organization: value("source-registry-organization"),
    authorityLevel: value("source-registry-authority"),
    collector: value("source-registry-collector"),
    collectedAt: value("source-registry-collected-at"),
    status: value("source-registry-status")
  };
}

function syncLearningFromSourceRow(sourceRow, productMasterId) {
  if (!sourceRow || !productMasterId) return null;
  const learning = productCatalogService.recordLearning({
    supplierId: goodChuksanSupplierId,
    originalName: sourceRow.sourceProductName,
    productMasterId,
    confidence: sourceRow.reviewStatus === "approved" ? 92 : 80,
    learningCount: 1,
    autoApply: sourceRow.reviewStatus === "approved",
    lastUsedAt: new Date().toISOString()
  });

  productCatalogService.recordAliasMemory({
    rawName: sourceRow.sourceProductName,
    displayName: productEngine.findProductById(productMasterId)?.name ?? sourceRow.sourceProductName,
    productId: productMasterId,
    supplierId: goodChuksanSupplierId,
    sourceDomain: "distributor",
    sourceType: "supplier_invoice",
    confidence: learning.confidence,
    verified: sourceRow.reviewStatus === "approved",
    isActive: true
  });

  return learning;
}

function applyOcrDocumentLearning(document) {
  if (!document) return;
  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId: document.documentId });

  for (const item of document.lineItems ?? []) {
    if (["SELECTED", "APPROVED", "UNKNOWN"].includes(item.reviewStatus)) {
      continue;
    }

    const selectedProductId = item.productMasterId || item.selectedProductId || item.dictionaryCandidateId || "";
    const selectedProduct = selectedProductId ? productEngine.findProductById(selectedProductId) : null;
    const candidate = selectedProduct
      ? {
          product: selectedProduct,
          productId: selectedProduct.id,
          score: Math.max(Number(item.confidence ?? 0), Number(document.meatosScore ?? 0)),
          displayName: selectedProduct.name
        }
      : buildOcrDictionaryCandidates({
          document,
          lineItem: item,
          catalog,
          historyEntries
        })[0];

    if (!candidate?.productId && !candidate?.product) continue;

    const product = candidate.product ?? productEngine.findProductById(candidate.productId);
    if (!product) continue;

    const confidence = Math.max(candidate.confidence ?? candidate.score ?? 0, item.confidence ?? 0, document.meatosScore ?? 0);

    productCatalogService.recordLearning({
      supplierId: document.sourceId,
      originalName: item.rawProductName,
      productMasterId: product.id,
      confidence,
      learningCount: 1,
      autoApply: false,
      lastUsedAt: new Date().toISOString()
    });

    productCatalogService.recordAliasMemory({
      rawName: item.rawProductName,
      displayName: candidate.standardProductName ?? candidate.displayName ?? product.name,
      productId: product.id,
      supplierId: document.sourceId,
      sourceDomain: "organization",
      sourceType: "ocr",
      confidence,
      verified: true,
      isActive: true
    });
  }
}

function syncOcrProductCandidates(document) {
  if (!document) return { total: 0, autoApprovedCount: 0, reviewCount: 0, unknownCount: 0 };

  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId: document.documentId });
  const selectedAt = new Date().toISOString();
  let autoApprovedCount = 0;
  let reviewCount = 0;
  let unknownCount = 0;

  const updatedLineItems = (document.lineItems ?? []).map((item) => {
    const candidates = buildOcrDictionaryCandidates({
      document,
      lineItem: item,
      catalog,
      historyEntries
    });
    const topCandidate = candidates[0] ?? null;
    const route = topCandidate?.route ?? "UNKNOWN";

    if (!topCandidate || route === "UNKNOWN") {
      unknownCount += 1;
      ocrProductCandidateStore.recordUnknown({
        documentId: document.documentId,
        lineNo: item.rowNo,
        rawName: item.rawProductName,
        normalizedName: item.normalizedProductName ?? item.rawProductName,
        confidence: topCandidate?.confidence ?? Number(item.confidence ?? 0),
        reason: topCandidate?.reason ?? "Unknown registration",
        sourceCount: topCandidate?.sourceCount ?? 0,
        selectedBy: "system",
        selectedAt
      });

      return {
        ...item,
        confidence: topCandidate?.confidence ?? Number(item.confidence ?? 0),
        reviewStatus: "UNKNOWN"
      };
    }

    ocrProductCandidateStore.recordCandidate({
      documentId: document.documentId,
      lineNo: item.rowNo,
      rawName: item.rawProductName,
      normalizedName: topCandidate.normalizedProductName ?? item.rawProductName,
      dictionaryId: topCandidate.productId,
      confidence: topCandidate.confidence,
      status: route,
      approvedBy: route === "AUTO_APPROVED" ? "system" : "",
      approvedAt: route === "AUTO_APPROVED" ? selectedAt : null,
      matchStrategy: topCandidate.matchStrategy ?? "SIMILARITY",
      reason: topCandidate.reason,
      sourceCount: topCandidate.sourceCount,
      selectedBy: "system",
      selectedAt
    });

    if (route === "AUTO_APPROVED") {
      autoApprovedCount += 1;
      const product = productEngine.findProductById(topCandidate.productId);
      ocrDictionaryHistoryStore.recordSelection({
        documentId: document.documentId,
        lineNo: item.rowNo,
        rawName: item.rawProductName,
        supplierId: document.sourceId,
        supplierName: document.supplierName || document.sourceName,
        productId: product?.id ?? topCandidate.productId,
        productName: product?.name ?? topCandidate.standardProductName ?? item.rawProductName,
        aliasId: topCandidate.selectedAliasId || "",
        aliasMatch: topCandidate.aliasMatch,
        decisionType: "AUTO_APPROVED",
        confidence: topCandidate.confidence,
        sourceCount: topCandidate.sourceCount,
        selectedBy: "system",
        sourceLabel: "ocr",
        reason: topCandidate.reason,
        selectedAt
      });

      if (product) {
        productCatalogService.recordLearning({
          supplierId: document.sourceId,
          originalName: item.rawProductName,
          productMasterId: product.id,
          confidence: topCandidate.confidence,
          learningCount: 1,
          autoApply: true,
          lastUsedAt: selectedAt
        });

        productCatalogService.recordAliasMemory({
          rawName: item.rawProductName,
          displayName: product.name,
          productId: product.id,
          supplierId: document.sourceId,
          sourceDomain: "organization",
          sourceType: "ocr",
          confidence: topCandidate.confidence,
          verified: true,
          isActive: true
        });
      }

      return {
        ...item,
        productMasterId: product?.id ?? topCandidate.productId,
        dictionaryCandidateId: topCandidate.selectedAliasId || topCandidate.selectedLearningId || topCandidate.selectedMemoryId || "",
        normalizedProductName: topCandidate.standardProductName ?? item.normalizedProductName ?? item.rawProductName,
        confidence: Math.max(Number(item.confidence ?? 0), Number(topCandidate.confidence ?? 0)),
        reviewStatus: "APPROVED"
      };
    }

    reviewCount += 1;
    return {
      ...item,
      confidence: Math.max(Number(item.confidence ?? 0), Number(topCandidate.confidence ?? 0))
    };
  });

  const candidateSummary = {
    total: updatedLineItems.length,
    autoApprovedCount,
    reviewCount,
    unknownCount
  };

  const updatedDocument = ocrDocumentQueueStore.update(document.documentId, {
    lineItems: updatedLineItems,
    reviewResult: {
      ...(document.reviewResult ?? {}),
      candidateSummary,
      selectedRoute: document.reviewResult?.selectedRoute ?? "",
      updatedAt: selectedAt
    }
  });

  const allAutoApproved = updatedLineItems.length > 0 && updatedLineItems.every((item) => item.reviewStatus === "APPROVED");
  if (allAutoApproved && updatedDocument.validation?.postingAllowed === true && updatedDocument.status === "REVIEW_REQUIRED") {
    const approvedDocument = ocrDocumentQueueStore.approve(document.documentId, "system");
    applyOcrDocumentLearning(approvedDocument);
    return approvedDocument;
  }

  return updatedDocument;
}

function recordOcrDictionarySelection(documentId, lineNo, productId) {
  const document = ocrDocumentQueueStore.getById(documentId);
  if (!document) throw new Error(`OCR document not found: ${documentId}`);

  const lineItem = (document.lineItems ?? []).find((item) => Number(item.rowNo ?? 0) === Number(lineNo));
  if (!lineItem) throw new Error(`OCR line item not found: ${lineNo}`);

  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId });
  const candidates = buildOcrDictionaryCandidates({ document, lineItem, catalog, historyEntries });
  const selected = candidates.find((candidate) => candidate.productId === productId);
  if (!selected) throw new Error(`Dictionary candidate not found: ${productId}`);

  const product = productEngine.findProductById(productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const confidence = selected.confidence;
  const route = selected.route ?? resolveOcrCandidateRoute(confidence);
  const selectedAt = new Date().toISOString();

  ocrProductCandidateStore.recordCandidate({
    documentId,
    lineNo,
    rawName: lineItem.rawProductName,
    normalizedName: selected.normalizedProductName ?? lineItem.rawProductName,
    dictionaryId: product.id,
    confidence,
    status: route,
    approvedBy: route === "AUTO_APPROVED" ? "system" : "",
    approvedAt: route === "AUTO_APPROVED" ? selectedAt : null,
    matchStrategy: selected.matchStrategy ?? "SIMILARITY",
    reason: selected.reason,
    sourceCount: selected.sourceCount,
    selectedBy: "user",
    selectedAt
  });

  ocrDictionaryHistoryStore.recordSelection({
    documentId,
    lineNo,
    rawName: lineItem.rawProductName,
    supplierId: document.sourceId,
    supplierName: document.supplierName || document.sourceName,
    productId: product.id,
    productName: product.name,
    aliasId: selected.selectedAliasId || "",
    aliasMatch: selected.aliasMatch,
    decisionType: route,
    confidence,
    sourceCount: selected.sourceCount,
    selectedBy: "user",
    sourceLabel: "ocr",
    reason: selected.reason,
    selectedAt
  });

  ocrFailureLearningStore.recordCorrection({
    tenantId: "SMARTPD_DEV",
    failureCaseId: documentId,
    beforeText: lineItem.rawProductName,
    afterText: product.name,
    selectedDictionaryId: product.id,
    correctionType: "USER_SELECTION",
    correctedBy: "user"
  });
  ocrFailureLearningStore.recordPatternLearning({
    tenantId: "SMARTPD_DEV",
    supplierId: document.sourceId,
    templateId: document.reviewResult?.templateId ?? null,
    patternType: "DICTIONARY_CORRECTION",
    sourcePattern: lineItem.rawProductName,
    targetPattern: product.name,
    sampleCount: 1,
    successCount: 1,
    confidence,
    lastUsedAt: selectedAt
  });

  productCatalogService.recordAliasMemory({
    rawName: lineItem.rawProductName,
    displayName: product.name,
    productId: product.id,
    supplierId: document.sourceId,
    sourceDomain: "organization",
    sourceType: "ocr",
    confidence,
    verified: true,
    isActive: true
  });

  productCatalogService.recordLearning({
    supplierId: document.sourceId,
    originalName: lineItem.rawProductName,
    productMasterId: product.id,
    confidence,
    learningCount: 1,
    autoApply: false,
    lastUsedAt: selectedAt
  });

  const updatedLineItems = (document.lineItems ?? []).map((item) => {
    if (Number(item.rowNo ?? 0) !== Number(lineNo)) return item;
    return {
      ...item,
      productMasterId: product.id,
      dictionaryCandidateId: selected.selectedAliasId || selected.selectedLearningId || selected.selectedMemoryId || "",
      normalizedProductName: product.name,
      confidence: Math.max(Number(item.confidence ?? 0), confidence),
      reviewStatus: route === "AUTO_APPROVED" ? "APPROVED" : "SELECTED"
    };
  });

  const updatedDocument = ocrDocumentQueueStore.update(documentId, {
    lineItems: updatedLineItems,
    reviewResult: {
      ...(document.reviewResult ?? {}),
      selectedLineNo: lineNo,
      selectedProductId: product.id,
      selectedProductName: product.name,
      selectedAliasMatch: selected.aliasMatch,
      selectedRoute: route,
      selectedConfidence: confidence,
      selectedSourceCount: selected.sourceCount,
      selectedReason: selected.reason,
      selectedAt
    }
  });

  const allResolved = updatedDocument.lineItems.every((item) => Boolean(item.productMasterId));
  if (route === "AUTO_APPROVED" && allResolved && updatedDocument.validation?.postingAllowed === true && updatedDocument.status === "REVIEW_REQUIRED") {
    const approvedDocument = ocrDocumentQueueStore.approve(documentId, "system");
    applyOcrDocumentLearning(approvedDocument);
  }

  state.ocrDocumentId = documentId;
  state.ocrSelectedLineNo = lineNo;
  return { product, selected, confidence };
}

function recordOcrUnknownSelection(documentId, lineNo) {
  const document = ocrDocumentQueueStore.getById(documentId);
  if (!document) throw new Error(`OCR document not found: ${documentId}`);

  const lineItem = (document.lineItems ?? []).find((item) => Number(item.rowNo ?? 0) === Number(lineNo));
  if (!lineItem) throw new Error(`OCR line item not found: ${lineNo}`);

  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId });
  const candidates = buildOcrDictionaryCandidates({ document, lineItem, catalog, historyEntries });
  const selected = candidates[0] ?? null;
  const selectedAt = new Date().toISOString();

  ocrProductCandidateStore.recordUnknown({
    documentId,
    lineNo,
    rawName: lineItem.rawProductName,
    normalizedName: lineItem.normalizedProductName ?? lineItem.rawProductName,
    confidence: selected?.confidence ?? 0,
    reason: selected?.reason ?? "UNKNOWN",
    sourceCount: selected?.sourceCount ?? 0,
    selectedBy: "user",
    selectedAt
  });

  ocrDictionaryHistoryStore.recordUnknown({
    documentId,
    lineNo,
    rawName: lineItem.rawProductName,
    supplierId: document.sourceId,
    supplierName: document.supplierName || document.sourceName,
    confidence: selected?.confidence ?? 0,
    reason: selected?.reason ?? "Unknown registration",
    selectedBy: "user",
    sourceLabel: "ocr",
    selectedAt
  });

  ocrFailureLearningStore.recordCorrection({
    tenantId: "SMARTPD_DEV",
    failureCaseId: documentId,
    beforeText: lineItem.rawProductName,
    afterText: "Unknown",
    selectedDictionaryId: null,
    correctionType: "UNKNOWN_SELECTION",
    correctedBy: "user"
  });
  ocrFailureLearningStore.recordFailureCase({
    tenantId: "SMARTPD_DEV",
    ocrDocumentId: documentId,
    ocrLineItemId: String(lineNo),
    supplierId: document.sourceId,
    supplierName: document.supplierName || document.sourceName,
    templateId: document.reviewResult?.templateId ?? null,
    failureType: "PRODUCT_MATCH_FAILED",
    rawText: lineItem.rawProductName,
    expectedText: null,
    providerName: document.providerName ?? providerName(document.ocrProviderId),
    providerConfidence: Number(selected?.confidence ?? 0),
    qualityGrade: document.imageAnalysis?.qualityLevel ?? "E",
    failureReasonCodes: [selected?.reason ?? "UNKNOWN"],
    status: "OPEN"
  });

  const updatedLineItems = (document.lineItems ?? []).map((item) => {
    if (Number(item.rowNo ?? 0) !== Number(lineNo)) return item;
    return {
      ...item,
      dictionaryCandidateId: "",
      productMasterId: "",
      normalizedProductName: item.normalizedProductName || item.rawProductName,
      confidence: selected?.confidence ?? Number(item.confidence ?? 0),
      reviewStatus: "UNKNOWN"
    };
  });

  ocrDocumentQueueStore.update(documentId, {
    lineItems: updatedLineItems,
    reviewResult: {
      ...(document.reviewResult ?? {}),
      selectedLineNo: lineNo,
      selectedRoute: "UNKNOWN",
      selectedProductId: "",
      selectedProductName: "Unknown",
      selectedAliasMatch: "UNKNOWN",
      selectedConfidence: selected?.confidence ?? 0,
      selectedSourceCount: selected?.sourceCount ?? 0,
      selectedReason: selected?.reason ?? "Unknown registration",
      selectedAt
    }
  });

  state.ocrDocumentId = documentId;
  state.ocrSelectedLineNo = lineNo;
}

function categoryOptions(selectedId) {
  return productEngine.listCategories().map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function supplierOptions(selectedId) {
  const options = [`<option value="">선택 없음</option>`];
  options.push(...productEngine.listSuppliers({ activeOnly: false }).map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}</option>`));
  return options.join("");
}

function productOptions(selectedId) {
  return productEngine.listProducts({ activeOnly: false }).map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function sourceDomainOptions(selectedValue) {
  const options = ["consumer", "butcher_shop", "distributor", "organization", "government", "unknown"];
  return options.map((value) => `<option value="${value}" ${value === (selectedValue ?? "unknown") ? "selected" : ""}>${value}</option>`).join("");
}

function sourceTypeOptions(selectedValue) {
  const options = ["manual", "supplier_invoice", "pos", "ocr"];
  return options.map((value) => `<option value="${value}" ${value === (selectedValue ?? "manual") ? "selected" : ""}>${value}</option>`).join("");
}

function unitOptions(selectedValue) {
  const options = ["kg", "g", "ea", "pack"];
  return options.map((value) => `<option value="${value}" ${value === (selectedValue ?? "kg") ? "selected" : ""}>${value}</option>`).join("");
}

function storageOptions(selectedValue) {
  const options = ["fresh", "frozen", "mixed", "unknown"];
  return options.map((value) => `<option value="${value}" ${value === (selectedValue ?? "fresh") ? "selected" : ""}>${value}</option>`).join("");
}

function value(id) {
  return document.querySelector(`#${id}`)?.value.trim() ?? "";
}

function numberValue(id, fallback = 0) {
  const parsed = Number(document.querySelector(`#${id}`)?.value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checked(id) {
  return Boolean(document.querySelector(`#${id}`)?.checked);
}

function emptyToUndefined(input) {
  return input ? input : undefined;
}

function healthResult(result) {
  return `
    <div class="progress-list" style="margin-top:16px">
      ${progressRow("신뢰도", result.confidence)}
      <p class="label">감지 POS: ${result.detectedVendor}</p>
      <p class="label">추천 Adapter: Level ${result.recommendedAdapterLevel}</p>
      <p class="label">${result.notes.join(", ")}</p>
    </div>
  `;
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

function inventoryStatus(status) {
  const map = {
    ok: badge("정상", "ok"),
    warn: badge("주의", "warn"),
    danger: badge("부족", "danger")
  };
  return map[status] ?? badge(status);
}

function goodChuksanStatusBadge(mappingStatus, reviewStatus) {
  if (mappingStatus === "cost_item") return badge("비상품", "warn");
  if (mappingStatus === "duplicate") return badge("중복", "danger");
  if (mappingStatus === "mapped" || reviewStatus === "approved") return badge("매핑", "ok");
  if (reviewStatus === "rejected") return badge("반려", "danger");
  return badge("검토대기", "warn");
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

function formatDuration(value) {
  const milliseconds = Number(value ?? 0);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "-";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)} sec`;
  return `${(milliseconds / 60000).toFixed(1)} min`;
}

function categoryName(categoryId) {
  return productEngine.findCategoryById(categoryId)?.name ?? "-";
}

function productAttributeSummary(product) {
  if (!product) return "-";
  return summarizeProductAttributes({
    species: product.species,
    category: categoryName(product.categoryId),
    part: product.part,
    processing: product.processingType,
    skin: product.skinType,
    bone: product.boneType,
    storage: product.storageType,
    origin: product.origin,
    grade: product.grade,
    unit: product.baseUnit
  });
}

function filterOptions(values, selectedValue, placeholder) {
  return values.map((value) => {
    if (value === "") {
      return `<option value="" ${selectedValue === "" ? "selected" : ""}>${placeholder}</option>`;
    }
    return `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${value}</option>`;
  }).join("");
}

function categoryTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>코드</th><th>분류명</th><th>상태</th><th>동작</th></tr></thead>
        <tbody>
          ${rows.map((category) => `
            <tr>
              <td>${category.code}</td>
              <td>${category.name}</td>
              <td>${category.isActive === false ? badge("비활성", "danger") : badge("활성", "ok")}</td>
              <td class="row-actions">
                <button class="text-button" data-category-edit="${category.id}">수정</button>
                <button class="text-button danger" data-category-deactivate="${category.id}">비활성</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
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

function formatDate(value) {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function isSameLocalDay(value, reference = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === reference.toDateString();
}

function escapeHtml(value) {
  return String(value ?? "")
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
    render();
  });
});

mobileBackButton?.addEventListener("click", () => {
  state.view = "dashboard";
  render();
});

healthButton.addEventListener("click", runHealthCheck);
supabaseButton?.addEventListener("click", refreshSupabaseReadStatus);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

function saveMobileOcrCorrections(documentId) {
  const selectedDocument = ocrDocumentQueueStore.getById(documentId);
  if (!selectedDocument) throw new Error("확인할 거래명세서를 찾지 못했습니다.");

  const documentFields = { ...(selectedDocument.documentFields ?? {}) };
  document.querySelectorAll("[data-mobile-ocr-document-field]").forEach((input) => {
    const fieldName = input.dataset.mobileOcrDocumentField;
    documentFields[fieldName] = fieldName === "totalAmount"
      ? readMobileOcrNumber(input.value)
      : String(input.value ?? "").trim();
  });

  const numericFields = new Set(["quantity", "unitPrice", "amount", "taxAmount", "totalAmount"]);
  const valuesByLine = new Map();
  document.querySelectorAll("[data-mobile-ocr-line][data-mobile-ocr-field]").forEach((input) => {
    const lineNo = Number(input.dataset.mobileOcrLine ?? 0);
    const fieldName = input.dataset.mobileOcrField;
    const lineValues = valuesByLine.get(lineNo) ?? {};
    lineValues[fieldName] = numericFields.has(fieldName)
      ? readMobileOcrNumber(input.value)
      : String(input.value ?? "").trim();
    valuesByLine.set(lineNo, lineValues);
  });

  const lineItems = (selectedDocument.lineItems ?? []).map((item, index) => {
    const rowNo = Number(item.rowNo ?? index + 1);
    const edited = valuesByLine.get(rowNo) ?? {};
    const amount = Number(edited.amount ?? item.amount ?? 0);
    const taxAmount = Number(edited.taxAmount ?? item.taxAmount ?? 0);
    return {
      ...item,
      ...edited,
      rowNo,
      amount,
      taxAmount,
      totalAmount: Number(edited.totalAmount ?? item.totalAmount ?? amount + taxAmount),
      livestockTraceNo: String(edited.traceNumber ?? item.livestockTraceNo ?? item.traceNumber ?? "").trim(),
      traceNumber: String(edited.traceNumber ?? item.traceNumber ?? item.livestockTraceNo ?? "").trim(),
      reviewStatus: "SELECTED"
    };
  });

  const catalog = productCatalogService.getCatalogSnapshot();
  const historyEntries = ocrDictionaryHistoryStore.list({ documentId });
  const viewModels = lineItems.map((item, index) => buildMobileOcrLineViewModel({
    document: { ...selectedDocument, documentFields, lineItems },
    item,
    index,
    catalog,
    historyEntries
  }));
  const validation = validateMobileOcrDocument({ ...selectedDocument, documentFields }, viewModels);

  ocrDocumentQueueStore.update(documentId, {
    documentFields,
    lineItems,
    validation: {
      ...(selectedDocument.validation ?? {}),
      lineCount: lineItems.length,
      calculationOk: validation.ok,
      totalAmountMatched: validation.ok,
      issues: validation.messages
    },
    reviewResult: {
      ...(selectedDocument.reviewResult ?? {}),
      outcome: validation.ok ? "MANUAL_VALIDATION_PASSED" : "REVIEW_REQUIRED",
      issues: validation.messages
    }
  });

  return validation;
}

function readMobileOcrNumber(value) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

eventEngine.record("app.started", { task: "TASK-001", architecture: "product-engine-first" });
render();
refreshSupabaseReadStatus().catch(() => {});
