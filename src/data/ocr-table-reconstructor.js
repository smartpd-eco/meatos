export function reconstructOcrTable({ lines = [], rawText = "" } = {}) {
  const normalizedLines = normalizeLines(lines);
  const numericRows = normalizedLines.filter((line) => /\d/.test(line.text));
  const columnHints = inferColumnHints(normalizedLines, rawText);

  return {
    rowCount: normalizedLines.length,
    columnCount: columnHints.length,
    rowBands: normalizedLines.map((line) => ({
      rowNo: line.rowNo,
      text: line.text,
      centerY: line.bounds.centerY,
      minX: line.bounds.minX,
      maxX: line.bounds.maxX,
      score: line.score
    })),
    columns: columnHints,
    cells: buildCells(normalizedLines, columnHints),
    candidateRows: numericRows,
    readingOrder: "top_to_bottom_left_to_right",
    source: "meatos-table-reconstructor"
  };
}

export function inferColumnAnchors(lines = []) {
  return inferColumnHints(normalizeLines(lines), "");
}

export const STANDARD_INVOICE_COLUMN_KEYS = [
  "species", "part", "productName", "grade", "condition", "unit", "quantity",
  "unitPrice", "supplyAmount", "taxAmount", "totalAmount", "traceOrImportNo"
];

const INVOICE_COLUMN_DEFINITIONS = [
  { key: "species", labels: ["종류", "축종", "식육종류", "축산물종류"] },
  { key: "part", labels: ["부위", "부위명", "부위명칭"] },
  { key: "productName", labels: ["상품명및등급", "상품명", "품명", "제품명", "내역"] },
  { key: "origin", labels: ["원산지", "산지"] },
  { key: "grade", labels: ["등급", "육질등급", "품질등급"] },
  { key: "condition", labels: ["상태", "보관상태", "냉장냉동", "식육포장육의종류"] },
  { key: "unit", labels: ["단위", "u/m"] },
  { key: "quantity", labels: ["수량", "중량", "qty"] },
  { key: "unitPrice", labels: ["단가", "공급단가"] },
  { key: "supplyAmount", labels: ["공급가액", "공급가"] },
  { key: "taxAmount", labels: ["세액", "부가세"] },
  { key: "totalAmount", labels: ["금액", "합계", "합계금액"] },
  { key: "traceOrImportNo", labels: ["이력번호", "수입이력번호", "수입번호", "묶음번호", "개체식별번호"] }
];

export function inferSupplierColumnLayout({ items = [], lines = [], imageWidth = 0, imageHeight = 0 } = {}) {
  const tokens = normalizePositionedItems(items, lines);
  const width = Number(imageWidth) || Math.max(0, ...tokens.map((token) => token.bounds.maxX));
  const height = Number(imageHeight) || Math.max(0, ...tokens.map((token) => token.bounds.maxY));
  if (!tokens.length || width <= 0 || height <= 0) return emptyColumnLayout(width, height);

  const matches = INVOICE_COLUMN_DEFINITIONS
    .map((definition) => findHeaderToken(tokens, definition))
    .filter(Boolean);
  if (matches.length < 3) return emptyColumnLayout(width, height, matches);

  const headerBand = selectHeaderBand(matches);
  const ordered = headerBand
    .sort((left, right) => left.centerX - right.centerX)
    .filter((match, index, entries) => index === 0 || match.centerX - entries[index - 1].centerX > Math.max(8, width * 0.008));
  if (ordered.length < 3) return emptyColumnLayout(width, height, ordered);

  const columns = ordered.map((match, index) => {
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const left = previous ? (previous.centerX + match.centerX) / 2 : Math.max(0, match.bounds.minX - Math.max(12, match.bounds.width * 0.45));
    const right = next ? (match.centerX + next.centerX) / 2 : Math.min(width, match.bounds.maxX + Math.max(12, match.bounds.width * 0.45));
    return {
      key: match.key,
      label: match.label,
      headerText: match.text,
      headerBounds: match.bounds,
      centerX: round(match.centerX),
      minX: round(left),
      maxX: round(right),
      normalized: {
        minX: ratio(left, width),
        maxX: ratio(right, width),
        centerX: ratio(match.centerX, width)
      },
      confidence: match.confidence
    };
  });
  const headerTop = Math.min(...ordered.map((match) => match.bounds.minY));
  const headerBottom = Math.max(...ordered.map((match) => match.bounds.maxY));
  const averageConfidence = Math.round(ordered.reduce((sum, match) => sum + match.confidence, 0) / ordered.length);
  const detectedKeys = new Set(ordered.map((match) => match.key));
  const missingRequiredColumns = STANDARD_INVOICE_COLUMN_KEYS.filter((key) => !detectedKeys.has(key));
  const requiredHeaderCoverage = Math.round(((STANDARD_INVOICE_COLUMN_KEYS.length - missingRequiredColumns.length) / STANDARD_INVOICE_COLUMN_KEYS.length) * 10000) / 100;

  return {
    version: 1,
    coordinateSpace: { width: round(width), height: round(height) },
    headerBand: {
      minY: round(headerTop),
      maxY: round(headerBottom),
      normalizedMinY: ratio(headerTop, height),
      normalizedMaxY: ratio(headerBottom, height)
    },
    dataRegion: {
      minY: round(Math.min(height, headerBottom + Math.max(6, (headerBottom - headerTop) * 0.25))),
      maxY: round(height),
      normalizedMinY: ratio(Math.min(height, headerBottom + Math.max(6, (headerBottom - headerTop) * 0.25)), height),
      normalizedMaxY: 1
    },
    columns,
    headerAliases: Object.fromEntries(ordered.map((match) => [match.key, match.text])),
    detectedHeaderCount: ordered.length,
    requiredHeaderCount: STANDARD_INVOICE_COLUMN_KEYS.length,
    requiredHeaderCoverage,
    missingRequiredColumns,
    reviewRequired: missingRequiredColumns.length > 0,
    confidence: averageConfidence,
    source: "header-coordinate-inference"
  };
}

export function buildTemplateCellRegions(columnLayout, rowBands = []) {
  const columns = Array.isArray(columnLayout?.columns) ? columnLayout.columns : [];
  return (Array.isArray(rowBands) ? rowBands : []).flatMap((row, rowIndex) => columns.map((column) => ({
    regionId: `row-${Number(row.rowNo ?? rowIndex + 1)}-${column.key}`,
    rowNo: Number(row.rowNo ?? rowIndex + 1),
    columnKey: column.key,
    bounds: {
      minX: Number(column.minX ?? 0),
      maxX: Number(column.maxX ?? 0),
      minY: Number(row.minY ?? row.bounds?.minY ?? 0),
      maxY: Number(row.maxY ?? row.bounds?.maxY ?? 0)
    },
    source: "supplier-template"
  })));
}

function normalizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => ({
    rowNo: Number(line?.rowNo ?? index + 1),
    text: String(line?.text ?? "").trim(),
    score: Number(line?.score ?? 0),
    bounds: {
      minX: Number(line?.bounds?.minX ?? 0),
      maxX: Number(line?.bounds?.maxX ?? 0),
      minY: Number(line?.bounds?.minY ?? 0),
      maxY: Number(line?.bounds?.maxY ?? 0),
      centerY: Number(line?.bounds?.centerY ?? 0)
    }
  })).filter((line) => Boolean(line.text));
}

function inferColumnHints(lines = [], rawText = "") {
  const headers = [
    { key: "species", labels: ["종류", "축종", "식육종류"] },
    { key: "part", labels: ["부위", "부위명", "부위명칭"] },
    { key: "productName", labels: ["상품명", "품명", "제품명", "내역"] },
    { key: "specification", labels: ["규격", "사양", "포장"] },
    { key: "grade", labels: ["등급", "육질등급"] },
    { key: "condition", labels: ["상태", "보관상태", "냉장냉동"] },
    { key: "quantity", labels: ["수량", "중량", "Qty"] },
    { key: "unit", labels: ["단위", "U/M", "EA"] },
    { key: "unitPrice", labels: ["단가", "공급단가"] },
    { key: "supplyAmount", labels: ["공급가액", "공급가"] },
    { key: "taxAmount", labels: ["세액", "부가세"] },
    { key: "totalAmount", labels: ["금액", "합계", "합계금액"] },
    { key: "traceOrImportNo", labels: ["이력번호", "수입이력번호", "수입번호", "묶음번호"] }
  ];
  const joined = [rawText, ...lines.map((line) => line.text)].join("\n");

  return headers.map((column, index) => ({
    index: index + 1,
    key: column.key,
    labels: column.labels,
    anchor: findAnchorMatch(joined, column.labels),
    confidence: findAnchorMatch(joined, column.labels) ? 92 : 48
  }));
}

function buildCells(lines = [], columns = []) {
  return lines.map((line) => {
    const tokens = line.text.split(/\s+/).filter(Boolean);
    const numericTokens = tokens.filter((token) => /^\d[\d,]*(?:\.\d+)?$/.test(token));
    return {
      rowNo: line.rowNo,
      tokens,
      numericTokens,
      columnMatches: columns.map((column) => ({
        columnKey: column.key,
        anchor: column.anchor,
        confidence: column.confidence
      }))
    };
  });
}

function findAnchorMatch(text, labels = []) {
  const compact = String(text ?? "").replace(/\s+/g, "");
  for (const label of labels) {
    const compactLabel = String(label ?? "").replace(/\s+/g, "");
    if (compact.includes(compactLabel)) {
      return compactLabel;
    }
  }
  return "";
}

function normalizePositionedItems(items = [], lines = []) {
  const source = Array.isArray(items) && items.length ? items : lines;
  return (Array.isArray(source) ? source : []).map((item) => {
    const bounds = normalizeBounds(item?.bounds ?? {});
    return {
      text: String(item?.text ?? "").trim(),
      compactText: compact(item?.text),
      confidence: Math.max(0, Math.min(100, Number(item?.score ?? item?.confidence ?? 0))),
      bounds,
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerY: (bounds.minY + bounds.maxY) / 2
    };
  }).filter((item) => item.text && item.bounds.width > 0 && item.bounds.height > 0);
}

function findHeaderToken(tokens, definition) {
  const candidates = tokens.flatMap((token) => definition.labels.map((label) => {
    const compactLabel = compact(label);
    const exact = token.compactText === compactLabel;
    const contained = token.compactText.includes(compactLabel) || compactLabel.includes(token.compactText);
    if (!exact && (!contained || Math.min(token.compactText.length, compactLabel.length) < 2)) return null;
    return {
      key: definition.key,
      label: compactLabel,
      text: token.text,
      bounds: token.bounds,
      centerX: token.centerX,
      centerY: token.centerY,
      confidence: Math.round(Math.min(100, token.confidence + (exact ? 8 : 0)))
    };
  }).filter(Boolean));
  return candidates.sort((left, right) => right.confidence - left.confidence)[0] ?? null;
}

function selectHeaderBand(matches) {
  const tolerance = Math.max(18, median(matches.map((match) => match.bounds.height)) * 1.25);
  const bands = [];
  for (const match of matches) {
    const band = bands.find((entry) => Math.abs(entry.centerY - match.centerY) <= tolerance);
    if (band) {
      band.items.push(match);
      band.centerY = band.items.reduce((sum, item) => sum + item.centerY, 0) / band.items.length;
    } else {
      bands.push({ centerY: match.centerY, items: [match] });
    }
  }
  return bands.sort((left, right) => right.items.length - left.items.length || left.centerY - right.centerY)[0]?.items ?? [];
}

function emptyColumnLayout(width, height, matches = []) {
  return {
    version: 1,
    coordinateSpace: { width: round(width), height: round(height) },
    headerBand: null,
    dataRegion: null,
    columns: [],
    headerAliases: Object.fromEntries(matches.map((match) => [match.key, match.text])),
    detectedHeaderCount: matches.length,
    requiredHeaderCount: STANDARD_INVOICE_COLUMN_KEYS.length,
    requiredHeaderCoverage: 0,
    missingRequiredColumns: [...STANDARD_INVOICE_COLUMN_KEYS],
    reviewRequired: true,
    confidence: 0,
    source: "header-coordinate-inference"
  };
}

function normalizeBounds(bounds) {
  const minX = Number(bounds.minX ?? 0);
  const minY = Number(bounds.minY ?? 0);
  const maxX = Number(bounds.maxX ?? minX);
  const maxY = Number(bounds.maxY ?? minY);
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function compact(value) {
  return String(value ?? "").replace(/[\s·ㆍ:：()\[\]{}]/g, "").toLowerCase();
}

function ratio(value, total) {
  return total > 0 ? Number((value / total).toFixed(6)) : 0;
}

function round(value) {
  return Number(Number(value ?? 0).toFixed(2));
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
