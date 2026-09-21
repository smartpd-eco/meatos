// CLOVA OCR (NAVER Cloud, General 도메인 · 표 추출) 읽기 계층.
// - Secret은 환경변수(CLOVA_SECRET)로만 읽는다. 코드/로그에 하드코딩 금지.
// - 표(table) 셀을 우선 사용해 행/열을 결정적으로 조립한다(LLM 미사용).
// - 표가 없거나 실패하면 빈 결과를 반환 → 호출부가 Gemini로 폴백한다.

declare const Deno: {
  env: { get(key: string): string | undefined };
};

const CLOVA_INVOKE_URL = Deno.env.get("CLOVA_INVOKE_URL")
  ?? "https://oc62ykkz3a.apigw.ntruss.com/custom/v1/55641/3f0e7b3d8decf360b1d73c6d897cfe7601516ed1c6d1309a486884ecb9484cf7/general";

export function clovaConfigured(): boolean {
  return Boolean(Deno.env.get("CLOVA_SECRET")) && Boolean(CLOVA_INVOKE_URL);
}

type ClovaVertex = { x?: number; y?: number };
type ClovaField = {
  inferText?: string;
  inferConfidence?: number;
  boundingPoly?: { vertices?: ClovaVertex[] };
};
type ClovaCell = {
  rowIndex?: number;
  columnIndex?: number;
  cellTextLines?: { cellWords?: { inferText?: string }[] }[];
};
type ClovaImage = {
  inferResult?: string;
  fields?: ClovaField[];
  tables?: { cells?: ClovaCell[] }[];
  convertedImageInfo?: { width?: number; height?: number };
};

function num(text: unknown): number | null {
  const cleaned = String(text ?? "").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function cellText(cell: ClovaCell): string {
  return (cell.cellTextLines ?? [])
    .map((line) => (line.cellWords ?? []).map((word) => String(word.inferText ?? "")).join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// 헤더 텍스트로 컬럼 인덱스 → 필드 역할 매핑
function classifyColumn(headerText: string): string | null {
  const t = headerText.replace(/\s+/g, "");
  if (/^no$|번호|순번/i.test(t)) return "rowNo";
  if (/상품명|품명|품목|등급/.test(t)) return "rawProductName";
  if (/원산지/.test(t)) return "origin";
  if (/단위|규격/.test(t)) return "unit";
  if (/중량|수량|kg/i.test(t)) return "quantity";
  if (/단가/.test(t)) return "unitPrice";
  if (/공급가|금액|공급/.test(t)) return "supplyAmount";
  if (/이력|이력번호|이력\/수입|수입/.test(t)) return "traceOrImportNo";
  return null;
}

// 거래명세표 하단 요약/합계 행 여부(품목이 아님)
function isSummaryRowName(raw: string): boolean {
  const name = String(raw || "").replace(/[\s.·]/g, "");
  if (!name) return false;
  if (/^(합계|소계|총계|중계|조정액|전일잔액|당일잔액|공급가액|세액|부가세|합계금액|금일입금|전일입금|금일잔액|미수금|받을금액|인수자|공급받는자|비고)$/.test(name)) return true;
  if (/^(합계|소계|총계|공급가액|합계금액|조정액|전일잔액|금일)/.test(name) && !/(고기|살|육|갈비|삼겹|목살|항정|등심|안심|사태|양지|정육|돈|우|닭|오리)/.test(name)) return true;
  return false;
}
function buildLineItemsFromTable(table: { cells?: ClovaCell[] }): {
  lineItems: Record<string, unknown>[];
  confidences: number[];
} {
  const cells = (table.cells ?? []).filter((c) => Number.isFinite(c.rowIndex) && Number.isFinite(c.columnIndex));
  if (!cells.length) return { lineItems: [], confidences: [] };

  // 0행을 헤더로 보고 컬럼 역할을 정한다.
  const headerCells = cells.filter((c) => c.rowIndex === 0);
  const columnRole: Record<number, string> = {};
  headerCells.forEach((c) => {
    const role = classifyColumn(cellText(c));
    if (role) columnRole[Number(c.columnIndex)] = role;
  });

  // 헤더 매핑이 비면 표를 신뢰할 수 없으므로 포기(폴백 유도).
  if (!Object.values(columnRole).includes("rawProductName")) return { lineItems: [], confidences: [] };

  const byRow = new Map<number, Record<string, unknown>>();
  const confidences: number[] = [];
  cells.forEach((c) => {
    const r = Number(c.rowIndex);
    if (r === 0) return; // header
    const role = columnRole[Number(c.columnIndex)];
    if (!role) return;
    const text = cellText(c);
    if (!byRow.has(r)) byRow.set(r, { rowNo: r });
    const row = byRow.get(r)!;
    if (role === "rawProductName" || role === "origin" || role === "unit" || role === "traceOrImportNo") {
      row[role] = text;
    } else if (role === "rowNo") {
      const n = num(text);
      if (n != null) row.rowNo = n;
    } else {
      row[role] = num(text);
    }
  });

  const lineItems = [...byRow.values()]
    // 빈 행(상품명·금액 모두 없음) 제거
    .filter((row) => String(row.rawProductName ?? "").trim() || Number(row.supplyAmount ?? 0) > 0)
    // 표 하단 요약/합계성 행 제거(품목 아님) — 소계가 2배가 되는 원인
    .filter((row) => !isSummaryRowName(String(row.rawProductName ?? "")))
    .map((row, index) => ({
      rowNo: Number(row.rowNo ?? index + 1),
      rawProductName: String(row.rawProductName ?? "").trim(),
      species: "",
      part: "",
      grade: "",
      condition: "",
      origin: String(row.origin ?? "").trim(),
      unit: String(row.unit ?? "").trim(),
      quantity: row.quantity ?? null,
      unitPrice: row.unitPrice ?? null,
      supplyAmount: row.supplyAmount ?? null,
      taxAmount: null,
      totalAmount: row.supplyAmount ?? null,
      traceOrImportNo: String(row.traceOrImportNo ?? "").trim(),
      confidence: 90,
      readConfidence: 0.9,
      readStatus: "READABLE",
      uncertainFields: [] as string[]
    }));

  return { lineItems, confidences };
}

function extractDocumentFields(fields: ClovaField[], lineItems: Record<string, unknown>[]): Record<string, unknown> {
  const texts = fields.map((f) => String(f.inferText ?? "").trim()).filter(Boolean);
  const joined = texts.join(" ");
  // 거래일자 (YYYY-MM-DD 또는 YYYY.MM.DD)
  const dateMatch = joined.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  const invoiceDate = dateMatch
    ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
    : null;
  // 인쇄 합계: 품목 공급가액 합과 정확히 일치하는 숫자 필드를 찾으면 그것을 채택(자기일관성)
  const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.supplyAmount) || 0), 0);
  let printedTotal: number | null = null;
  if (subtotal > 0) {
    for (const t of texts) {
      const v = num(t);
      if (v != null && v === subtotal) { printedTotal = v; break; }
    }
  }
  return {
    supplierName: "",
    supplierBusinessNo: "",
    invoiceNo: "",
    invoiceDate,
    printedLineCount: lineItems.length,
    supplyAmount: printedTotal,
    taxAmount: null,
    totalAmount: printedTotal
  };
}

// 좌표(y→x) 기준으로 필드를 줄 단위 텍스트로 재구성 (진단·폴백용)
function reconstructText(fields: ClovaField[]): string {
  const items = fields
    .map((f) => {
      const v = f.boundingPoly?.vertices ?? [];
      const ys = v.map((p) => Number(p.y ?? 0));
      const xs = v.map((p) => Number(p.x ?? 0));
      return { text: String(f.inferText ?? "").trim(), y: ys.length ? Math.min(...ys) : 0, x: xs.length ? Math.min(...xs) : 0 };
    })
    .filter((it) => it.text)
    .sort((a, b) => (Math.abs(a.y - b.y) > 16 ? a.y - b.y : a.x - b.x));
  const lines: string[] = [];
  let curY = -9999;
  let cur = "";
  for (const it of items) {
    if (Math.abs(it.y - curY) > 16) { if (cur) lines.push(cur.trim()); cur = it.text; curY = it.y; }
    else { cur += " " + it.text; }
  }
  if (cur) lines.push(cur.trim());
  return lines.join("\n");
}

type ClovaCallResult = {
  result: { documentFields: Record<string, unknown>; lineItems: Record<string, unknown>[] };
  model: string;
  usage: null;
  attempts: number;
  debug: Record<string, unknown>;
};

export async function callClovaInvoice(image: { mimeType: string; base64: string }): Promise<ClovaCallResult> {
  const empty = (debug: Record<string, unknown>): ClovaCallResult => ({
    result: { documentFields: {}, lineItems: [] }, model: "clova-general-ocr", usage: null, attempts: 1, debug
  });
  const secret = Deno.env.get("CLOVA_SECRET") ?? "";
  const format = (image.mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const body = {
    version: "V2",
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    enableTableDetection: true,
    images: [{ format, name: "invoice", data: image.base64 }]
  };
  let response: Response;
  try {
    response = await fetch(CLOVA_INVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-OCR-SECRET": secret },
      body: JSON.stringify(body)
    });
  } catch (_e) {
    return empty({ ok: false, reason: "FETCH_ERROR" });
  }
  if (!response.ok) return empty({ ok: false, reason: `HTTP_${response.status}` });
  const payload = await response.json().catch(() => null);
  const image0: ClovaImage | undefined = Array.isArray(payload?.images) ? payload.images[0] : undefined;
  if (!image0) return empty({ ok: false, reason: "NO_IMAGE" });

  const fields = Array.isArray(image0.fields) ? image0.fields : [];
  const tables = Array.isArray(image0.tables) ? image0.tables : [];
  let lineItems: Record<string, unknown>[] = [];
  for (const table of tables) {
    const built = buildLineItemsFromTable(table);
    if (built.lineItems.length > lineItems.length) lineItems = built.lineItems;
  }
  const documentFields = extractDocumentFields(fields, lineItems);
  const sampleText = reconstructText(fields).slice(0, 700);
  let landscapeCount = 0;
  let boxTotal = 0;
  for (const f of fields) {
    const v = f.boundingPoly?.vertices ?? [];
    if (v.length < 2) continue;
    const xs = v.map((p) => Number(p.x ?? 0));
    const ys = v.map((p) => Number(p.y ?? 0));
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    boxTotal += 1;
    if (w >= h) landscapeCount += 1;
  }
  const boxLandscapeRatio = boxTotal ? Math.round((landscapeCount / boxTotal) * 100) / 100 : 0;
  // 유효 토큰 점수: 똑바로 읽힐수록 이력번호(L…)·금액(1,234)·Box·국내산 등이 많이 잡힌다(거꾸로면 급감).
  let tokenScore = 0;
  for (const f of fields) {
    const t = String(f.inferText ?? "").trim();
    if (/L\d{8,}/.test(t)) tokenScore += 3;
    else if (/^\d{1,3}(,\d{3})+$/.test(t)) tokenScore += 2;
    else if (/\bBox\b/i.test(t) || /(국내산|원산지|합계|장터)/.test(t)) tokenScore += 1;
    else if (/^\d+(\.\d+)?$/.test(t)) tokenScore += 1;
  }
  const tableDump = tables.map((t, ti) => ({
    t: ti,
    cells: (t.cells ?? []).slice(0, 30).map((c) => ({ r: c.rowIndex, c: c.columnIndex, x: cellText(c).slice(0, 18) }))
  }));
  return {
    result: { documentFields, lineItems },
    model: "clova-general-ocr",
    usage: null,
    attempts: 1,
    debug: {
      ok: true,
      inferResult: image0.inferResult ?? "",
      tableCount: tables.length,
      cellCount: tables.reduce((sum, t) => sum + ((t.cells?.length) || 0), 0),
      fieldCount: fields.length,
      rows: lineItems.length,
      boxLandscapeRatio,
      tokenScore,
      tableDump,
      sampleText
    }
  };
}
