import { validateOcrInvoiceData } from "./ocr-business-validator.js";
import { validateEvidenceBasedInvoice } from "./ocr-evidence-validator.js";

export function assessOcrInventoryReadiness(document, productEngine) {
  const lineItems = Array.isArray(document?.lineItems) ? document.lineItems : [];
  const validation = validateOcrInvoiceData({
    lineItems,
    documentFields: document?.documentFields ?? {}
  });
  const issues = [...validation.issues];
  const evidenceValidation = document?.standardInvoice
    ? validateEvidenceBasedInvoice(document.standardInvoice)
    : null;
  if (evidenceValidation && !evidenceValidation.autoPostingAllowed) {
    issues.push(...evidenceValidation.blockingIssues.map((entry) => `EVIDENCE_${entry.code}`));
  }
  if (document?.status !== "APPROVED") issues.push("DOCUMENT_NOT_APPROVED");

  const traceNumbers = validation.traceNumbers ?? [];
  const lines = lineItems.map((item, index) => {
    const productId = String(item.productMasterId ?? "").trim();
    const product = productId ? productEngine?.findProductById(productId) : null;
    const quantity = Number(item.quantity ?? item.rawQuantity ?? 0);
    const lineIssues = [];
    if (!productId || !product) lineIssues.push("PRODUCT_NOT_LINKED");
    if (!(quantity > 0)) lineIssues.push("QUANTITY_NOT_CONFIRMED");
    if (product?.traceRequired !== false && !traceNumbers.length) lineIssues.push("LIVESTOCK_TRACE_NO_REQUIRED");
    return {
      rowNo: Number(item.rowNo ?? index + 1),
      productId,
      productName: product?.name ?? String(item.normalizedProductName ?? item.rawProductName ?? ""),
      quantity,
      unit: String(item.unit ?? item.rawUnit ?? product?.baseUnit ?? "kg"),
      traceNumbers,
      issues: lineIssues,
      ready: lineIssues.length === 0
    };
  });

  if (lines.some((line) => line.issues.includes("PRODUCT_NOT_LINKED"))) issues.push("PRODUCT_LINK_REQUIRED");
  if (lines.some((line) => line.issues.includes("LIVESTOCK_TRACE_NO_REQUIRED"))) issues.push("LIVESTOCK_TRACE_NO_REQUIRED");

  return {
    ready: validation.postingAllowed
      && (!evidenceValidation || evidenceValidation.autoPostingAllowed)
      && lines.length > 0
      && lines.every((line) => line.ready)
      && issues.length === 0,
    validation,
    evidenceValidation,
    lines,
    issues: [...new Set(issues)]
  };
}

export function postApprovedOcrDocumentToInventory({ document, productEngine, inventoryEngine, documentStore, actor = "user" }) {
  const readiness = assessOcrInventoryReadiness(document, productEngine);
  if (!readiness.ready) {
    const error = new Error(`재고 반영 전 확인이 필요합니다: ${readiness.issues.join(", ")}`);
    error.code = "OCR_INVENTORY_POSTING_BLOCKED";
    error.readiness = readiness;
    throw error;
  }

  const source = `ocr:${document.documentId}`;
  const entries = readiness.lines.map((line) => inventoryEngine.receive({
    productId: line.productId,
    quantity: line.quantity,
    source,
    memo: [
      document.supplierName || document.sourceName,
      document.documentFields?.invoiceDate,
      line.traceNumbers.length ? `이력번호 ${line.traceNumbers.join(",")}` : ""
    ].filter(Boolean).join(" / ")
  }));
  const posted = documentStore.post(document.documentId, actor);
  documentStore.update(document.documentId, {
    inventoryPosting: {
      posted: true,
      entryIds: entries.map((entry) => entry.id),
      postedAt: posted.postedAt,
      actor
    }
  });
  return { document: posted, entries, readiness };
}
