import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../src/data/multi-page-invoice.js";

const invoice = globalThis.MEATOS_MULTI_PAGE_INVOICE;

const pages = [
  invoice.createInvoicePage({ pageNo: 1, documentFields: { totalAmount: 500000 }, lineItems: [{ supplyAmount: 60000 }, { supplyAmount: 40000 }] }),
  invoice.createInvoicePage({ pageNo: 2, documentFields: { totalAmount: 500000 }, lineItems: [{ quantity: 10, unitPrice: 12000 }] }),
  invoice.createInvoicePage({ pageNo: 3, documentFields: { totalAmount: 500000 }, lineItems: [{ totalAmount: 80000 }] }),
  invoice.createInvoicePage({ pageNo: 4, documentFields: { totalAmount: 500000 }, lineItems: [{ supplyAmount: 90000 }] }),
  invoice.createInvoicePage({ pageNo: 5, documentFields: { totalAmount: 500000 }, lineItems: [{ supplyAmount: 110000 }] })
];

const summary = invoice.summarizeInvoicePages(pages);
assert.equal(summary.pageCount, 5);
assert.deepEqual(summary.displayedTotals, [500000, 500000, 500000, 500000, 500000]);
assert.deepEqual(summary.pageSubtotals, [100000, 120000, 80000, 90000, 110000]);
assert.equal(summary.displayedGrandTotal, 2500000);
assert.equal(summary.actualTotal, 500000);
assert.equal(summary.repeatedDisplayedTotal, 500000);
assert.equal(summary.hasRepeatedDisplayedTotal, true);

const flat = invoice.flattenInvoicePages(pages);
assert.equal(flat.length, 6);
assert.deepEqual(flat.map((line) => line.pageNo), [1, 1, 2, 3, 4, 5]);
assert.deepEqual(flat.map((line) => line.pageLineNo), [1, 2, 1, 1, 1, 1]);

pages[1].lineItems[0].quantity = 11;
invoice.refreshInvoicePage(pages[1]);
assert.equal(pages[1].pageSubtotal, 132000);
assert.equal(invoice.summarizeInvoicePages(pages).actualTotal, 512000);

const [buildScript, serviceWorker, scanPage] = await Promise.all([
  readFile("scripts/build-vercel-static.mjs", "utf8"),
  readFile("sw.js", "utf8"),
  readFile("scan.html", "utf8")
]);
assert.match(buildScript, /copy\("src\/data\/multi-page-invoice\.js"\)/);
assert.match(serviceWorker, /\.\/src\/data\/multi-page-invoice\.js/);
assert.match(scanPage, /src\/data\/multi-page-invoice\.js/);

console.log("multi-page invoice tests passed");
