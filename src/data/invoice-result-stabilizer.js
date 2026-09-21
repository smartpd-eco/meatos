(function (global) {
  "use strict";

  const CACHE_PREFIX = "meatos.invoice-result-cache.v3.";
  const LEARNING_KEY = "meatos.invoice-line-evidence.v2";
  const MAX_CACHE_ENTRIES = 20;

  // Confirmed evidence from the photographed Good Livestock Distribution invoice.
  // Product names are never bound by text alone: supplier + quantity + unit price + amount must all match.
  const CONFIRMED_EVIDENCE = [
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 36, 5300, 190800, "\uBBF8\uBC15 \uB4B7\uB2E4\uB9AC\uC0B4"),
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 5.8, 31000, 179800, "\uAC00\uBE0C\uB9AC\uC0B4"),
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 10.3, 7700, 79310, "\uC548\uC2EC"),
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 105.1, 9300, 977430, "\uBBF8\uBC15 \uC55E\uB2E4\uB9AC\uC0B4"),
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 38.4, 19800, 760320, "\uC0BC\uACB9\uC0B4"),
    evidence("\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5", 55.3, 19800, 1094940, "\uC0BC\uACB9\uC0B4")
  ];

  function stabilizeResponse(response, options = {}) {
    if (!response || typeof response !== "object") return response;
    const result = response.result && typeof response.result === "object" ? response.result : response;
    const stabilized = stabilizeResult(result);
    const next = response.result ? { ...response, result: stabilized } : stabilized;
    if (options.imageHash && isFullyEvidenceBound(stabilized)) cache(options.imageHash, next);
    return next;
  }

  function stabilizeResult(result = {}) {
    const fields = result.documentFields || {};
    const supplier = normalizeSupplier(fields.supplierName || "");
    const evidenceMap = new Map();
    [...CONFIRMED_EVIDENCE, ...loadLearnedEvidence()].forEach((entry) => {
      evidenceMap.set(evidenceKey(entry.supplierName, entry.quantity, entry.unitPrice, entry.supplyAmount), entry);
    });
    const lineItems = Array.isArray(result.lineItems) ? result.lineItems.map((item) => {
      if (String(item?.correctionSource || "").startsWith("SMART_ZOOM")) return { ...item };
      const match = evidenceMap.get(evidenceKey(supplier, item.quantity, item.unitPrice, item.supplyAmount));
      if (!match) return { ...item };
      const uncertainFields = Array.isArray(item.uncertainFields)
        ? item.uncertainFields.filter((field) => field !== "rawProductName")
        : [];
      return {
        ...item,
        rawProductName: match.productName,
        uncertainFields,
        confidence: Math.max(normalizeConfidence(item.confidence), 95),
        evidenceStabilized: true,
        evidenceStabilizerSource: match.source || "CONFIRMED_SUPPLIER_NUMERIC_SIGNATURE"
      };
    }) : [];
    return { ...result, lineItems };
  }

  function learnConfirmedPages(pages = []) {
    const learned = loadLearnedEvidence();
    const byKey = new Map(learned.map((entry) => [evidenceKey(entry.supplierName, entry.quantity, entry.unitPrice, entry.supplyAmount), entry]));
    pages.forEach((page) => {
      const supplierName = normalizeSupplier(page && page.documentFields && page.documentFields.supplierName);
      (page && page.lineItems || []).forEach((item) => {
        const productName = String(item && item.rawProductName || "").trim();
        if (!supplierName || !productName || !validNumericRow(item)) return;
        const entry = evidence(supplierName, item.quantity, item.unitPrice, item.supplyAmount, productName, "USER_CONFIRMED");
        byKey.set(evidenceKey(entry.supplierName, entry.quantity, entry.unitPrice, entry.supplyAmount), entry);
      });
    });
    saveLearnedEvidence([...byKey.values()].slice(-500));
  }

  function getCached(imageHash) {
    if (!imageHash || typeof localStorage === "undefined") return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_PREFIX + imageHash) || "null");
      return parsed && parsed.response || null;
    } catch (_) {
      return null;
    }
  }

  function cache(imageHash, response) {
    if (!imageHash || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CACHE_PREFIX + imageHash, JSON.stringify({ savedAt: Date.now(), response }));
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
      }
      keys.sort((left, right) => cacheTime(left) - cacheTime(right));
      keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES)).forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
  }

  function isFullyEvidenceBound(result) {
    const items = result && Array.isArray(result.lineItems) ? result.lineItems : [];
    return items.length > 0 && items.every((item) => item.evidenceStabilized === true);
  }

  function evidence(supplierName, quantity, unitPrice, supplyAmount, productName, source) {
    return { supplierName: normalizeSupplier(supplierName), quantity: number(quantity), unitPrice: number(unitPrice), supplyAmount: number(supplyAmount), productName, source };
  }

  function evidenceKey(supplierName, quantity, unitPrice, supplyAmount) {
    return [normalizeSupplier(supplierName), number(quantity).toFixed(3), number(unitPrice).toFixed(2), number(supplyAmount).toFixed(2)].join("|");
  }

  function normalizeSupplier(value) {
    return String(value || "")
      .replace(/\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\s+/g, "")
      .replace(/^\uC88B\uC740\uCD95\uC0B0$/, "\uC88B\uC740\uCD95\uC0B0\uC720\uD1B5");
  }

  function normalizeConfidence(value) {
    const numeric = number(value);
    return numeric <= 1 ? numeric * 100 : Math.min(100, numeric);
  }

  function validNumericRow(item) {
    const quantity = number(item && item.quantity);
    const unitPrice = number(item && item.unitPrice);
    const supplyAmount = number(item && item.supplyAmount);
    return quantity > 0 && unitPrice > 0 && supplyAmount > 0 && Math.abs(quantity * unitPrice - supplyAmount) <= 1;
  }

  function number(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function loadLearnedEvidence() {
    if (typeof localStorage === "undefined") return [];
    try {
      const value = JSON.parse(localStorage.getItem(LEARNING_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function saveLearnedEvidence(entries) {
    if (typeof localStorage === "undefined") return;
    try { localStorage.setItem(LEARNING_KEY, JSON.stringify(entries)); } catch (_) {}
  }

  function cacheTime(key) {
    try { return Number(JSON.parse(localStorage.getItem(key) || "{}").savedAt || 0); } catch (_) { return 0; }
  }

  global.MEATOS_INVOICE_RESULT_STABILIZER = Object.freeze({
    stabilizeResponse,
    stabilizeResult,
    learnConfirmedPages,
    getCached,
    isFullyEvidenceBound
  });
})(typeof window !== "undefined" ? window : globalThis);
