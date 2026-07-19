import assert from "node:assert/strict";
import { buildTraceCellCandidates, extractTraceNumberCandidates } from "../src/data/ocr-trace-number-extractor.js";

const cases = [
  ["이력번호 : L12607026054002", "L12607026054002"],
  ["상품명 냉동 미후지 / 140028101672 / 수량 322.7", "140028101672"],
  ["금액 1,613,500 수입이력번호 IMP-24-ABC-00192837465", "IMP24ABC00192837465"],
  ["원산지 미국 LOT US-2026-0713-998877", "US20260713998877"],
  ["사업자번호 324-88-00980 거래일 2026-07-06", ""],
];

for (const [text, expected] of cases) {
  const actual = extractTraceNumberCandidates(text)[0]?.normalized ?? "";
  assert.equal(actual, expected, text);
}
assert.equal(buildTraceCellCandidates("-12607026054002", { origin: "국내산" }).includes("L12607026054002"), true);
console.log("Position-independent domestic/import trace extraction tests passed.");
