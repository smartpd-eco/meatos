import assert from "node:assert/strict";
import "../src/data/product-name-substitution.js";

const names = globalThis.MEATOS_PRODUCT_NAMES;
const supplierName = "(주)좋은축산유통";
const families = [
  {
    id: "skin_on_front",
    variants: ["미전지", "미젼지", "미전쥐", "미전디", "이전지", "미박 전지", "미밖 전지", "미 앞다리살", "미박 앞다리", "앞다리 미박"],
    expected: "미박 앞다리살",
    cut: new Set(["앞다리", "앞다리살"])
  },
  {
    id: "skin_on_rear",
    variants: ["미후지", "미 후지", "미박 후지", "미 뒷다리", "미박 뒷다리", "미밖 뒷다리", "미박 뒷다라"],
    expected: "미박 뒷다리살",
    cut: new Set(["뒷다리", "뒷다리살"])
  },
  {
    id: "skin_on_belly",
    variants: ["미 삼겹", "미박 삼겹", "미박 삼겹살", "미빅 삼겹살", "미밖 삼겹살", "미뱍 삼겹살", "미 삼겹쌀"],
    expected: "오겹살",
    cut: new Set(["삼겹"])
  }
];

const invalidFamilies = [
  { id: "blocked_neck", variants: ["미 목살", "미박 목살", "미밖 목살", "미뱍 목살"], cut: "목살" },
  { id: "blocked_loin", variants: ["미 등심", "미박 등심", "미밖 등심", "미뱍 등심"], cut: "등심" },
  { id: "blocked_rib", variants: ["미 갈비", "미박 갈비", "미밖 갈비", "미뱍 갈비"], cut: "갈비" }
];
const scenarios = [
  ...families.map((family) => ({ ...family, mode: "valid" })),
  ...invalidFamilies.map((family) => ({ ...family, mode: "blocked" }))
];

const failures = [];
const stats = Object.fromEntries(scenarios.map((family) => [family.id, { total: 0, passed: 0 }]));
for (let index = 0; index < 5000; index += 1) {
  const family = scenarios[index % scenarios.length];
  const variant = family.variants[Math.floor(index / scenarios.length) % family.variants.length];
  const storage = index % 3 === 0 ? "냉장 " : (index % 3 === 1 ? "냉동 " : "");
  const suffix = index % 5 === 0 ? " (장터)" : "";
  const input = storage + variant + suffix;
  const suggestion = names.suggest(input, { supplierName });
  const displayed = suggestion.suggestedName.replace(/^(냉장|냉동)\s+/, "");
  const passed = family.mode === "valid"
    ? suggestion.candidateFound
      && suggestion.category === "돼지고기"
      && family.cut.has(suggestion.cut)
      && suggestion.qualifiers.includes("미박")
      && displayed === family.expected
      && suggestion.confidence >= 65
    : !suggestion.qualifiers.includes("미박")
      && displayed !== `미박 ${family.cut}`
      && suggestion.requiresConfirmation
      && suggestion.classification.reviewReason === "unsupported_skin_on_cut";
  stats[family.id].total += 1;
  if (passed) stats[family.id].passed += 1;
  else if (failures.length < 30) failures.push({ input, expected: family.expected || `block 미박 ${family.cut}`, suggestion });
}

const supplierScoped = names.suggest("마후지", { supplierName });
const unscoped = names.suggest("마후지", { supplierName: "다른축산" });
assert.equal(supplierScoped.suggestedName, "미박 뒷다리살");
assert.equal(unscoped.suggestedName, "미박 뒷다리살");
assert.equal(supplierScoped.requiresConfirmation, true);
assert.equal(unscoped.requiresConfirmation, true);
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));

const total = Object.values(stats).reduce((sum, row) => sum + row.total, 0);
const passed = Object.values(stats).reduce((sum, row) => sum + row.passed, 0);
console.log(JSON.stringify({ total, passed, failed: total - passed, accuracy: passed / total * 100, stats }, null, 2));
console.log("5,000-case pork 미/미박 qualifier preservation tests passed.");
