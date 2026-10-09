import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [stock, classifier, migration, build] = await Promise.all([
  readFile("stock.html", "utf8"),
  readFile("src/data/product-name-substitution.js", "utf8"),
  readFile("supabase/migrations/202607290050_product_name_confirmation_learning.sql", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8"),
]);

assert.match(classifier, /function suggest\(value, context = \{\}\)/);
assert.match(classifier, /function decomposeHangul\(value\)/);
assert.match(classifier, /function multisetDice\(left, right\)/);
assert.match(classifier, /\/rpc\/confirm_product_name_learning/);
assert.match(stock, /AI 추천 품목/);
assert.match(stock, /이 품목이 맞습니다 · 학습하기/);
assert.match(stock, /AI가 가장 가까운 표준 품목으로 정리했습니다\. 회색 표시는 저장 전에 한 번만 확인해 주세요/);
assert.match(stock, /확정 데이터로 처리되며 다음 입력부터 자동치환됩니다/);
assert.match(stock, /PRODUCT_NAMES\.learnCorrection/);
assert.match(stock, /learning\.remotePersisted/);
assert.match(stock, /AI 추천 품목을 먼저 확인하고 학습해주세요/);
assert.match(migration, /USER_CONFIRMED_PRODUCT_NAME/);
assert.match(migration, /BUSINESS_CONFIRMED_PRODUCT_NAME/);
assert.match(migration, /distinct_tenants >= 3/);
assert.match(migration, /promoted_shared/);
assert.match(migration, /BUSINESS_MEMBERSHIP_REQUIRED/);
assert.match(build, /src\/data\/product-name-substitution\.js/);

console.log("Product-name recommendation confirmation and promotion tests passed.");
