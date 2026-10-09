import assert from "node:assert/strict";

await import("../src/data/product-name-substitution.js");
const names = globalThis.MEATOS_PRODUCT_NAMES;

const FAMILIES = [
  {
    id: "pork_gaburi",
    variants: [
      "가브리살", "가브리", "등심덧살", "가브릿살", "가브리쌀", "가브리삽",
      "가브리샬", "가브라살", "가부리살", "가부리", "가비리살", "까브리살"
    ],
    category: "돼지고기",
    cut: "가브리살",
    qualifier: "",
    dictionaryCode: "DICT-PORK-GABURI",
    context: { category: "돼지고기" }
  },
  {
    id: "beef_rib",
    variants: ["갈비", "갈비살", "갈빗살", "갈비쌀", "갈삐", "소갈비", "우갈비", "한우갈비"],
    category: "소고기",
    cut: "갈비",
    qualifier: "",
    dictionaryCode: "DICT-0003",
    context: { category: "소고기" }
  },
  {
    id: "pork_rib",
    variants: ["돼지갈비", "돼지갈비살", "돈갈비", "돈갈비살"],
    category: "돼지고기",
    cut: "갈비",
    qualifier: "",
    dictionaryCode: "DICT-PORK-RIB",
    context: { category: "돼지고기" }
  },
  {
    id: "pork_back_rib",
    variants: ["등갈비", "등갈비살", "등갈삐", "로인립"],
    category: "돼지고기",
    cut: "등갈비",
    qualifier: "",
    dictionaryCode: "DICT-PORK-BACK-RIB",
    context: { category: "돼지고기" }
  },
  {
    id: "pork_side_rib",
    variants: ["쪽갈비", "쪽갈비살", "쪽갈삐", "스페어립"],
    category: "돼지고기",
    cut: "쪽갈비",
    qualifier: "",
    dictionaryCode: "DICT-PORK-SIDE-RIB",
    context: { category: "돼지고기" }
  },
  {
    id: "pork_belly_skin_on",
    variants: [
      "미박 삼겹", "미박 삼겹살", "미박삼겹", "미삼겹", "미빅피 삼겹살",
      "미박피 삼겹살", "미밖피 삼겹살", "미뱍피 삼겹살", "미밖 삼겹",
      "미백 삼겹", "미뱍 삼겹쌀"
    ],
    category: "돼지고기",
    cut: "삼겹",
    qualifier: "미박",
    dictionaryCode: "DICT-0001",
    context: { category: "돼지고기" }
  },
  {
    id: "pork_belly_skinless",
    variants: [
      "박피 삼겹", "박피 삼겹살", "박피삼겹", "박펴 삼겹살",
      "박파 삼겹살", "박비 삼겹살", "빅피 삼겹살", "밖피 삼겹살"
    ],
    category: "돼지고기",
    cut: "삼겹",
    qualifier: "",
    dictionaryCode: "DICT-PORK-BELLY-SKINLESS",
    context: { category: "돼지고기" }
  }
];

const STORAGE = [
  { input: "냉장", expected: "냉장" },
  { input: "냉동", expected: "냉동" },
  { input: "넥장", expected: "냉장" },
  { input: "넹동", expected: "냉동" }
];
const results = [];
for (let index = 0; index < 10000; index += 1) {
  const family = FAMILIES[index % FAMILIES.length];
  const variant = family.variants[Math.floor(index / FAMILIES.length) % family.variants.length];
  const storage = STORAGE[Math.floor(index / 7) % STORAGE.length];
  const format = Math.floor(index / 11) % 5;
  const input = formatInput(storage.input, variant, format, index);
  const actual = names.classify(input, family.context);
  const correct = actual.category === family.category
    && actual.cut === family.cut
    && actual.storage === storage.expected
    && actual.dictionaryCode === family.dictionaryCode
    && !actual.requiresReview
    && (
      family.qualifier
        ? actual.qualifiers.includes(family.qualifier)
        : !actual.qualifiers.includes("미박") && !actual.qualifiers.includes("박피")
    );
  results.push({
    family: family.id,
    input,
    expected: {
      category: family.category,
      cut: family.cut,
      qualifier: family.qualifier,
      dictionaryCode: family.dictionaryCode
    },
    actual: {
      category: actual.category,
      cut: actual.cut,
      qualifiers: actual.qualifiers,
      dictionaryCode: actual.dictionaryCode,
      requiresReview: Boolean(actual.requiresReview)
    },
    correct
  });
}

const AMBIGUOUS = [
  "가비", "가리", "갈브", "가블", "가르비", "갈브리",
  "미피 삼겹", "박미 삼겹", "미불피 삼겹", "피박 삼겹"
];
const safetyResults = [];
for (let index = 0; index < 500; index += 1) {
  const input = `${STORAGE[index % STORAGE.length].input} ${AMBIGUOUS[index % AMBIGUOUS.length]}(위험쌍${index})`;
  const suggestion = names.suggest(input);
  safetyResults.push({
    input,
    safe: !suggestion.candidateFound || suggestion.requiresConfirmation,
    suggestedName: suggestion.suggestedName,
    requiresConfirmation: suggestion.requiresConfirmation
  });
}

const correct = results.filter((row) => row.correct).length;
const incorrect = results.length - correct;
const exactAccuracy = Number((correct / results.length * 100).toFixed(2));
const unsafeAmbiguous = safetyResults.filter((row) => !row.safe).length;
const familyStats = Object.fromEntries(FAMILIES.map((family) => {
  const rows = results.filter((row) => row.family === family.id);
  const passed = rows.filter((row) => row.correct).length;
  return [family.id, {
    total: rows.length,
    correct: passed,
    accuracy: Number((passed / rows.length * 100).toFixed(2))
  }];
}));

console.log(JSON.stringify({
  targeted: {
    total: results.length,
    correct,
    incorrect,
    exactAccuracy
  },
  ambiguousSafety: {
    total: safetyResults.length,
    safe: safetyResults.length - unsafeAmbiguous,
    unsafe: unsafeAmbiguous,
    safetyRate: Number(((safetyResults.length - unsafeAmbiguous) / safetyResults.length * 100).toFixed(2))
  },
  familyStats,
  failureSamples: results.filter((row) => !row.correct).slice(0, 30),
  unsafeSamples: safetyResults.filter((row) => !row.safe).slice(0, 20)
}, null, 2));

assert.ok(exactAccuracy >= 99, `Expected >=99% exact risk-pair accuracy, received ${exactAccuracy}%`);
assert.equal(unsafeAmbiguous, 0, "Ambiguous risk-pair inputs must require confirmation.");
assert.notEqual(names.groupKey("미박 삼겹"), names.groupKey("박피 삼겹"));
assert.equal(names.groupKey("박피 삼겹"), names.groupKey("삼겹살"));
assert.notEqual(names.groupKey("가브리살"), names.groupKey("갈비"));
console.log("10,000-case product risk-pair accuracy tests passed.");

function formatInput(storage, variant, format, index) {
  if (format === 0) return `${storage} ${variant}`;
  if (format === 1) return `${storage} ${variant}(장터) 국내산`;
  if (format === 2) return `${storage} ${variant} S`;
  if (format === 3) return `${storage} ${[...variant].join(" ")}(테스트${index})`;
  return `${storage} ${variant} [국내산]`;
}
