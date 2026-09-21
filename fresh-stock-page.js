import { POLICY_DEFAULTS, calculateSafetyStock, explainRecommendation } from "./src/data/fresh-stock-engine.js";

const REST = `${window.__MEATOS_SUPABASE__?.url || "https://pkrsiqjzllyiafwpskll.supabase.co"}/rest/v1`;
const H = window.MEATOS_API_HEADERS;
const tenantId = window.MEATOS_TENANT;
const storeId = window.MEATOS_CONTEXT?.storeId || "";
const page = document.body.dataset.freshPage;
const productNames = window.MEATOS_PRODUCT_NAMES;
const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
const num = (value, digits = 1) => Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits:digits });
const localDate = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };

async function get(path) {
  const response = await fetch(`${REST}${path}`, { headers:H });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function canonical(name) {
  if (!productNames) return { key:String(name), displayName:String(name), storage:"" };
  const result = productNames.resolve(name || "");
  return { key:result.key, displayName:result.displayName, storage:result.storage, category:result.category };
}

async function loadPolicies() {
  try {
    const filter = storeId ? `&or=(store_id.eq.${storeId},store_id.is.null)` : "&store_id=is.null";
    const rows = await get(`/fresh_stock_policy?company_id=eq.${tenantId}${filter}&active=eq.true&select=*&limit=1000`);
    return new Map(rows.map((row) => [row.product_key, row]));
  } catch { return new Map(); }
}

async function loadYieldProfiles() {
  try {
    const rows = await get(`/fresh_yield_profile?company_id=eq.${tenantId}&select=*&limit=1000`);
    return new Map(rows.map((row) => [row.input_product_key, row]));
  } catch { return new Map(); }
}

async function loadAnalysis() {
  const storeFilter = storeId ? `&store_id=eq.${encodeURIComponent(storeId)}` : "";
  const [moves, sales, policies, yields] = await Promise.all([
    get(`/inventory_movement?tenant_id=eq.${tenantId}${storeFilter}&is_active=eq.true&select=raw_product_name,quantity,movement_type,expiry_date,movement_date,created_at&limit=5000`),
    get(`/sales_record?tenant_id=eq.${tenantId}${storeFilter}&sale_date=gte.${localDate(-55)}&select=item_name,quantity,sale_date,is_cancelled&limit=5000`).catch(() => []),
    loadPolicies(), loadYieldProfiles()
  ]);
  const map = new Map();
  for (const movement of moves) {
    const p = canonical(movement.raw_product_name);
    const row = map.get(p.key) || { ...p, onHand:0, daily:new Map(), nearExpiry:0 };
    row.onHand += (movement.movement_type === "OUT" ? -1 : 1) * Number(movement.quantity || 0);
    if (movement.movement_type === "IN" && movement.expiry_date && movement.expiry_date <= localDate(3)) row.nearExpiry += Number(movement.quantity || 0);
    map.set(p.key, row);
  }
  for (const sale of sales) {
    if (sale.is_cancelled) continue;
    const p = canonical(sale.item_name);
    const row = map.get(p.key) || { ...p, onHand:0, daily:new Map(), nearExpiry:0 };
    row.daily.set(sale.sale_date, (row.daily.get(sale.sale_date) || 0) + Number(sale.quantity || 0));
    map.set(p.key, row);
  }
  return [...map.values()].filter((row) => row.onHand > 0 || row.daily.size).map((row) => {
    const demand = Array.from({ length:56 }, (_, index) => row.daily.get(localDate(index - 55)) || 0);
    const policy = policies.get(row.key) || {};
    const yieldProfile = yields.get(row.key) || {};
    const result = calculateSafetyStock({
      name:row.displayName, storage:row.storage, category:row.category, dailyDemand:demand, onHand:row.onHand,
      expectedWaste:row.nearExpiry, policyClass:policy.policy_class, serviceLevel:policy.service_level,
      reviewDays:policy.review_period_days, leadTimeDays:policy.lead_time_days, shelfLifeDays:policy.shelf_life_days,
      packSize:policy.pack_size_kg || 1, moq:policy.moq_kg || 0, leadTimeSamples:policy.lead_time_samples || 0,
      inventoryConfidence:policy.inventory_confidence || 0.7, yieldRate:yieldProfile.learned_yield_rate || yieldProfile.prior_yield_rate || 1,
      yieldConfidence:yieldProfile.confidence_score || 0.4
    });
    return { ...row, policy, yieldProfile, result, explanation:explainRecommendation(result) };
  }).sort((a,b) => ({ ORDER:0, REDUCE:1, REVIEW:2, HOLD:3 }[a.result.action] - { ORDER:0, REDUCE:1, REVIEW:2, HOLD:3 }[b.result.action]));
}

let rows = [];
const label = { ORDER:"발주 필요", HOLD:"적정", REVIEW:"확인 필요", REDUCE:"감축 우선" };
function renderKpis() {
  const order = rows.filter((row) => row.result.action === "ORDER");
  const review = rows.filter((row) => row.result.action === "REVIEW");
  const reduce = rows.filter((row) => row.result.action === "REDUCE");
  document.getElementById("fresh-kpis").innerHTML = page === "order"
    ? `<div class="fs-kpi"><b>${order.length}건</b><span>발주 제안</span></div><div class="fs-kpi"><b>${num(order.reduce((s,r)=>s+r.result.recommendedOrderKg,0))}kg</b><span>추천 발주량</span></div><div class="fs-kpi"><b>${review.length}건</b><span>관리자 확인</span></div><div class="fs-kpi"><b>0건</b><span>자동 전송</span></div>`
    : `<div class="fs-kpi"><b>${rows.length}종</b><span>관리 품목</span></div><div class="fs-kpi"><b>${order.length}종</b><span>재주문점 이하</span></div><div class="fs-kpi"><b>${reduce.length}종</b><span>과잉·임박</span></div><div class="fs-kpi"><b>${review.length}종</b><span>데이터 확인</span></div>`;
}

function visibleRows() {
  const query = document.getElementById("fresh-search").value.trim().toLowerCase();
  const filter = document.getElementById("fresh-filter").value;
  return rows.filter((row) => (!query || row.displayName.toLowerCase().includes(query)) && (filter === "ALL" || row.result.action === filter));
}

function render() {
  const filtered = visibleRows();
  const body = document.getElementById("fresh-body");
  if (!filtered.length) { body.innerHTML = `<tr><td colspan="9" class="fs-empty">조건에 맞는 품목이 없습니다.</td></tr>`; return; }
  body.innerHTML = filtered.map((row) => {
    const r = row.result;
    if (page === "order") return `<tr><td class="name">${esc(row.displayName)}</td><td>${esc(r.policyLabel)}<br><small>${num(row.policy.pack_size_kg || 1)}kg 단위</small></td><td>${num(r.availableKg)}kg</td><td>${num(r.targetStockKg)}kg</td><td><b>${num(r.recommendedOrderKg)}kg</b></td><td class="fs-confidence">${Math.round(r.confidence*100)}%</td><td><span class="fs-pill ${r.action.toLowerCase()}">${label[r.action]}</span></td><td class="fs-reason">${esc(row.explanation)}</td><td><button class="fs-btn" data-action="approve" data-key="${esc(row.key)}" ${r.action !== "ORDER" || !window.MEATOS_CONTEXT?.isBusiness ? "disabled" : ""}>추천 승인</button></td></tr>`;
    return `<tr><td class="name">${esc(row.displayName)}</td><td>${esc(r.policyLabel)}</td><td>${num(r.availableKg)}kg</td><td>${num(r.dailyDemandKg)}kg</td><td>${num(r.safetyStockKg)}kg</td><td>${num(r.reorderPointKg)}kg</td><td>${num(r.targetStockKg)}kg</td><td><span class="fs-pill ${r.action.toLowerCase()}">${label[r.action]}</span></td><td class="fs-reason">${esc(row.explanation)}</td></tr>`;
  }).join("");
}

async function recordDecision(key) {
  const row = rows.find((item) => item.key === key);
  if (!row || !confirm(`${row.displayName} ${row.result.recommendedOrderKg}kg 추천을 승인할까요?\n현재는 공급처로 전송되지 않고 승인 이력만 저장됩니다.`)) return;
  const response = await fetch(`${REST}/fresh_replenishment_recommendation`, { method:"POST", headers:{ ...H, "Content-Type":"application/json", Prefer:"return=minimal" }, body:JSON.stringify({
    company_id:tenantId, store_id:storeId || null, product_key:row.key, product_name:row.displayName,
    policy_class:row.result.policyClass, available_qty_kg:row.result.availableKg, target_stock_kg:row.result.targetStockKg,
    recommended_order_kg:row.result.recommendedOrderKg, confidence_score:row.result.confidence, decision_status:"APPROVED",
    reason_codes:row.result.reasonCodes, model_version:"FRESH-STOCK-MVP-1"
  }) });
  alert(response.ok ? "승인 이력을 저장했습니다. 공급처 전송은 하지 않았습니다." : "운영 DB에 Fresh Stock 마이그레이션을 적용한 뒤 저장할 수 있습니다.");
}

document.getElementById("fresh-search").addEventListener("input", render);
document.getElementById("fresh-filter").addEventListener("change", render);
document.getElementById("fresh-body").addEventListener("click", (event) => { const button=event.target.closest("[data-action=approve]"); if(button) recordDecision(button.dataset.key); });

try { rows = await loadAnalysis(); renderKpis(); render(); }
catch (error) { document.getElementById("fresh-body").innerHTML = `<tr><td colspan="9" class="fs-empty">데이터를 불러오지 못했습니다. ${esc(error.message)}</td></tr>`; }
