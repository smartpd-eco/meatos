const POLICY_DEFAULTS = Object.freeze({
  F1_CORE_FRESH: { label: "신선 주력", serviceLevel: 0.90, reviewDays: 1, leadTimeDays: 1, shelfLifeDays: 5, riskFactor: 1.0 },
  F2_SHORT_LIFE_PROCESSED: { label: "단기 가공품", serviceLevel: 0.78, reviewDays: 1, leadTimeDays: 1, shelfLifeDays: 2, riskFactor: 0.55 },
  F3_PREMIUM_INTERMITTENT: { label: "고가 간헐품", serviceLevel: 0.72, reviewDays: 3, leadTimeDays: 2, shelfLifeDays: 7, riskFactor: 0.45 },
  F4_FROZEN_BUFFER: { label: "냉동 완충품", serviceLevel: 0.92, reviewDays: 7, leadTimeDays: 3, shelfLifeDays: 60, riskFactor: 1.1 },
  F5_TRANSFORMABLE_RAW: { label: "가공 전환 원육", serviceLevel: 0.86, reviewDays: 2, leadTimeDays: 2, shelfLifeDays: 7, riskFactor: 0.8 }
});

const YIELD_PRIORS = Object.freeze({
  DIRECT_RETAIL: { label: "단순 소분·판매", rate: 0.96, min: 0.90, max: 0.99, equivalentKg: 30 },
  TRIM_STANDARD: { label: "일반 정형", rate: 0.88, min: 0.78, max: 0.96, equivalentKg: 50 },
  BONE_IN_COMPLEX: { label: "골부착·복합 정형", rate: 0.75, min: 0.60, max: 0.88, equivalentKg: 70 },
  MULTI_OUTPUT: { label: "복수 산출 원육", rate: 0.85, min: 0.68, max: 0.94, equivalentKg: 80 }
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 3) => Number((Number(value) || 0).toFixed(digits));

function classifyPolicy(product = {}) {
  const text = `${product.name || ""} ${product.storage || ""} ${product.category || ""}`.toLowerCase();
  if (/냉동|frozen/.test(text)) return "F4_FROZEN_BUFFER";
  if (/다짐|세절|양념|해동|가공/.test(text)) return "F2_SHORT_LIFE_PROCESSED";
  if (/특수|한우|와규|안심|채끝/.test(text) && Number(product.dailyDemand || 0) < 2) return "F3_PREMIUM_INTERMITTENT";
  if (/원육|미박|전지|후지|앞다리|뒷다리/.test(text)) return "F5_TRANSFORMABLE_RAW";
  return "F1_CORE_FRESH";
}

function calculateDemandStats(dailyValues = []) {
  const values = dailyValues.map(Number).filter(Number.isFinite).map((value) => Math.max(0, value));
  if (!values.length) return { mean: 0, recentMean: 0, deviation: 0, sampleDays: 0, confidence: 0.2 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const recent = values.slice(-7);
  const recentMean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length - 1);
  const weightedMean = (recentMean * 0.65) + (mean * 0.35);
  return {
    mean: round(weightedMean),
    recentMean: round(recentMean),
    deviation: round(Math.sqrt(variance)),
    sampleDays: values.length,
    confidence: round(clamp(0.25 + values.length / 56, 0.25, 0.95), 2)
  };
}

function learnYieldProfile({ priorKey = "TRIM_STANDARD", observations = [] } = {}) {
  const prior = YIELD_PRIORS[priorKey] || YIELD_PRIORS.TRIM_STANDARD;
  const valid = observations.filter((row) => {
    const input = Number(row.inputWeight);
    const output = Number(row.outputWeight);
    const byproduct = Number(row.byproductWeight || 0);
    const loss = Number(row.lossWeight || 0);
    if (!(input > 0) || output < 0) return false;
    const residualRate = Math.abs(input - output - byproduct - loss) / input;
    return residualRate <= 0.10;
  });
  const inputTotal = valid.reduce((sum, row) => sum + Number(row.inputWeight), 0);
  const outputTotal = valid.reduce((sum, row) => sum + Number(row.outputWeight), 0);
  const lossTotal = valid.reduce((sum, row) => sum + Number(row.lossWeight || 0), 0);
  const posterior = inputTotal > 0
    ? ((prior.rate * prior.equivalentKg) + outputTotal) / (prior.equivalentKg + inputTotal)
    : prior.rate;
  const confidence = clamp(0.25 + valid.length / 40 + inputTotal / 500, 0.25, 0.98);
  const shrink = 1 - confidence;
  return {
    rate: round(clamp(posterior, prior.min, prior.max), 4),
    lossRate: round(inputTotal > 0 ? lossTotal / inputTotal : 1 - prior.rate, 4),
    min: round(clamp(posterior - (prior.rate - prior.min) * shrink, prior.min, prior.max), 4),
    max: round(clamp(posterior + (prior.max - prior.rate) * shrink, prior.min, prior.max), 4),
    sampleCount: valid.length,
    observedInputKg: round(inputTotal),
    confidence: round(confidence, 2),
    source: valid.length >= 30 ? "STORE_LEARNED" : valid.length ? "BLENDED" : "MEATOS_PRIOR"
  };
}

function calculateSafetyStock(input = {}) {
  const policyClass = input.policyClass || classifyPolicy(input);
  const defaults = POLICY_DEFAULTS[policyClass];
  const demand = calculateDemandStats(input.dailyDemand || []);
  const leadTimeDays = Math.max(0.25, Number(input.leadTimeDays ?? defaults.leadTimeDays));
  const reviewDays = Math.max(0, Number(input.reviewDays ?? defaults.reviewDays));
  const serviceLevel = clamp(input.serviceLevel ?? defaults.serviceLevel, 0.5, 0.99);
  const z = serviceLevel >= 0.97 ? 1.88 : serviceLevel >= 0.95 ? 1.65 : serviceLevel >= 0.90 ? 1.28 : serviceLevel >= 0.85 ? 1.04 : 0.84;
  const safety = z * demand.deviation * Math.sqrt(leadTimeDays) * defaults.riskFactor;
  const cycleDemand = demand.mean * (leadTimeDays + reviewDays);
  const shelfLifeDays = Math.max(1, Number(input.shelfLifeDays ?? defaults.shelfLifeDays));
  const expiryCap = demand.mean > 0 ? demand.mean * shelfLifeDays * 0.9 : Number.POSITIVE_INFINITY;
  const target = Math.max(0, Math.min(cycleDemand + safety, expiryCap));
  const onHand = Math.max(0, Number(input.onHand || 0));
  const reserved = Math.max(0, Number(input.reserved || 0));
  const hold = Math.max(0, Number(input.hold || 0));
  const expectedWaste = Math.max(0, Number(input.expectedWaste || 0));
  const inbound = Math.max(0, Number(input.inbound || 0));
  const available = Math.max(0, onHand - reserved - hold - expectedWaste);
  const rawNeed = Math.max(0, target - available - inbound);
  const yieldRate = clamp(input.yieldRate || 1, 0.05, 1);
  const convertedNeed = rawNeed / yieldRate;
  const packSize = Math.max(0.001, Number(input.packSize || 1));
  const moq = Math.max(0, Number(input.moq || 0));
  const recommended = convertedNeed <= 0 ? 0 : Math.max(moq, Math.ceil(convertedNeed / packSize) * packSize);
  const inventoryConfidence = clamp(input.inventoryConfidence ?? 0.7, 0, 1);
  const leadTimeSamples = Math.max(0, Number(input.leadTimeSamples || 0));
  const yieldConfidence = clamp(input.yieldConfidence ?? (yieldRate < 1 ? 0.4 : 0.8), 0, 1);
  const confidence = clamp(
    demand.confidence * 0.35 + inventoryConfidence * 0.30 + Math.min(1, leadTimeSamples / 20) * 0.20 + yieldConfidence * 0.15,
    0,
    0.98
  );
  const expiryBlocked = Number.isFinite(expiryCap) && available >= expiryCap;
  let action = recommended > 0 ? "ORDER" : "HOLD";
  if (expectedWaste > 0 || expiryBlocked) action = "REDUCE";
  if (confidence < 0.55 || demand.sampleDays < 7) action = "REVIEW";
  return {
    policyClass,
    policyLabel: defaults.label,
    dailyDemandKg: demand.mean,
    demandDeviationKg: demand.deviation,
    sampleDays: demand.sampleDays,
    availableKg: round(available),
    safetyStockKg: round(safety),
    reorderPointKg: round(demand.mean * leadTimeDays + safety),
    targetStockKg: round(target),
    expiryCapKg: Number.isFinite(expiryCap) ? round(expiryCap) : null,
    recommendedOrderKg: round(recommended),
    confidence: round(confidence, 2),
    action,
    automationAllowed: confidence >= 0.90 && demand.sampleDays >= 56 && inventoryConfidence >= 0.95 && leadTimeSamples >= 20 && !expiryBlocked,
    reasonCodes: [
      demand.sampleDays < 56 ? "DEMAND_HISTORY_SHORT" : "DEMAND_HISTORY_OK",
      inventoryConfidence < 0.95 ? "INVENTORY_CHECK_REQUIRED" : "INVENTORY_TRUSTED",
      expectedWaste > 0 ? "EXPIRY_RISK" : "EXPIRY_CLEAR",
      yieldRate < 1 && yieldConfidence < 0.75 ? "YIELD_LEARNING" : "YIELD_READY"
    ]
  };
}

function explainRecommendation(result) {
  if (result.action === "REDUCE") return "임박·예상 손실 재고가 있어 새 발주보다 기존 재고 소진이 우선입니다.";
  if (result.action === "REVIEW") return "학습 데이터가 아직 부족해 수량은 참고값입니다. 실사와 납기를 확인해 주세요.";
  if (result.action === "HOLD") return "현재 가용재고가 소비기한 내 목표재고를 충족해 발주를 보류합니다.";
  return `리드타임 수요와 안전재고를 반영해 ${result.recommendedOrderKg}kg 발주를 제안합니다.`;
}

export { POLICY_DEFAULTS, YIELD_PRIORS, classifyPolicy, calculateDemandStats, learnYieldProfile, calculateSafetyStock, explainRecommendation };
