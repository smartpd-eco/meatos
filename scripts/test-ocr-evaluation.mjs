const normalize = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();

function levenshtein(left, right) {
  const a = [...normalize(left)];
  const b = [...normalize(right)];
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[a.length][b.length];
}

function characterErrorRate(expected, actual) {
  const normalizedExpected = normalize(expected);
  return normalizedExpected.length ? levenshtein(expected, actual) / [...normalizedExpected].length : 0;
}

const checks = [
  [characterErrorRate("냉장 등심(장터)", "냉장등심(장터)"), 0],
  [characterErrorRate("미후지", "미후지"), 0],
  [characterErrorRate("등뼈", "등빼") > 0, true],
];

for (const [actual, expected] of checks) {
  if (actual !== expected) throw new Error(`OCR metric self-test failed: ${actual} !== ${expected}`);
}
console.log("OCR evaluation metric self-test passed.");
