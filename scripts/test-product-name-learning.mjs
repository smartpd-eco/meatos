import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("./validate-static.mjs");
await import("../src/data/product-name-substitution.js");

const names = globalThis.MEATOS_PRODUCT_NAMES;

assert.equal(names.canonicalize("냉장 황창(장터)"), "냉장 항정(장터)");
assert.equal(names.classify("냉장 삼겸").displayName, "냉장 삼겹살");
assert.equal(names.classify("냉장 황창").displayName, "냉장 항정");
assert.equal(names.groupKey("냉장 삼겹살(장터)"), names.groupKey("냉장 삼겹(장터)"));
assert.equal(names.groupKey("냉장 삼겹(장터)S"), names.groupKey("냉장 삼겹(장터)"));
assert.equal(names.groupKey("냉장 황창(장터)S"), names.groupKey("냉장 항정(장터)"));
assert.notEqual(names.groupKey("냉동 삼겹(장터)"), names.groupKey("냉장 삼겹(장터)"));
assert.notEqual(names.groupKey("냉장 미박삼겹(장터)"), names.groupKey("냉장 삼겹(장터)"));
assert.equal(names.classify("냉장 삼겹(장터)S").displayName, "냉장 삼겹살");
assert.equal(names.classify("냉장 황창(장터)").displayName, "냉장 항정");

const skinlessShoulderAliases = [
  "미전지",
  "미박 앞다리",
  "앞다리 미박",
  "미박 전지",
  "미 앞다리살",
  "미박 앞다리살"
];
const skinlessShoulderTypos = [
  "미젼지",
  "미전쥐",
  "미전디",
  "미밖 앞다리",
  "미박 압다리",
  "앞다라 미박"
];
const skinlessShoulderKey = names.groupKey("미박 앞다리살");
for (const input of [...skinlessShoulderAliases, ...skinlessShoulderTypos]) {
  const classified = names.classify(input);
  assert.equal(classified.displayName, "미박 앞다리살", `${input} 표준명 치환`);
  assert.equal(classified.category, "돼지고기", `${input} 축종 분류`);
  assert.equal(classified.cut, "앞다리살", `${input} 부위 분류`);
  assert.equal(classified.dictionaryCode, "DICT-0002", `${input} 표준 사전 연결`);
  assert.equal(classified.productCode, "PROD-0002", `${input} 표준 상품 연결`);
  assert.equal(classified.key, skinlessShoulderKey, `${input} 재고 통합키`);
}
assert.notEqual(names.groupKey("냉장 미전지"), names.groupKey("냉동 미전지"));
assert.equal(names.canonicalize("항미전지"), "항미전지");

const skinOnBellyAliases = [
  "미박 삼겹살",
  "미삼겹",
  "미빅피 삼겹살",
  "미박피 삼겹살",
  "미밖 삼겹살",
  "미백 삼겹살",
  "미뱍피 삼겹살",
  "미빅피 삽겹살",
  "미빅피 삼겹쌀"
];
const skinOnBellyKey = names.groupKey("미박 삼겹");
for (const input of skinOnBellyAliases) {
  const classified = names.classify(input);
  assert.equal(classified.displayName, "오겹살", `${input} 문서 승인 표준명 치환`);
  assert.equal(classified.category, "돼지고기", `${input} 축종 분류`);
  assert.equal(classified.cut, "삼겹", `${input} 부위 분류`);
  assert.equal(classified.dictionaryCode, "DICT-0001", `${input} 표준 사전 연결`);
  assert.equal(classified.productCode, "PROD-0001", `${input} 표준 상품 연결`);
  assert.equal(classified.key, skinOnBellyKey, `${input} 재고 통합키`);
}
assert.equal(names.classify("박피 삼겹살").displayName, "삼겹살");
assert.equal(names.classify("삼겹").displayName, "삼겹살");
assert.equal(names.groupKey("박피 삼겹살"), names.groupKey("삼겹살"));
assert.notEqual(names.groupKey("박피 삼겹살"), skinOnBellyKey);
assert.notEqual(names.groupKey("삼겹살"), skinOnBellyKey);
assert.notEqual(names.groupKey("냉장 미빅피 삼겹살"), names.groupKey("냉동 미빅피 삼겹살"));
assert.equal(names.canonicalize("미빅피 목살"), "미빅피 목살");
const unsupportedSkinOnNeck = names.classify("미빅피 목살");
assert.equal(unsupportedSkinOnNeck.displayName, "목살");
assert.equal(unsupportedSkinOnNeck.requiresReview, true);
assert.equal(unsupportedSkinOnNeck.reviewReason, "unsupported_skin_on_cut");
const frozenTwoLayerBelly = names.suggest("냉동 이겹살");
assert.equal(frozenTwoLayerBelly.suggestedName, "냉동 이겹살");
assert.equal(frozenTwoLayerBelly.category, "돼지고기");
assert.equal(frozenTwoLayerBelly.cut, "이겹살");
assert.equal(frozenTwoLayerBelly.dictionaryCode, "DICT-PORK-BELLY-TWO-LAYER");
assert.equal(frozenTwoLayerBelly.requiresConfirmation, false);
const skinOnRearLeg = names.suggest("미후지");
assert.equal(skinOnRearLeg.suggestedName, "미박 뒷다리살");
assert.equal(skinOnRearLeg.category, "돼지고기");
assert.equal(skinOnRearLeg.cut, "뒷다리");
const rearLegOcrCorrection = names.suggest("미우지 (장터)", { supplierName:"(주)좋은축산유통" });
assert.equal(rearLegOcrCorrection.suggestedName, "미박 뒷다리살");
assert.equal(rearLegOcrCorrection.confidence, 78);
assert.equal(rearLegOcrCorrection.requiresConfirmation, true);
assert.equal(rearLegOcrCorrection.ocrCorrection, "미우지→미후지");
for (const source of ["마후지 (장터)", "하후지 (장터)", "하우지 (장터)"]) {
  const correction = names.suggest(source, { supplierName:"(주)좋은축산유통" });
  assert.equal(correction.suggestedName, "미박 뒷다리살");
  assert.equal(correction.confidence, source.startsWith("마후지") ? 78 : 72);
  assert.equal(correction.requiresConfirmation, true);
  assert.equal(correction.ocrCorrection, `${source.slice(0, 3)}→미후지`);
}
const chilledRearLegCorrection = names.suggest("냉장 하후지 (장터)", { supplierName:"(주)좋은축산유통" });
assert.equal(chilledRearLegCorrection.suggestedName, "냉장 미박 뒷다리살");
assert.equal(skinOnRearLeg.dictionaryCode, "DICT-PORK-LEG-SKIN-ON");
assert.equal(skinOnRearLeg.requiresConfirmation, false);
const unknownBellyQualifier = names.classify("미불피 삼겹살");
assert.equal(unknownBellyQualifier.displayName, "미불피 삼겹살");
assert.equal(unknownBellyQualifier.requiresReview, true);
assert.notEqual(unknownBellyQualifier.key, names.groupKey("삼겹살"));
assert.equal(names.classify("미박이 삼겹살").displayName, "오겹살");
assert.equal(names.classify("미국 삼겹살").requiresReview, true);
const typoSuggestionA = names.suggest("미비 삽겨살");
assert.equal(typoSuggestionA.suggestedName, "오겹살");
assert.equal(typoSuggestionA.category, "돼지고기");
assert.equal(typoSuggestionA.cut, "삼겹");
assert.equal(typoSuggestionA.requiresConfirmation, true);
assert.equal(typoSuggestionA.reviewRange, true);
assert.ok(typoSuggestionA.confidence >= 65 && typoSuggestionA.confidence <= 80);
assert.equal(typoSuggestionA.dictionaryCode, "DICT-0001");
const typoSuggestionB = names.suggest("미벅 힘겹삼");
assert.equal(typoSuggestionB.suggestedName, "오겹살");
assert.equal(typoSuggestionB.requiresConfirmation, false);
assert.equal(typoSuggestionB.reviewRange, false);
assert.equal(names.resolve("미비 삽겨살").displayName, "오겹살");
assert.equal(names.resolve("미비 삽겨살").requiresReview, true);
assert.equal(names.resolve("컴퓨터").displayName, "컴퓨터");
assert.equal(names.suggest("컴퓨터").candidateFound, false);

assert.equal(names.suggest("황정살").suggestedName, "항정");
assert.equal(names.suggest("전지").suggestedName, "앞다리살");
assert.equal(names.suggest("부체살").suggestedName, "부채살");
assert.equal(names.suggest("채끝살").suggestedName, "채끝");
assert.equal(names.suggest("우목심").suggestedName, "우목심");
assert.equal(names.thresholds.autoSubstituteMin, 65);
assert.equal(names.thresholds.reviewMax, 80);

const stockSamples = [
  { name: "냉장 삼겹(장터)", quantity: 63.3, amount: 1253340 },
  { name: "냉장 삼겹(장터)S", quantity: 37.7, amount: 791700 }
];
const aggregatedStock = stockSamples.reduce((groups, row) => {
  const key = names.groupKey(row.name);
  const group = groups.get(key) || { quantity: 0, amount: 0 };
  group.quantity += row.quantity;
  group.amount += row.amount;
  groups.set(key, group);
  return groups;
}, new Map());
assert.equal(aggregatedStock.size, 1);
assert.equal(aggregatedStock.values().next().value.quantity, 101);
assert.equal(aggregatedStock.values().next().value.amount, 2045040);

names.configureLearnedPatterns([
  {
    source_pattern: "냉장 가브릿살(장터)",
    target_pattern: "냉장 가브리살(장터)",
    confidence: 98,
    success_count: 3,
    sample_count: 3,
    is_active: true,
    last_used_at: "2026-07-28T00:00:00.000Z"
  }
]);

assert.equal(names.canonicalize("냉장 가브릿살(장터)"), "냉장 가브리살(장터)");
assert.equal(names.canonicalize("냉장 가브릿살(장타)"), "냉장 가브리살(장터)");
assert.equal(names.canonicalize("냉동 가브릿살(장타)"), "냉동 가브리살(장타)");

names.configureLearnedPatterns([
  {
    source_pattern: "냉장 오인식품목",
    target_pattern: "냉장 표준품목",
    confidence: 70,
    success_count: 5,
    sample_count: 5,
    is_active: true
  }
]);

assert.equal(names.canonicalize("냉장 오인식품목"), "냉장 오인식품목");

names.configureLearnedPatterns([]);
const learned = names.recordLocalCorrection({
  tenantId: "test-tenant",
  sourceText: "냉장 뽈살(장터)",
  targetText: "냉장 볼살(장터)"
});
assert.equal(learned.targetPattern, "냉장 볼살(장터)");
assert.equal(names.canonicalize("냉장 뽈살(장터)"), "냉장 볼살(장터)");

names.configureLearnedPatterns([
  {
    supplier_id: "supplier-daesan",
    supplier_name: "대산축산",
    source_pattern: "통정육",
    target_pattern: "닭정육",
    category: "닭고기",
    standard_cut: "닭정육",
    storage: "미확인",
    confidence: 100,
    success_count: 2,
    sample_count: 2,
    priority: 500,
    is_active: true
  },
  {
    source_pattern: "통정육",
    target_pattern: "돼지정육",
    category: "돼지고기",
    standard_cut: "돼지정육",
    storage: "미확인",
    confidence: 99,
    success_count: 20,
    sample_count: 20,
    priority: 100,
    is_active: true
  }
]);
assert.equal(names.canonicalize("통정육", { supplierName: "대산축산" }), "닭정육");
assert.equal(names.classify("통정육", { supplierName: "대산축산" }).category, "닭고기");
assert.equal(names.classify("통정육", { supplierName: "대산축산" }).cut, "닭정육");
assert.equal(names.canonicalize("통정육"), "돼지정육");

names.configureLearnedPatterns([
  {
    supplier_id: "supplier-daesan",
    supplier_name: "대산축산",
    source_pattern: "통정육(닭)",
    target_pattern: "닭정육",
    category: "닭고기",
    standard_cut: "닭정육",
    confidence: 100,
    success_count: 1,
    sample_count: 1,
    priority: 300,
    is_active: true
  },
  {
    supplier_id: "supplier-daesan",
    supplier_name: "대산축산",
    source_pattern: "통정육(닭)",
    target_pattern: "닭정육",
    confidence: 100,
    success_count: 1,
    sample_count: 1,
    source_type: "supplier_alias",
    priority: 400,
    is_active: true
  }
]);
assert.equal(names.classify("통정육(닭)", { supplierName: "대산축산" }).category, "닭고기");
assert.equal(names.classify("통정육(닭)", { supplierName: "대산축산" }).cut, "닭정육");

names.configureLearnedPatterns([
  {
    supplier_id: "supplier-good",
    supplier_name: "좋은축산",
    source_pattern: "냉동 미후지(황금)",
    target_pattern: "냉동 미박후지",
    category: "돼지고기",
    standard_cut: "미박후지",
    storage: "냉동",
    confidence: 98,
    success_count: 2,
    sample_count: 2,
    is_active: true
  }
]);
assert.equal(
  names.canonicalize("냉동 미후지(황금)", { supplierName: "(주) 좋은축산유통" }),
  "냉동 미박 뒷다리살"
);
assert.equal(
  names.classify("냉동 미후지(황금)", { supplierName: "(주)좋은축산유통" }).cut,
  "뒷다리"
);
assert.equal(
  names.classify("넥동 미후지(황금)", { supplierName: "(주)좋은축산유통" }).displayName,
  "냉동 미박 뒷다리살"
);
assert.equal(names.canonicalize("넹장 삼겹"), "냉장 삼겹");
assert.equal(names.canonicalize("냉쟝 목살"), "냉장 목살");
assert.equal(names.canonicalize("냉돔 항정"), "냉동 항정");
assert.equal(names.classify("우목심(티스)").category, "소고기");
assert.equal(names.classify("우목심(티스)").cut, "목심");
assert.equal(
  names.classify("우목심(티스)", {
    movementDate: "2026-07-10",
    slaughterDate: "2026-07-01"
  }).storage,
  "냉장"
);
assert.equal(
  names.classify("우목심(티스)", {
    movementDate: "2026-07-20",
    slaughterDate: "2026-07-01"
  }).storage,
  "보관미상"
);
assert.equal(
  names.classify("우목심(티스)", {
    movementDate: "2026-07-20",
    slaughterDate: "2026-07-01"
  }).storageSource,
  "unknown"
);
assert.equal(
  names.classify("항정", {
    movementDate: "2026-07-10",
    expiryDate: "2026-07-12"
  }).storage,
  "냉장"
);
assert.equal(
  names.classify("항정", {
    movementDate: "2026-07-15",
    expiryDate: "2026-07-12"
  }).storage,
  "보관미상"
);
assert.equal(names.classify("등뼈").category, "돼지고기");
assert.equal(names.classify("등뼈").cut, "등뼈");
assert.equal(names.classify("냉장 등 심 덧 살").cut, "가브리살");
assert.equal(names.classify("안심", { category:"돼지고기" }).category, "돼지고기");
assert.equal(names.classify("소안심", { category:"돼지고기" }).category, "소고기");
const chilledGaburiByDocument = names.classify("가브리살", {
  category:"돼지고기",
  storage:"냉장",
  movementDate:"2026-05-27",
  expiryDate:"2026-05-24"
});
assert.equal(chilledGaburiByDocument.storage, "냉장");
assert.equal(chilledGaburiByDocument.storageSource, "document_context");
assert.equal(
  names.classify("냉장 항정", {
    movementDate: "2026-07-20",
    expiryDate: "2026-07-12",
    slaughterDate: "2026-06-01"
  }).storage,
  "냉장"
);
assert.equal(
  names.classify("냉장 항정", {
    movementDate: "2026-07-20",
    expiryDate: "2026-07-12"
  }).storageSource,
  "explicit_name"
);
assert.equal(
  names.classify("항정", {
    movementDate: "2026-07-20",
    slaughterDate: "2026-07-25"
  }).storage,
  "보관미상"
);
const unknownStoragePorkBelly = names.classify("삼겹살");
assert.equal(unknownStoragePorkBelly.storage, "보관미상");
assert.equal(unknownStoragePorkBelly.displayName, "삼겹살");
assert.notEqual(unknownStoragePorkBelly.key, names.groupKey("냉장 삼겹살"));
assert.notEqual(unknownStoragePorkBelly.key, names.groupKey("냉동 삼겹살"));
assert.equal(
  names.fingerprint("냉 동 목 살 [ 국 내 산 ]"),
  names.fingerprint("냉동 목살(국내산)")
);

names.configureLearnedPatterns([
  {
    supplier_id: "supplier-good",
    supplier_name: "좋은축산",
    source_pattern: "냉장 등심(장터)",
    target_pattern: "냉장 등심",
    category: "돼지고기",
    standard_cut: "등심",
    storage: "냉장",
    confidence: 98,
    success_count: 2,
    sample_count: 2,
    is_active: true
  }
]);
const vendorTailMatch = names.classify(
  "냉장 등심(장터) 국내산 대전충남양돈농협",
  { supplierName: "(주) 좋은축산유통" }
);
assert.equal(vendorTailMatch.category, "돼지고기");
assert.equal(vendorTailMatch.cut, "등심");
assert.equal(vendorTailMatch.learningMatch, "supplier_prefix");

names.configureLearnedPatterns([
  {
    supplier_id: "supplier-good",
    supplier_name: "좋은축산",
    source_pattern: "냉동 안심(국내산)",
    target_pattern: "냉동 안심",
    category: "돼지고기",
    standard_cut: "안심",
    storage: "냉동",
    confidence: 98,
    success_count: 2,
    sample_count: 2,
    is_active: true
  }
]);
const shortVendorTailMatch = names.classify(
  "냉동 안심(국내산) 국내산 대전충남양돈농협",
  { supplierName: "(주) 좋은축산유통", category: "돼지고기" }
);
assert.equal(shortVendorTailMatch.category, "돼지고기");
assert.equal(shortVendorTailMatch.learningMatch, "supplier_prefix");
assert.equal(
  names.classify(
    "냉동 안심(국내산) 국내산 대전충남양돈농협",
    { supplierName: "(주) 좋은축산유통", category: "소고기" }
  ).learningMatch,
  null
);
assert.equal(
  names.classify(
    "냉장 안심(국내산) 국내산 대전충남양돈농협",
    { supplierName: "(주) 좋은축산유통", category: "돼지고기" }
  ).learningMatch,
  null
);
assert.equal(
  names.canonicalize("냉장 등심덧살", { supplierName: "(주) 좋은축산유통" }),
  "냉장 가브리살"
);

names.configureLearnedPatterns([
  {
    source_pattern: "대산애매품",
    target_pattern: "정답A",
    confidence: 99,
    success_count: 5,
    sample_count: 5,
    is_active: true
  },
  {
    source_pattern: "대산애매푼",
    target_pattern: "정답B",
    confidence: 99,
    success_count: 5,
    sample_count: 5,
    is_active: true
  }
]);
assert.equal(names.canonicalize("대산애매품"), "정답A");
assert.equal(names.canonicalize("대산애매퓸"), "대산애매퓸");

const [loginHtml, stockHtml, scanHtml, recordsHtml, purchasesHtml, alertsHtml, headerJs, productNamesJs] = await Promise.all([
  readFile("login.html", "utf8"),
  readFile("stock.html", "utf8"),
  readFile("scan.html", "utf8"),
  readFile("records.html", "utf8"),
  readFile("purchases.html", "utf8"),
  readFile("alerts.html", "utf8"),
  readFile("header.js", "utf8"),
  readFile("src/data/product-name-substitution.js", "utf8")
]);
assert.match(loginHtml, /location\.replace\(next\)/);
assert.match(stockHtml, /history\.pushState\(state/);
assert.match(stockHtml, /addEventListener\("popstate"/);
assert.match(recordsHtml, /history\.pushState\(state/);
assert.match(recordsHtml, /addEventListener\("popstate"/);
assert.match(headerJs, /MEATOS_FETCH_JSON/);
assert.match(headerJs, /AbortController/);
assert.match(headerJs, /timeoutMs/);
assert.match(productNamesJs, /fetchWithTimeout/);
for (const detailHtml of [stockHtml, purchasesHtml, alertsHtml]) {
  assert.match(detailHtml, /async function getJson\(url\)/);
  assert.match(detailHtml, /setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
  assert.match(detailHtml, /__MEATOS_DETAIL_LOAD_GUARD/);
  assert.match(detailHtml, /다시 시도/);
}
assert.match(stockHtml, /const inventoryRequest = getJson\(url\)/);
assert.match(stockHtml, /PRODUCT_NAMES\.resolve\(m\.raw_product_name/);
assert.match(stockHtml, /review-range/);
assert.match(scanHtml, /PRODUCT_NAMES\.suggest\(sourceName/);
assert.match(scanHtml, /assessProductCellEvidence/);
assert.match(scanHtml, /decideProductMapping/);
assert.match(scanHtml, /nameReviewGuide/);
assert.match(scanHtml, /회색 표시 품목/);
assert.match(scanHtml, /표준 후보: " attr\(data-suggestion\)/);
assert.match(scanHtml, /OCR 원문:/);
assert.match(scanHtml, /mappingConfidence/);
assert.match(scanHtml, /ocrConfidence/);

console.log("Product-name learning substitution tests passed.");
console.log("Page-history navigation tests passed.");
console.log("Dashboard detail loading recovery tests passed.");
