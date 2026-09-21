type InvoiceRow = Record<string, unknown> & {
  rowNo?: unknown;
  rawProductName?: unknown;
  origin?: unknown;
  unit?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  supplyAmount?: unknown;
  traceOrImportNo?: unknown;
};

type InvoiceResult = Record<string, unknown> & {
  documentFields?: { printedLineCount?: unknown };
  lineItems?: InvoiceRow[];
};

export function detectRowAlignmentIssues(result: InvoiceResult = {}): string[] {
  const issues: string[] = [];
  const documentFields = result.documentFields ?? {};
  const lineItems = Array.isArray(result.lineItems) ? result.lineItems : [];
  const printedLineCount = Number(documentFields.printedLineCount ?? 0);
  if (printedLineCount > 0 && printedLineCount !== lineItems.length) {
    issues.push(`PRINTED_LINE_COUNT_MISMATCH:${printedLineCount}:${lineItems.length}`);
  }

  const rowNumbers = lineItems.map((item) => Number(item.rowNo ?? 0));
  const uniqueRows = new Set(rowNumbers);
  const contiguous = rowNumbers.every((rowNo, index) => rowNo === index + 1);
  if (uniqueRows.size !== rowNumbers.length || !contiguous) {
    issues.push("ROW_NUMBER_DUPLICATE_OR_GAP");
  }

  const signatures = new Map<string, number>();
  lineItems.forEach((item, index) => {
    for (const productIssue of detectProductCellIssues(item)) {
      issues.push(`${productIssue}:${index + 1}`);
    }
    const quantity = finiteNumber(item.quantity);
    const unitPrice = finiteNumber(item.unitPrice);
    const supplyAmount = finiteNumber(item.supplyAmount);
    if (quantity === null || unitPrice === null || supplyAmount === null) return;

    const expected = quantity * unitPrice;
    const tolerance = 1;
    if (Math.abs(expected - supplyAmount) > tolerance) {
      issues.push(`ROW_ARITHMETIC_MISMATCH:${index + 1}`);
    }
    const signature = [
      quantity.toFixed(3),
      unitPrice.toFixed(2),
      supplyAmount.toFixed(2),
      String(item.traceOrImportNo ?? "").replace(/\s+/g, "")
    ].join("|");
    const previousIndex = signatures.get(signature);
    if (previousIndex !== undefined && index - previousIndex === 1) {
      issues.push(`ADJACENT_ROW_VALUE_DUPLICATE:${previousIndex + 1}:${index + 1}`);
    } else {
      signatures.set(signature, index);
    }
  });
  return [...new Set(issues)];
}

export function detectProductCellIssues(item: InvoiceRow = {}): string[] {
  const name = cleanText(item.rawProductName);
  const origin = cleanText(item.origin);
  const issues: string[] = [];
  if (!name) issues.push("PRODUCT_NAME_EMPTY");
  if (/(?:^|\s)(?:원산지|수량|중량|단가|공급가액|합계금액|이력번호|거래일자|사업자번호|연락처)(?=\s|$|\()/.test(name)) {
    issues.push("PRODUCT_COLUMN_HEADER_CONTAMINATION");
  }
  if (name && /^[\s\d,.+\-/원박스BOXkgKG]+$/.test(name)) issues.push("PRODUCT_COLUMN_NUMERIC_SHIFT");
  if (/^\d*\s*(?:box|kg|박스|팩|개)$/i.test(name)) issues.push("PRODUCT_COLUMN_UNIT_SHIFT");
  if (origin && /(?:국내산|국내|미국산|수입산|수입|호주산|캐나다산|브라질산|덴마크산|스페인산|칠레산|네덜란드산|멕시코산)/.test(name)) {
    issues.push("PRODUCT_COLUMN_ORIGIN_SHIFT");
  }
  return [...new Set(issues)];
}

const SHIFTED_NUMERIC_FIELDS = [
  "unit",
  "quantity",
  "unitPrice",
  "supplyAmount",
  "taxAmount",
  "totalAmount",
  "traceOrImportNo"
] as const;

/**
 * Repairs the narrow failure pattern where a hybrid numeric row is inserted
 * and every following product name is bound to the previous row's numbers.
 */
export function repairShiftedRowAlignment<T extends InvoiceResult>(result: T): T {
  const lineItems = Array.isArray(result.lineItems) ? result.lineItems : [];
  if (lineItems.length < 3) return result;

  // Gemini가 음영 경계에서 앞 행의 숫자 셀을 한 번 더 읽고, 이후 상품명과
  // 숫자 열을 한 칸씩 밀어 붙이는 패턴을 먼저 복구한다. 단순 행 삭제가 아니라
  // 현재 행의 상품명은 보존하고 다음 행의 숫자 증거를 당겨 와야 실제 6행이 된다.
  for (let index = 1; index < lineItems.length - 1; index += 1) {
    const previous = lineItems[index - 1];
    const current = lineItems[index];
    if (numericSignature(previous) !== numericSignature(current)) continue;
    if (!sameTrace(previous, current)) continue;
    if (!lineItems.slice(index).every((item) => arithmeticError(item) <= 1)) continue;

    const repaired = lineItems.slice(0, index).map((item) => ({ ...item }));
    for (let sourceIndex = index; sourceIndex < lineItems.length - 1; sourceIndex += 1) {
      const semanticRow = { ...lineItems[sourceIndex] };
      const numericRow = lineItems[sourceIndex + 1];
      for (const field of SHIFTED_NUMERIC_FIELDS) semanticRow[field] = numericRow[field];
      semanticRow.rowNo = repaired.length + 1;
      const semanticConfidence = finiteNumber(semanticRow.confidence) ?? 80;
      const numericConfidence = finiteNumber(numericRow.confidence) ?? 80;
      semanticRow.confidence = Math.min(80, semanticConfidence, numericConfidence);
      repaired.push(semanticRow);
    }

    return {
      ...result,
      reviewRequired: true,
      rowAlignmentRepaired: true,
      rowAlignmentRepairReason: "INSERTED_DUPLICATE_NUMERIC_ROW",
      documentFields: {
        ...(result.documentFields ?? {}),
        printedLineCount: repaired.length
      },
      lineItems: repaired
    } as T;
  }

  for (let index = 1; index < lineItems.length - 1; index += 1) {
    const current = lineItems[index];
    const next = lineItems[index + 1];
    const currentAmount = finiteNumber(current.supplyAmount);
    const nextAmount = finiteNumber(next.supplyAmount);
    if (currentAmount === null || nextAmount === null || Math.abs(currentAmount - nextAmount) > 1) continue;
    if (arithmeticError(current) <= 1 || arithmeticError(next) > 1) continue;
    if (!lineItems.slice(index + 1).every((item) => arithmeticError(item) <= 1)) continue;

    const repaired = lineItems.slice(0, index).map((item) => ({ ...item }));
    for (let sourceIndex = index; sourceIndex < lineItems.length - 1; sourceIndex += 1) {
      const semanticRow = { ...lineItems[sourceIndex] };
      const numericRow = lineItems[sourceIndex + 1];
      for (const field of SHIFTED_NUMERIC_FIELDS) semanticRow[field] = numericRow[field];
      semanticRow.rowNo = repaired.length + 1;
      const semanticConfidence = finiteNumber(semanticRow.confidence) ?? 80;
      const numericConfidence = finiteNumber(numericRow.confidence) ?? 80;
      semanticRow.confidence = Math.min(80, semanticConfidence, numericConfidence);
      repaired.push(semanticRow);
    }

    return {
      ...result,
      reviewRequired: true,
      rowAlignmentRepaired: true,
      rowAlignmentRepairReason: "SHIFTED_NUMERIC_COLUMNS",
      documentFields: {
        ...(result.documentFields ?? {}),
        printedLineCount: repaired.length
      },
      lineItems: repaired
    } as T;
  }
  return result;
}

function numericSignature(item: InvoiceRow): string {
  const quantity = finiteNumber(item.quantity);
  const unitPrice = finiteNumber(item.unitPrice);
  const supplyAmount = finiteNumber(item.supplyAmount);
  if (quantity === null || unitPrice === null || supplyAmount === null) return "";
  return `${quantity.toFixed(3)}|${unitPrice.toFixed(2)}|${supplyAmount.toFixed(2)}`;
}

function sameTrace(left: InvoiceRow, right: InvoiceRow): boolean {
  const leftTrace = String(left.traceOrImportNo ?? "").replace(/\s+/g, "");
  const rightTrace = String(right.traceOrImportNo ?? "").replace(/\s+/g, "");
  return Boolean(leftTrace) && leftTrace === rightTrace;
}

function arithmeticError(item: InvoiceRow): number {
  const quantity = finiteNumber(item.quantity);
  const unitPrice = finiteNumber(item.unitPrice);
  const supplyAmount = finiteNumber(item.supplyAmount);
  if (quantity === null || unitPrice === null || supplyAmount === null) return Number.POSITIVE_INFINITY;
  return Math.abs((quantity * unitPrice) - supplyAmount);
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
