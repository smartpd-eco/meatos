import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("outputs/ocr-benchmark");
const easy = JSON.parse(await readFile(path.join(outputDir, "easyocr-products.json"), "utf8"));
const tesseract = JSON.parse(await readFile(path.join(outputDir, "tesseract-numeric.json"), "utf8"));
const table = JSON.parse(await readFile(path.join(outputDir, "table-header-coverage.json"), "utf8"));

const report = {
  generatedAt: new Date().toISOString(),
  basis: {
    webAssets: "Research-only. No copyrighted web image was copied into the training corpus.",
    syntheticDocuments: 24,
    approvedRealDocuments: 1,
    layoutFamilies: ["standard-grid", "carbon-copy", "compact-erp", "traceability-ledger"]
  },
  before: {
    requiredHeaderCoverage: 58.33,
    missingHeaderDefinitions: ["species", "part", "grade", "condition", "traceOrImportNo"],
    productCharacterAccuracy: easy.productCharacterAccuracy,
    legibleNumericTraceExactMatchRate: tesseract.legibleNumericTraceExactMatchRate,
    damagedNumericTraceExactMatchRate: tesseract.numericTraceExactMatchRate
  },
  after: {
    standardHeaderCoverage: table.standard.requiredHeaderCoverage,
    commonAliasHeaderCoverage: table.commonAliases.requiredHeaderCoverage,
    legacyLayoutCoverage: table.legacyExternalLayout.requiredHeaderCoverage,
    combinedHeaderCoverage: table.combinedProductGradeHeader.requiredHeaderCoverage,
    incompleteLayoutPolicy: "REVIEW_REQUIRED",
    damagedTotalsPolicy: "WITHHOLD_TOTALS_AND_WARN",
    taxPolicy: "DEFAULT_EXEMPT_UNLESS_EXPLICIT_TAXABLE; MANUFACTURING_SIGNAL_REQUIRES_REVIEW"
  },
  unresolved: [
    `EasyOCR raw product character accuracy remains ${easy.productCharacterAccuracy}%; 황금 was repeatedly read as 항금.`,
    `Damaged numeric/trace exact match remains ${tesseract.numericTraceExactMatchRate}%; unreadable values are not guessed.`,
    "PaddleOCR browser batch and PP-StructureV3 runtime measurements are still pending.",
    "Additional importer/cattle/pork real invoices are not present in the workspace."
  ]
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "research-layout-analysis.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const markdown = `# MEATOS OCR 조사 양식 분석 결과

## 시험 기반

- 조사 웹 자료는 양식 특성 연구에만 사용
- MEATOS 소유 합성 문서 24건
- 사용자 제공 승인 실문서 1건

## 수정 전

- 필수 헤더 커버리지: 58.33%
- 누락 정의: 종류, 부위, 등급, 상태, 이력번호/수입번호
- 상품명 문자 정확도: ${easy.productCharacterAccuracy}%
- 판독 가능 숫자·이력번호: ${tesseract.legibleNumericTraceExactMatchRate}%
- 훼손 포함 숫자·이력번호: ${tesseract.numericTraceExactMatchRate}%

## 수정 후

- MEATOS 표준 헤더: ${table.standard.requiredHeaderCoverage}%
- 일반 축약·동의어 헤더: ${table.commonAliases.requiredHeaderCoverage}%
- 구형 외부 양식: ${table.legacyExternalLayout.requiredHeaderCoverage}% → Review
- 상품명·등급 결합 헤더: ${table.combinedProductGradeHeader.requiredHeaderCoverage}% → Review
- 훼손 문서: 총액 공란 및 재촬영·직접 확인 경고
- 과세 정책: 명시 과세 우선, 미표기 기본 면세, 제조·첨가 신호 Review

## 남은 문제

${report.unresolved.map((item) => `- ${item}`).join("\n")}
`;
await writeFile(path.join(outputDir, "research-layout-analysis.md"), markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
