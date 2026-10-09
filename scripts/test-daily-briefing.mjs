import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("../src/data/daily-briefing.js");
const briefing = globalThis.MEATOS_DAILY_BRIEFING;

assert.ok(briefing);
assert.equal(briefing.extractRegion("부산광역시 해운대구 우동 123"), "해운대구");
assert.equal(briefing.extractRegion("경기도 양평군 양평읍"), "양평군");
assert.equal(briefing.weatherKind({ code:63, temperature:22, precipitation:2 }), "rainy");
assert.equal(briefing.weatherKind({ code:0, temperature:31, precipitation:0 }), "hot");
assert.equal(briefing.weatherKind({ code:0, temperature:26, apparentTemperature:30, humidity:78, precipitation:0 }), "hot");
assert.equal(briefing.weatherKind({ code:0, temperature:26, apparentTemperature:27, humidity:84, precipitation:0 }), "hot");
assert.equal(briefing.weatherKind({ code:71, temperature:-2, precipitation:1 }), "snow");
assert.equal(briefing.seasonKind(new Date("2026-04-15T12:00:00+09:00")), "spring");
assert.equal(briefing.seasonKind(new Date("2026-07-15T12:00:00+09:00")), "summer");
assert.equal(briefing.seasonKind(new Date("2026-10-15T12:00:00+09:00")), "autumn");
assert.equal(briefing.seasonKind(new Date("2026-11-15T12:00:00+09:00")), "kimchi");
assert.equal(briefing.seasonKind(new Date("2026-12-15T12:00:00+09:00")), "winter");
assert.equal(briefing.EVIDENCE_SOURCES.length, 6);
assert.deepEqual(
  briefing.EVIDENCE_SOURCES.map((source) => source.organization),
  ["농촌진흥청", "한국농수산식품유통공사", "기상청", "Google Trends", "네이버", "YouTube"]
);
for (const [species, pools] of Object.entries(briefing.MENU_POOLS)) {
  for (const [poolName, menus] of Object.entries(pools)) {
    assert.ok(menus.length >= 4, `${species}/${poolName} recommendation pool is too small`);
    for (const menu of menus) {
      assert.match(menu, /(돼지|소고기|닭|삼겹|목살|앞다리|등심|안심|사태|양지|갈비|차돌|우삼겹|우목심)/);
      assert.match(menu, /(찌개|구이|찜|볶음|전골|수육|냉채|곰탕|장조림|감자탕|육개장|보쌈|무침|불고기|뭇국|바비큐|백숙)/);
      if (species === "pork") assert.doesNotMatch(menu, /(소고기|우삼겹|우목심|차돌|양지|사태|닭)/);
      if (species === "beef") assert.doesNotMatch(menu, /(돼지|삼겹살|앞다리살|닭)/);
      if (species === "chicken") assert.match(menu, /닭/);
    }
  }
}
assert.equal(briefing.subjectParticle("간장볶음"), "이");
assert.equal(briefing.subjectParticle("김치찌개"), "가");
const morning = briefing.selectRecommendation({ date:new Date("2026-07-30T09:00:00+09:00"), region:"해운대구", weather:{ code:0, temperature:31 } });
const afternoon = briefing.selectRecommendation({ date:new Date("2026-07-30T14:00:00+09:00"), region:"해운대구", weather:{ code:0, temperature:31 } });
const evening = briefing.selectRecommendation({ date:new Date("2026-07-30T21:00:00+09:00"), region:"해운대구", weather:{ code:0, temperature:31 } });
for (const recommendation of [morning, afternoon, evening]) {
  assert.ok(["pork", "beef", "chicken"].includes(recommendation.species));
  assert.ok(Number.isFinite(recommendation.recommendationScore));
}
assert.doesNotMatch(briefing.buildTip({ date:new Date("2026-07-30T09:00:00+09:00"), region:"해운대구", weather:{ code:0, temperature:31 } }), /(돼지|소|닭)특선/);
assert.match(briefing.buildTip({ date:new Date("2026-07-30T09:00:00+09:00"), region:"해운대구", weather:{ code:0, temperature:31 } }), /AI 특선/);
assert.equal(briefing.dayPart(new Date("2026-07-30T09:00:00+09:00")), "morning");
assert.equal(briefing.regionKind("해운대구"), "coastal");

const searchUrls = briefing.trendSearchUrls("목살 소금구이", "안산시");
assert.match(searchUrls.googleTrends, /trends\.google\.com/);
assert.match(searchUrls.naver, /search\.naver\.com/);
assert.match(searchUrls.youtube, /youtube\.com\/results/);
assert.match(searchUrls.instagram, /instagram\.com\/explore\/tags/);

const samples = [
  briefing.buildTip({ date:new Date("2026-07-30T12:00:00+09:00"), region:"해운대구", weather:{ code:80, temperature:29, precipitation:1 } }),
  briefing.buildTip({ date:new Date("2026-12-15T12:00:00+09:00"), region:"강남구", weather:{ code:71, temperature:-3, precipitation:1 } }),
  briefing.buildTip({ date:new Date("2026-05-09T12:00:00+09:00"), region:"종로구", weather:{ code:0, temperature:22, precipitation:0 }, eventName:"봄 골목축제" }),
  briefing.buildTip({ date:new Date("2026-08-02T12:00:00+09:00"), region:"우리 동네", weather:{} })
];
for (const tip of samples) {
  assert.ok(Array.from(tip).length <= 50, `daily briefing exceeds 50 characters: ${tip}`);
  assert.match(tip, /(찌개|구이|찜|볶음|전골|수육|냉채|곰탕|장조림|백숙|육개장|감자탕|보쌈|무침|불고기|뭇국|바비큐)/);
  assert.doesNotMatch(tip, /볶음가/);
}
assert.match(samples[0], /해운대구/);
assert.match(samples[2], /봄 골목축제/);

for (let day = 0; day < 365; day += 1) {
  const date = new Date("2026-01-01T12:00:00+09:00");
  date.setDate(date.getDate() + day);
  const tip = briefing.buildTip({
    date,
    region:"안산시",
    weather:{ code:0, temperature:18, apparentTemperature:18, humidity:55, precipitation:0 }
  });
  assert.ok(Array.from(tip).length <= 50);
  assert.doesNotMatch(tip, /(undefined|null|NaN)/);
}

const [index, buildScript, serviceWorker] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("scripts/build-vercel-static.mjs", "utf8"),
  readFile("sw.js", "utf8")
]);
for (const required of [
  "ai-tip-ticker", "ai-tip-marquee", "daily-briefing.js",
  "api.open-meteo.com", "geocoding-api.open-meteo.com",
  "searchFestival2", "loadDailyBriefing",
  "--ai-ticker-gap", "syncDailyTipSpacing", "ResizeObserver",
  "matchMedia(\"(max-width: 639px)\")", "padding-right:52px",
  "apparent_temperature", "relative_humidity_2m",
  "background: #fdcfd4", "border: 1px solid #e98b96",
  "meatos_daily_tip_v4_", "buildBriefing", "dataset.googleTrends", "dataset.instagramSearch",
  "sanitation-status-button--pending", "sanitation-status-button--complete",
  "축산물 일일 위생 점검표", "축산물 월별 위생 점검표"
]) {
  assert.ok(index.includes(required), `dashboard missing ${required}`);
}
assert.ok(buildScript.includes("src/data/daily-briefing.js"));
assert.ok(serviceWorker.includes("src/data/daily-briefing.js"));

console.log("Daily weather, neighborhood, event-ready meat briefing tests passed.");
