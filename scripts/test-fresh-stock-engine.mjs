import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyPolicy, calculateSafetyStock, learnYieldProfile } from "../src/data/fresh-stock-engine.js";

assert.equal(classifyPolicy({ name:"냉동 삼겹살" }), "F4_FROZEN_BUFFER");
assert.equal(classifyPolicy({ name:"미박 앞다리살" }), "F5_TRANSFORMABLE_RAW");
assert.equal(classifyPolicy({ name:"다짐육" }), "F2_SHORT_LIFE_PROCESSED");

const stableDemand = Array.from({ length:56 }, (_, index) => 4 + (index % 3));
const order = calculateSafetyStock({ name:"냉장 삼겹살", dailyDemand:stableDemand, onHand:1, leadTimeDays:1, reviewDays:1, packSize:5, leadTimeSamples:25, inventoryConfidence:0.97 });
assert.equal(order.action, "ORDER");
assert.equal(order.recommendedOrderKg % 5, 0);
assert.ok(order.targetStockKg >= order.reorderPointKg);

const expiry = calculateSafetyStock({ name:"냉장 삼겹살", dailyDemand:stableDemand, onHand:30, expectedWaste:5, shelfLifeDays:3 });
assert.equal(expiry.action, "REDUCE");

const learned = learnYieldProfile({ priorKey:"TRIM_STANDARD", observations:Array.from({ length:30 }, () => ({ inputWeight:20, outputWeight:18, byproductWeight:1, lossWeight:1 })) });
assert.equal(learned.sampleCount, 30);
assert.equal(learned.source, "STORE_LEARNED");
assert.ok(learned.rate > 0.88 && learned.rate <= 0.90);

const excluded = learnYieldProfile({ observations:[{ inputWeight:20, outputWeight:10, byproductWeight:0, lossWeight:0 }] });
assert.equal(excluded.sampleCount, 0);

const settingsHtml = await readFile(new URL("../fresh-stock-settings.html", import.meta.url), "utf8");
const settingsCss = await readFile(new URL("../fresh-stock.css", import.meta.url), "utf8");
assert.match(settingsHtml, /처음 오셨나요\? 이것만 하시면 됩니다/);
assert.match(settingsHtml, /필수는 3개뿐입니다/);
assert.match(settingsHtml, /이 품목 기준 저장/);
assert.match(settingsHtml, /이 작업 기록 저장·학습/);
assert.match(settingsHtml, /모르면 0으로 두세요/);
assert.match(settingsHtml, /모르면 비워두세요/);
assert.match(settingsHtml, /어려운 용어 다시 보기/);
assert.match(settingsCss, /@media\(max-width:760px\)[\s\S]*?\.fs-form\{grid-template-columns:1fr\}/);
console.log("Fresh Stock Engine tests passed.");
