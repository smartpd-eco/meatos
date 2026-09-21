const STORAGE_PATTERN = /^(냉장|냉동)(?=\s|$)/;
const ORIGIN_PATTERN = /(?:국내산|국내|미국산|수입산|수입|호주산|캐나다산|브라질산|덴마크산|스페인산|칠레산|네덜란드산|멕시코산)/;
const COLUMN_HEADER_PATTERN = /(?:^|\s)(?:원산지|수량|중량|단가|공급가액|합계금액|이력번호|거래일자|사업자번호|연락처)(?=\s|$|\()/;
const NUMBER_ONLY_PATTERN = /^[\s\d,.+\-/원박스BOXkgKG]+$/;
const UNIT_ONLY_PATTERN = /^\d*(?:\s*)(?:box|kg|박스|팩|개)$/i;

export function composeRawProductName(rawProductName, condition) {
  const raw = clean(rawProductName);
  const storage = normalizeStorage(condition);
  if (!raw || !storage || STORAGE_PATTERN.test(raw)) return raw;
  return `${storage} ${raw}`;
}

export function assessProductCellEvidence(lineItem = {}) {
  const providerRawProductName = clean(lineItem.rawProductName);
  const rawProductName = composeRawProductName(providerRawProductName, lineItem.condition);
  const issues = [];

  if (!providerRawProductName) issues.push("PRODUCT_NAME_EMPTY");
  if (COLUMN_HEADER_PATTERN.test(providerRawProductName)) issues.push("PRODUCT_COLUMN_HEADER_CONTAMINATION");
  if (providerRawProductName && NUMBER_ONLY_PATTERN.test(providerRawProductName)) issues.push("PRODUCT_COLUMN_NUMERIC_SHIFT");
  if (UNIT_ONLY_PATTERN.test(providerRawProductName)) issues.push("PRODUCT_COLUMN_UNIT_SHIFT");
  if (ORIGIN_PATTERN.test(providerRawProductName) && clean(lineItem.origin)) {
    issues.push("PRODUCT_COLUMN_ORIGIN_SHIFT");
  }

  return {
    providerRawProductName,
    rawProductName,
    storage: normalizeStorage(lineItem.condition) || storageFromName(providerRawProductName),
    issues: [...new Set(issues)],
    reviewRequired: issues.length > 0
  };
}

export function decideProductMapping(suggestion = {}, evidence = {}) {
  const confidence = normalizeConfidence(suggestion.confidence);
  const hasCandidate = Boolean(suggestion.candidateFound);
  const requiresConfirmation = Boolean(
    suggestion.requiresConfirmation
    || suggestion.reviewRange
    || suggestion.highRiskReview
    || evidence.reviewRequired
    || (Array.isArray(evidence.issues) && evidence.issues.length)
  );

  if (!hasCandidate) return { status: "UNRESOLVED", confidence, requiresConfirmation: true };
  if (!requiresConfirmation && confidence >= 0.9) {
    return { status: "AUTO_APPROVED", confidence, requiresConfirmation: false };
  }
  if (confidence >= 0.75) return { status: "SUGGESTED", confidence, requiresConfirmation: true };
  return { status: "UNRESOLVED", confidence, requiresConfirmation: true };
}

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(1, numeric > 1 ? numeric / 100 : numeric);
}

function normalizeStorage(value) {
  const text = clean(value);
  if (/냉동/.test(text)) return "냉동";
  if (/냉장/.test(text)) return "냉장";
  return "";
}

function storageFromName(value) {
  return clean(value).match(STORAGE_PATTERN)?.[1] || "";
}

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
