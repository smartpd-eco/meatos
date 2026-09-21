(function (global) {
  "use strict";

  function money(value) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  }

  function calculateLineAmount(line = {}) {
    const supplyAmount = money(line.supplyAmount ?? line.rawAmount);
    if (supplyAmount > 0) return supplyAmount;
    const totalAmount = money(line.totalAmount);
    if (totalAmount > 0) return totalAmount;
    return money(Number(line.quantity ?? line.rawQuantity ?? 0) * Number(line.unitPrice ?? line.rawUnitPrice ?? 0));
  }

  function calculatePageSubtotal(lineItems = []) {
    return (Array.isArray(lineItems) ? lineItems : [])
      .reduce((sum, line) => sum + calculateLineAmount(line), 0);
  }

  function createInvoicePage(input = {}) {
    const lineItems = Array.isArray(input.lineItems) ? input.lineItems.map((line) => ({ ...line })) : [];
    const documentFields = { ...(input.documentFields ?? {}) };
    return {
      pageId: String(input.pageId ?? "").trim(),
      pageNo: Number(input.pageNo ?? 1),
      fileName: String(input.fileName ?? "scan.jpg"),
      imageDataUrl: String(input.imageDataUrl ?? ""),
      documentFields,
      lineItems,
      originalProductNames: Array.isArray(input.originalProductNames) ? [...input.originalProductNames] : [],
      displayedTotal: money(documentFields.totalAmount),
      pageSubtotal: calculatePageSubtotal(lineItems)
    };
  }

  function refreshInvoicePage(page = {}) {
    page.pageSubtotal = calculatePageSubtotal(page.lineItems);
    page.displayedTotal = money(page.documentFields?.totalAmount);
    return page;
  }

  function repeatedDisplayedTotal(pages = []) {
    const positive = pages.map((page) => money(page.displayedTotal)).filter((value) => value > 0);
    if (positive.length < 2) return 0;
    const counts = new Map();
    for (const value of positive) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[1] > 1
      ? [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0]
      : 0;
  }

  function summarizeInvoicePages(pages = []) {
    const normalized = (Array.isArray(pages) ? pages : []).map(refreshInvoicePage);
    const actualTotal = normalized.reduce((sum, page) => sum + money(page.pageSubtotal), 0);
    const displayedTotals = normalized.map((page) => money(page.displayedTotal));
    const repeatedTotal = repeatedDisplayedTotal(normalized);
    return {
      pageCount: normalized.length,
      actualTotal,
      pageSubtotals: normalized.map((page) => money(page.pageSubtotal)),
      displayedTotals,
      displayedGrandTotal: displayedTotals.reduce((sum, amount) => sum + amount, 0),
      repeatedDisplayedTotal: repeatedTotal,
      hasRepeatedDisplayedTotal: repeatedTotal > 0
    };
  }

  function flattenInvoicePages(pages = []) {
    const rows = [];
    for (const [pageIndex, page] of (Array.isArray(pages) ? pages : []).entries()) {
      for (const [lineIndex, line] of (Array.isArray(page.lineItems) ? page.lineItems : []).entries()) {
        rows.push({
          ...line,
          pageNo: Number(page.pageNo ?? pageIndex + 1),
          pageLineNo: lineIndex + 1,
          pageSupplierName: String(page.documentFields?.supplierName ?? ""),
          pageInvoiceDate: String(page.documentFields?.invoiceDate ?? "")
        });
      }
    }
    return rows;
  }

  const api = Object.freeze({
    calculateLineAmount,
    calculatePageSubtotal,
    createInvoicePage,
    refreshInvoicePage,
    summarizeInvoicePages,
    flattenInvoicePages
  });

  global.MEATOS_MULTI_PAGE_INVOICE = api;
})(typeof window !== "undefined" ? window : globalThis);
