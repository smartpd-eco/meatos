import assert from "node:assert/strict";
import { createCloudOcrProvider, normalizeGoogleVisionResponse, normalizeMeatosVisionResponse, normalizeUpstageDocumentResponse } from "../src/data/ocr-cloud-provider-adapter.js";
import { decideOcrEscalation } from "../src/data/ocr-provider-routing-policy.js";
import { buildStructuralLearningSample } from "../src/data/ocr-structural-learning.js";

const googleFixture = {
  responses: [{
    fullTextAnnotation: {
      text: "냉장 등심 43.600",
      pages: [{ blocks: [{ paragraphs: [{ words: [
        { confidence: 0.98, boundingBox: { vertices: [{ x: 10, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 50 }, { x: 10, y: 50 }] }, symbols: [{ text: "냉" }, { text: "장" }] },
        { confidence: 0.99, boundingBox: { vertices: [{ x: 120, y: 20 }, { x: 190, y: 20 }, { x: 190, y: 50 }, { x: 120, y: 50 }] }, symbols: [{ text: "등" }, { text: "심" }] }
      ] }] }] }]
    }
  }]
};
const upstageFixture = {
  apiVersion: "1.1",
  modelVersion: "document-parse-test",
  text: "상품명 수량 단가 금액",
  elements: [
    { id: 1, category: "table", confidence: 0.97, content: { html: "<table><tr><td>냉장 등심</td></tr></table>" }, coordinates: [{ x: 10, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 500 }, { x: 10, y: 500 }] },
    { id: 2, category: "text", confidence: 0.99, content: { text: "냉장 등심" }, coordinates: [{ x: 20, y: 130 }, { x: 200, y: 130 }, { x: 200, y: 170 }, { x: 20, y: 170 }] }
  ]
};

const google = normalizeGoogleVisionResponse(googleFixture, { processingMs: 620 });
assert.equal(google.words.length, 2);
assert.equal(google.words[0].text, "냉장");
assert.equal(google.providerConfidence, 99);
assert.equal(google.layoutSignals.tableCount, 0);

const upstage = normalizeUpstageDocumentResponse(upstageFixture, { processingMs: 780 });
assert.equal(upstage.tables.length, 1);
assert.equal(upstage.layoutSignals.hasExplicitTable, true);
assert.equal(upstage.elements[0].html.includes("table"), true);

const vision = normalizeMeatosVisionResponse({
  providerId: "gemini-2.5-flash",
  providerName: "Gemini 2.5 Flash Vision",
  result: {
    rawText: "냉장 등심 3.9 42000 163800",
    providerConfidence: 91,
    reviewRequired: true,
    documentFields: { totalAmount: 163800 },
    lineItems: [{ rowNo: 1, rawProductName: "냉장 등심", quantity: 3.9, unitPrice: 42000, supplyAmount: 163800 }],
    usage: { inputTokens: 3000, outputTokens: 800 }
  }
}, { processingMs: 900 });
assert.equal(vision.providerId, "gemini-2.5-flash");
assert.equal(vision.lineItems.length, 1);
assert.equal(vision.reviewRequired, true);

assert.equal(decideOcrEscalation({ tableScore: 97, arithmeticOk: true, requiredFieldRate: 100 }).action, "LOCAL_ACCEPT");
assert.equal(decideOcrEscalation({ tableScore: 86, arithmeticOk: false, requiredFieldRate: 80, primaryProcessingMs: 1800 }).action, "SELECTIVE_COMPARE");
assert.equal(decideOcrEscalation({ tableScore: 60, arithmeticOk: false, unseenLayout: true }, { estimatedMonthlyPages: 5000, maxExternalCostUsd: 100 }).providerId, "upstage-document-parse");
assert.equal(decideOcrEscalation({ tableScore: 60, arithmeticOk: false, unseenLayout: true }, { estimatedMonthlyPages: 20000, maxExternalCostUsd: 100 }).action, "REVIEW_REQUIRED");

const learning = buildStructuralLearningSample({ providerResult: upstage, correction: { fieldName: "productName", beforeValue: "냉장등심", afterValue: "냉장 등심" }, arithmeticValidated: true });
assert.equal(learning.tableElements.length, 1);
assert.equal(learning.afterValue, "냉장 등심");
assert.equal(learning.arithmeticValidated, true);

const upstageAdapter = createCloudOcrProvider("upstage");
const googleAdapter = createCloudOcrProvider("google-vision");
const geminiAdapter = createCloudOcrProvider("gemini");
const gptAdapter = createCloudOcrProvider("gpt");
assert.equal((await upstageAdapter.healthCheck()).status, "SERVER_FUNCTION_URL_MISSING");
assert.equal((await googleAdapter.healthCheck()).status, "SERVER_FUNCTION_URL_MISSING");
assert.equal((await geminiAdapter.healthCheck()).status, "SERVER_FUNCTION_URL_MISSING");
assert.equal((await gptAdapter.healthCheck()).status, "SERVER_FUNCTION_URL_MISSING");

console.log(JSON.stringify({
  contract: "MEATOS_OCR_PROVIDER_V1",
  google: { words: google.words.length, tables: google.tables.length, processingMs: google.processingMs },
  upstage: { words: upstage.words.length, tables: upstage.tables.length, processingMs: upstage.processingMs },
  routing: "local -> selective cells -> Upstage layout -> review",
  secretsUsed: false,
  externalCalls: 0
}, null, 2));
