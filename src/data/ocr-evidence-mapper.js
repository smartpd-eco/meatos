import { createEvidenceField, createStandardInvoice, createUnmappedToken, FIELD_EVIDENCE_STATUS, REQUIRED_LINE_FIELDS } from "./meatos-standard-invoice.js";
import { applyDocumentCompletenessPolicy } from "./ocr-document-completeness-policy.js";
import { resolveMeatTaxTreatment } from "./meat-tax-policy.js";

export function mapOcrTableToEvidenceInvoice(input = {}) {
  const mappedRows = (Array.isArray(input.rows) ? input.rows : []).map((row, index) => mapRow(row, index, input));
  const completeness = applyDocumentCompletenessPolicy(input.documentFields ?? {}, input.completeness ?? {});
  return {
    invoice: createStandardInvoice({
      documentId: input.documentId,
      supplierId: input.supplierId,
      documentFields: completeness.documentFields,
      lineItems: mappedRows,
      unmappedTokens: input.unmappedTokens
    }),
    completeness,
    reviewReasons: [...new Set([
      ...mappedRows.flatMap((row) => row.reviewReasons),
      ...completeness.warnings.map((warning) => warning.code)
    ])]
  };
}

function mapRow(row, index, input) {
  const rowNo = Number(row?.rowNo ?? index + 1);
  const cells = row?.cells ?? {};
  const fields = {};
  for (const fieldName of REQUIRED_LINE_FIELDS) {
    const cell = cells[fieldName];
    fields[fieldName] = cell
      ? createEvidenceField(parseCellValue(fieldName, cell.text ?? cell.value), {
        status: cell.unreadable ? FIELD_EVIDENCE_STATUS.UNREADABLE : FIELD_EVIDENCE_STATUS.OBSERVED,
        confidence: cell.confidence,
        source: cell.providerId ?? input.providerId ?? "OCR",
        sourceDocumentId: input.documentId,
        pageNo: cell.pageNo,
        rowNo,
        bounds: cell.bounds,
        rawText: cell.text ?? cell.value,
        reasonCodes: cell.headerMatched ? ["HEADER_COORDINATE_MATCH"] : ["TABLE_CELL_COORDINATE_MATCH"]
      })
      : createEvidenceField(null, { status: FIELD_EVIDENCE_STATUS.MISSING, rowNo, sourceDocumentId: input.documentId });
  }

  const rowText = String(row?.rawText ?? Object.values(cells).map((cell) => cell?.text ?? cell?.value ?? "").join(" "));
  const taxResolution = resolveMeatTaxTreatment({ rawText: rowText, observedTaxAmount: cells.taxAmount?.text ?? cells.taxAmount?.value }, input.taxPolicy);
  fields.taxTreatment = taxResolution.treatment;
  if (!cells.taxAmount && taxResolution.taxAmount) fields.taxAmount = taxResolution.taxAmount;

  const knownCellTexts = new Set(Object.values(cells).map((cell) => String(cell?.text ?? cell?.value ?? "").trim()).filter(Boolean));
  const unmappedTokens = (Array.isArray(row?.tokens) ? row.tokens : [])
    .filter((token) => !knownCellTexts.has(String(token?.text ?? token).trim()))
    .map((token) => createUnmappedToken(token?.text ?? token, { ...token, rowNo }));
  return {
    rowNo,
    fields,
    unmappedTokens,
    reviewReasons: [
      ...(taxResolution.reviewRequired ? taxResolution.reasonCodes : []),
      ...(unmappedTokens.length ? ["UNMAPPED_TOKENS"] : [])
    ]
  };
}

function parseCellValue(fieldName, value) {
  if (["quantity", "unitPrice", "supplyAmount", "taxAmount", "totalAmount"].includes(fieldName)) {
    const numeric = Number(String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return String(value ?? "").trim();
}
