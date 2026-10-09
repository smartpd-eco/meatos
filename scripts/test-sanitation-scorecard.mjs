import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../src/data/sanitation-scoring.js");
const scoring = globalThis.MEATOS_SANITATION;

assert.ok(scoring);
assert.equal(scoring.ITEMS.length, 10);
assert.deepEqual(scoring.RATING_POINTS, { 1:10, 2:5, 3:1 });
assert.equal(
  Object.values(scoring.FRIENDLY_SCORE_MESSAGES).reduce((total, messages) => total + messages.length, 0),
  25
);
assert.equal(new Set(Object.values(scoring.FRIENDLY_SCORE_MESSAGES).flat()).size, 25);

const every = (rating) => Object.fromEntries(scoring.ITEMS.map((item) => [item.id, rating]));
assert.deepEqual(
  { total:scoring.calculate(every(1)).total, completed:scoring.calculate(every(1)).completed },
  { total:100, completed:10 }
);
assert.equal(scoring.calculate(every(2)).total, 50);
assert.equal(scoring.calculate(every(3)).total, 10);
assert.equal(scoring.calculate(every(1)).targetMet, true);
assert.ok(scoring.FRIENDLY_SCORE_MESSAGES.good.includes(scoring.scoreMessage(80, true)));

const mixed = every(1);
mixed.pre_temperature = 3;
mixed.after_facility = 2;
const mixedResult = scoring.calculate(mixed);
assert.equal(mixedResult.total, 86);
assert.match(scoring.dailyAdvice(mixed, { fridge:7, freezer:-15 }), /냉장·냉동 온도/);
assert.match(scoring.dailyAdvice(mixed, { fridge:7, freezer:-15 }), /냉장실 7℃/);
assert.match(scoring.dailyAdvice(mixed, { fridge:7, freezer:-15 }), /냉동실 -15℃/);

const monthlyLogs = [
  { evaluation_items:scoring.calculate(every(1)).items },
  { evaluation_items:scoring.calculate(mixed).items }
];
assert.match(scoring.monthlyAdvice(monthlyLogs), /냉장·냉동 온도/);

const [daily, monthly, index, alerts, settings, migration, buildScript] = await Promise.all([
  readFile("sanitation.html", "utf8"),
  readFile("sanitation-list.html", "utf8"),
  readFile("index.html", "utf8"),
  readFile("alerts.html", "utf8"),
  readFile("settings.html", "utf8"),
  readFile("supabase/migrations/202607300052_sanitation_scorecard.sql", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8")
]);

for (const text of scoring.ITEMS.map((item) => item.text)) {
  assert.ok(daily.includes("sanitation-scoring.js"), "daily page must load canonical checklist");
  assert.ok(scoring.ITEMS.some((item) => item.text === text));
}
for (const required of [
  "1 · 매우 잘됨", "2 · 보통", "3 · 불량", "100점", "80점 이상",
  "축산물 일일 위생 점검표", "축산물 월별 위생 점검표", "finding-note", "corrective_action",
  "print-report", "현재 상태", "print-checklist-body",
  ".page > :not(.print-report)", "beforeprint",
  "mobile-group", "URLSearchParams", "getLatestTemplate",
  "work_date=lt.${date}", "최종 작성 양식을 불러왔습니다"
]) {
  assert.ok(daily.includes(required), `daily sanitation page missing ${required}`);
}
assert.ok(!daily.includes('href="index.html">홈</a>'), "daily sanitation page must not show a home button");
for (const required of [
  "previous-month", "next-month", "축산물 월별 위생 점검표 인쇄",
  "일일 총점 / 100점", "monthlyAdvice", "evaluation_items",
  "mobile-calendar", "calendar-day", "파란색 날짜",
  "sanitation.html?date=", "desktop-month-table"
]) {
  assert.ok(monthly.includes(required), `monthly sanitation page missing ${required}`);
}
assert.ok(index.includes("sanitation-list.html"));
assert.ok(index.includes("축산물 월별 위생 점검표"));
assert.ok(index.includes("sanitation-status-button--pending"));
assert.ok(index.includes("sanitation-status-button--complete"));
assert.ok(alerts.includes("축산물 일일 위생 점검표 작성하기"));
assert.ok(alerts.includes("sanitation-panel pending"));
assert.ok(alerts.includes("sanitation-panel complete"));
assert.ok(settings.includes("축산물 일일 위생 점검표"));
assert.ok(settings.includes("축산물 월별 위생 점검표"));
for (const source of [alerts, settings]) assert.doesNotMatch(source, /정육일지/);
assert.ok(migration.includes("evaluation_items jsonb"));
assert.ok(migration.includes("total_score integer"));
assert.ok(buildScript.includes("src/data/sanitation-scoring.js"));

console.log("Sanitation 10-item / 100-point daily and monthly scorecard tests passed.");
