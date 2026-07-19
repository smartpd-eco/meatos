import assert from "node:assert/strict";
import { validateOcrInvoiceData } from "../src/data/ocr-business-validator.js";
import { assessOcrInventoryReadiness, postApprovedOcrDocumentToInventory } from "../src/data/ocr-inventory-posting-service.js";

const validFields = {
  supplierName: "좋은축산",
  invoiceDate: "2026-07-06",
  supplyAmount: 327000,
  taxAmount: 0,
  totalAmount: 327000,
  livestockTraceNos: ["L12607026054002"]
};
const validItems = [{
  rowNo: 1,
  rawProductName: "냉장 등심(장터)",
  quantity: 43.6,
  unitPrice: 7500,
  amount: 327000,
  productMasterId: "prd-1",
  unit: "kg",
  confidence: 98
}];

const valid = validateOcrInvoiceData({ lineItems: validItems, documentFields: validFields });
assert.equal(valid.numericIntegrity, true);
assert.equal(valid.postingAllowed, true);
assert.equal(valid.traceNumberValid, true);

const missing = validateOcrInvoiceData({
  lineItems: [{ quantity: 0, unitPrice: 0, amount: 0 }],
  documentFields: { supplyAmount: 0, totalAmount: 0 }
});
assert.equal(missing.postingAllowed, false);
assert.ok(missing.issues.includes("NUMERIC_FIELD_MISSING"));

const products = [{ id: "prd-1", name: "냉장 등심", baseUnit: "kg", traceRequired: true }];
const ledger = [];
const productEngine = { findProductById: (id) => products.find((product) => product.id === id) };
const inventoryEngine = {
  receive(input) {
    const entry = { id: `led-${ledger.length + 1}`, ...input };
    ledger.push(entry);
    return entry;
  }
};
const documentStore = {
  post(id) { return { documentId: id, status: "POSTED", postedAt: "2026-07-13T00:00:00Z" }; },
  update() {}
};
const document = { documentId: "doc-1", status: "APPROVED", supplierName: "좋은축산", documentFields: validFields, lineItems: validItems };
const readiness = assessOcrInventoryReadiness(document, productEngine);
assert.equal(readiness.ready, true);
const posted = postApprovedOcrDocumentToInventory({ document, productEngine, inventoryEngine, documentStore });
assert.equal(posted.entries.length, 1);
assert.equal(ledger[0].quantity, 43.6);
assert.match(ledger[0].memo, /L12607026054002/);

const noTrace = assessOcrInventoryReadiness({ ...document, documentFields: { ...validFields, livestockTraceNos: [], livestockTraceNo: "" } }, productEngine);
assert.equal(noTrace.ready, false);
assert.ok(noTrace.issues.includes("LIVESTOCK_TRACE_NO_REQUIRED"));

console.log(JSON.stringify({
  validPosting: readiness.ready,
  numericIntegrity: valid.numericIntegrity,
  blockedMissingNumeric: missing.issues,
  blockedMissingTrace: noTrace.issues,
  postedQuantity: ledger[0].quantity
}, null, 2));
