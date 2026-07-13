const TRACE_CONTEXT = /(?:이력번호|개체식별번호|수입이력번호|수입축산물|묶음번호|trace|lot)/i;
const EXCLUDED_DATE = /^(?:19|20)\d{6}$/;
const EXCLUDED_BUSINESS_NO = /^\d{10}$/;

export function extractTraceNumberCandidates(input = "") {
  const text = String(input ?? "").normalize("NFKC");
  const compactMatches = [...text.matchAll(/(?:L\s*)?\d(?:[\s-]*\d){11,14}/gi)];
  const alphanumericMatches = [...text.matchAll(/[A-Z]{1,4}[\s-]*\d(?:[A-Z0-9\s-]*\d){8,18}/gi)];
  const candidates = [...compactMatches, ...alphanumericMatches]
    .map((match) => buildCandidate(text, match))
    .filter((candidate) => candidate.normalized)
    .filter((candidate) => !isExcluded(candidate.normalized));

  return [...new Map(candidates
    .sort((left, right) => right.confidence - left.confidence || left.offset - right.offset)
    .map((candidate) => [candidate.normalized, candidate])).values()];
}

export function isValidTraceNumber(value = "") {
  const normalized = normalizeTraceNumber(value);
  return /^(?:L\d{12,15}|\d{12,15}|[A-Z]{1,4}[A-Z0-9]{9,22})$/.test(normalized)
    && !isExcluded(normalized);
}

export function normalizeTraceNumber(value = "") {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildTraceCellCandidates(value = "", context = {}) {
  const normalized = normalizeTraceNumber(value);
  const digits = normalized.replace(/\D/g, "");
  const extracted = extractTraceNumberCandidates(value);
  const candidates = new Set(extracted.map((candidate) => candidate.normalized));
  const standaloneDigits = [...String(value ?? "").matchAll(/(?<!\d)\d{12,15}(?!\d)/g)].map((match) => match[0]);
  for (const candidateDigits of standaloneDigits) candidates.add(candidateDigits);
  if (context.domestic === true || context.origin === "국내산") {
    for (const candidate of extracted) {
      const candidateDigits = candidate.normalized.replace(/\D/g, "");
      if (candidateDigits.length === 14) candidates.add(`L${candidateDigits}`);
    }
    for (const candidateDigits of standaloneDigits) {
      if (candidateDigits.length === 14) candidates.add(`L${candidateDigits}`);
    }
  }
  if (digits.length >= 12 && digits.length <= 15) candidates.add(digits);
  if (digits.length === 14 && (context.domestic === true || context.origin === "국내산")) {
    candidates.add(`L${digits}`);
  }
  return [...candidates].filter(isValidTraceNumber);
}

function buildCandidate(text, match) {
  const normalized = normalizeTraceNumber(match[0]);
  const start = Number(match.index ?? 0);
  const context = text.slice(Math.max(0, start - 28), Math.min(text.length, start + match[0].length + 28));
  const valid = isCandidateShape(normalized);
  const contextMatched = TRACE_CONTEXT.test(context);
  const confidence = Math.min(100,
    (valid ? 70 : 30)
      + (contextMatched ? 20 : 0)
      + (/^L\d{12,15}$/.test(normalized) ? 8 : 0)
      + (/^[A-Z]/.test(normalized) ? 2 : 0));
  return {
    raw: match[0],
    normalized: valid ? normalized : "",
    type: /^L\d/.test(normalized) ? "DOMESTIC_LIVESTOCK" : /^[A-Z]/.test(normalized) ? "IMPORT_OR_LOT" : "NUMERIC_TRACE",
    confidence,
    contextMatched,
    context: context.trim(),
    offset: start,
  };
}

function isCandidateShape(value) {
  return /^(?:L\d{12,15}|\d{12,15}|[A-Z]{1,4}[A-Z0-9]{9,22})$/.test(value);
}

function isExcluded(value) {
  const digits = value.replace(/\D/g, "");
  return EXCLUDED_DATE.test(digits) || EXCLUDED_BUSINESS_NO.test(digits);
}
