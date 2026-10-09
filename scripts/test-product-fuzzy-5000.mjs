import assert from "node:assert/strict";

await import("../src/data/product-name-substitution.js");

const names = globalThis.MEATOS_PRODUCT_NAMES;
const STORAGE_VARIANTS = [
  ["냉장", "냉장"],
  ["넥장", "냉장"],
  ["냉쟝", "냉장"],
  ["냉동", "냉동"],
  ["넹동", "냉동"]
];

// 실제 현장에서 발생할 수 있는 한 글자 오타, OCR 유사 글자, 띄어쓰기,
// 보관상태 오인식을 조합한다. 축종/부위 정보가 남아 있는 4,800건은
// 표준 품목으로 자동 치환되어야 한다.
const CORRECTABLE_CASES = [
  { input: "삼겸살", standard: "삼겹살" },
  { input: "삽겹살", standard: "삼겹살" },
  { input: "삼겹쌀", standard: "삼겹살" },
  { input: "삼겹삽", standard: "삼겹살" },
  { input: "가브릿살", standard: "가브리살" },
  { input: "가브라살", standard: "가브리살" },
  { input: "가브리살살", standard: "가브리살" },
  { input: "갈메기살", standard: "갈매기살" },
  { input: "갈매기삽", standard: "갈매기살" },
  { input: "압다리살", standard: "앞다리살" },
  { input: "앞다라살", standard: "앞다리살" },
  { input: "앞다리삭", standard: "앞다리살" },
  { input: "뒷다라살", standard: "뒷다리살" },
  { input: "뒷다리삭", standard: "뒷다리살" },
  { input: "우삼겸", standard: "우삼겹" },
  { input: "우삼겹살", standard: "우삼겹" },
  { input: "우목싱", standard: "우목심" },
  { input: "우목살", standard: "우목심" },
  { input: "차돌박히", standard: "차돌박이" },
  { input: "차돌바기", standard: "차돌박이" },
  { input: "부쳬살", standard: "부채살" },
  { input: "부채삭", standard: "부채살" },
  { input: "닭가슴설", standard: "닭가슴살" },
  { input: "닭다리삭", standard: "닭다리살" },
  { input: "계육 가슴설", standard: "계육가슴살" },
  { input: "계육 다리삭", standard: "계육다리살" },
  { input: "미빅피 삼겹살", standard: "미박 삼겹살" },
  { input: "미박피 삼겹살", standard: "미박 삼겹살" },
  { input: "미밖 삼겹살", standard: "미박 삼겹살" },
  { input: "미뱍 삼겹쌀", standard: "미박 삼겹살" }
];

// 축종을 뜻하는 핵심 글자가 사라졌거나 다른 정상 품목과 충돌하는 경우다.
// 이 200건은 억지로 자동 합산하지 않고 검토 대기 키로 분리되어야 한다.
const AMBIGUOUS_CASES = [
  "가겹살",
  "사삼겹",
  "다목심",
  "나다리살",
  "차다리살",
  "닭다슴살",
  "미불피 삼겹살",
  "미가피 삼겹살"
];

const results = [];
for (let index = 0; index < 4800; index += 1) {
  const testCase = CORRECTABLE_CASES[index % CORRECTABLE_CASES.length];
  const reference = names.classify(testCase.standard);
  const storage = STORAGE_VARIANTS[index % STORAGE_VARIANTS.length];
  const typed = index % 7 === 0 ? [...testCase.input].join(" ") : testCase.input;
  const input = `${storage[0]} ${typed}(예제${index}) 국내산`;
  const actual = names.resolve(input);
  const correct = actual.category === reference.category
    && actual.cut === reference.cut
    && actual.qualifiers.join("|") === reference.qualifiers.join("|")
    && actual.storage === storage[1]
    && (!actual.requiresReview || actual.confidence >= names.thresholds.autoSubstituteMin);
  results.push(makeResult(input, reference, actual, correct, false));
}

for (let index = 0; index < 200; index += 1) {
  const inputName = AMBIGUOUS_CASES[index % AMBIGUOUS_CASES.length];
  const storage = STORAGE_VARIANTS[index % STORAGE_VARIANTS.length];
  const input = `${storage[0]} ${inputName}(위험예제${index}) 국내산`;
  const actual = names.classify(input);
  const safeReview = Boolean(actual.requiresReview)
    && actual.storage === storage[1]
    && actual.key.includes("검토필요");
  results.push(makeResult(input, null, actual, false, safeReview));
}

const autoCorrect = results.filter((row) => row.correct).length;
const safeReview = results.filter((row) => row.safeReview).length;
const wrong = results.filter((row) => row.wrong).length;
const autoRate = Number((autoCorrect / results.length * 100).toFixed(1));
const qualityRate = Number(((autoCorrect + safeReview) / results.length * 100).toFixed(1));

console.log(JSON.stringify({
  total: results.length,
  correctableCases: 4800,
  ambiguousSafetyCases: 200,
  autoCorrect,
  safeReview,
  wrong,
  autoRate,
  qualityRate,
  samples: results.slice(0, 12),
  safeReviewSamples: results.filter((row) => row.safeReview).slice(0, 12),
  wrongSamples: results.filter((row) => row.wrong).slice(0, 20)
}, null, 2));

assert.equal(results.length, 5000);
assert.equal(wrong, 0, JSON.stringify(results.filter((row) => row.wrong).slice(0, 20), null, 2));
assert.equal(autoCorrect, 4800);
assert.equal(safeReview, 200);
assert.ok(autoRate >= 96, `Expected at least 96% automatic correction, received ${autoRate}%`);
assert.equal(qualityRate, 100);
assert.equal(names.classify("컴퓨터").category, "기타");
assert.equal(names.classify("미빅피 삼겹살").displayName, "오겹살");
assert.equal(names.classify("박피 삼겹살").displayName, "삼겹살");

console.log("5,000-case fuzzy product classification tests passed.");

function makeResult(input, reference, actual, correct, safeReview) {
  return {
    input,
    expectedCategory: reference?.category || "검토 필요",
    expectedCut: reference?.cut || "검토 필요",
    actualCategory: actual.category,
    actualCut: actual.cut,
    actualKey: actual.key,
    correct,
    safeReview,
    wrong: !correct && !safeReview
  };
}
