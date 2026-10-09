import assert from "node:assert/strict";
await import("../src/data/product-name-substitution.js");

const engine = globalThis.MEATOS_PRODUCT_NAMES;
assert.ok(engine, "product-name substitution engine must load");

const cases = [
  ["이겹쌀", "이겹살", "돼지고기"],
  ["갈매기쌀", "갈매기살", "돼지고기"],
  ["돈볼살", "볼살", "돼지고기"],
  ["소삼겹살", "우삼겹", "소고기"],
  ["소목심", "목심", "소고기"],
  ["우차돌", "차돌박이", "소고기"],
  ["소도가니", "도가니", "소고기"],
  ["스트립로인", "채끝", "소고기"],
  ["텐더로인", "안심", "소고기"],
  ["우등심", "등심", "소고기"],
  ["소사태", "사태", "소고기"],
  ["쇠족", "우족", "소고기"],
  ["우사골", "사골", "소고기"],
  ["소힘줄", "스지", "소고기"]
];

for (const [input, expectedCut, expectedCategory] of cases) {
  const result = engine.classify(input, { supplierName: "대표 유사어 검수" });
  assert.equal(result.cut, expectedCut, `${input} cut`);
  assert.equal(result.category, expectedCategory, `${input} category`);
  assert.ok(result.confidence >= 65, `${input} confidence should auto-substitute`);
}

const distinctCut = engine.classify("업진살", { supplierName: "대표 유사어 검수" });
assert.notEqual(distinctCut.cut, "우삼겹", "업진살 must not be merged into 우삼겹");

console.log(JSON.stringify({ passed: cases.length + 1, aliasCases: cases.length, protectedDistinctCuts: ["업진살"] }, null, 2));
