(function attachDailyBriefing(global) {
  "use strict";

  const WEATHER_LABELS = Object.freeze({
    0:"맑음", 1:"대체로 맑음", 2:"구름 조금", 3:"흐림",
    45:"안개", 48:"짙은 안개", 51:"약한 이슬비", 53:"이슬비", 55:"강한 이슬비",
    61:"약한 비", 63:"비", 65:"강한 비", 66:"어는 비", 67:"강한 어는 비",
    71:"약한 눈", 73:"눈", 75:"강한 눈", 77:"싸락눈",
    80:"한때 소나기", 81:"소나기", 82:"강한 소나기",
    85:"눈 소나기", 86:"강한 눈 소나기", 95:"천둥번개", 96:"우박 동반 비", 99:"강한 우박비"
  });

  // 공개 근거와 검색 경로를 분리한다. 검색 서비스의 순위를 무단 수집하지 않고,
  // 날씨·시간대·지역으로 고른 메뉴를 당일 검색 결과에서 바로 검증할 수 있게 한다.
  const EVIDENCE_SOURCES = Object.freeze([
    Object.freeze({ id:"rda-cut-cooking", organization:"농촌진흥청", url:"https://www.nongsaro.go.kr", use:"축종·부위별 조리 적합성" }),
    Object.freeze({ id:"at-fis-menu-trend", organization:"한국농수산식품유통공사", url:"https://www.atfis.or.kr", use:"국내 메뉴·외식 소비 유형" }),
    Object.freeze({ id:"kma-weather-fusion", organization:"기상청", url:"https://bd.kma.go.kr", use:"기온·체감온도·습도 기반 상황 분류" }),
    Object.freeze({ id:"google-trends", organization:"Google Trends", url:"https://trends.google.com/trending?geo=KR&hl=ko", use:"대한민국 당일 검색 관심도 확인" }),
    Object.freeze({ id:"naver-recipe-search", organization:"네이버", url:"https://search.naver.com/search.naver", use:"국내 레시피·메뉴 검색 결과 확인" }),
    Object.freeze({ id:"youtube-recipe-search", organization:"YouTube", url:"https://www.youtube.com/results", use:"조리 영상·인기 메뉴 검색 결과 확인" })
  ]);

  const DAY_PARTS = Object.freeze({
    morning:Object.freeze({ label:"오전", species:"pork", speciesLabel:"돼지" }),
    afternoon:Object.freeze({ label:"오후", species:"beef", speciesLabel:"소" }),
    evening:Object.freeze({ label:"저녁", species:"chicken", speciesLabel:"닭" })
  });

  const SPECIES_LABELS = Object.freeze({ pork:"돼지", beef:"소", chicken:"닭" });

  const MENU_POOLS = Object.freeze({
    pork:Object.freeze({
      rainy:Object.freeze(["앞다리살 김치찌개", "목살 고추장찌개", "등갈비 묵은지찜", "돼지등뼈 감자탕"]),
      hot:Object.freeze(["앞다리살 냉채", "목살 소금구이", "돼지안심 채소볶음", "삼겹살 부추냉채"]),
      cold:Object.freeze(["돼지등뼈 감자탕", "앞다리살 고추장찌개", "목살 김치찌개", "돼지갈비찜"]),
      snow:Object.freeze(["앞다리살 김치찌개", "등갈비 묵은지찜", "돼지등뼈 감자탕", "목살 수육"]),
      weekend:Object.freeze(["삼겹살 한판구이", "목살 숯불구이", "돼지갈비 양념구이", "등갈비 바비큐"]),
      spring:Object.freeze(["미나리 삼겹살구이", "목살 달래간장구이", "앞다리살 봄나물볶음", "돼지안심 채소구이"]),
      summer:Object.freeze(["목살 소금구이", "앞다리살 냉채", "삼겹살 부추냉채", "돼지안심 채소볶음"]),
      autumn:Object.freeze(["돼지갈비찜", "목살 배추찜", "앞다리살 제육볶음", "등갈비 버섯찜"]),
      winter:Object.freeze(["돼지등뼈 감자탕", "등갈비 묵은지찜", "앞다리살 김치찌개", "목살 수육"]),
      kimchi:Object.freeze(["앞다리살 보쌈", "삼겹살 수육", "목살 수육", "돼지갈비 김치찜"]),
      mild:Object.freeze(["앞다리살 제육볶음", "목살 간장구이", "돼지갈비찜", "삼겹살 채소구이"])
    }),
    beef:Object.freeze({
      rainy:Object.freeze(["양지 소고기뭇국", "사태 된장전골", "소고기 육개장", "우목심 버섯전골"]),
      hot:Object.freeze(["차돌박이 숙주볶음", "등심 채소구이", "우삼겹 부추냉채", "소고기 오이냉채"]),
      cold:Object.freeze(["사태 수육전골", "양지 소고기뭇국", "소갈비찜", "우목심 샤브전골"]),
      snow:Object.freeze(["사태 곰탕", "소갈비찜", "양지 얼큰전골", "소고기 육개장"]),
      weekend:Object.freeze(["LA갈비 구이", "소고기 모둠구이", "차돌박이 채소구이", "등심 스테이크구이"]),
      spring:Object.freeze(["소고기 봄나물볶음", "차돌박이 미나리구이", "우목심 달래전골", "등심 채소구이"]),
      summer:Object.freeze(["차돌박이 숙주볶음", "등심 채소볶음", "우삼겹 부추냉채", "소고기 오이냉채"]),
      autumn:Object.freeze(["소고기 버섯불고기", "사태 장조림", "우목심 버섯전골", "소갈비찜"]),
      winter:Object.freeze(["양지 소고기뭇국", "사태 수육전골", "소갈비찜", "소고기 육개장"]),
      kimchi:Object.freeze(["양지 김치전골", "소갈비 김치찜", "우목심 배추전골", "차돌박이 김치볶음"]),
      mild:Object.freeze(["소고기 불고기", "사태 장조림", "등심 채소볶음", "우목심 샤브전골"])
    }),
    chicken:Object.freeze({
      rainy:Object.freeze(["닭다리살 김치찌개", "닭고기 얼큰전골", "닭갈비 국물볶음", "닭안심 채소찜"]),
      hot:Object.freeze(["닭가슴살 초계무침", "닭다리살 채소구이", "닭안심 냉채", "닭갈비 채소볶음"]),
      cold:Object.freeze(["닭고기 백숙", "닭다리살 매운찜", "닭고기 버섯전골", "닭갈비 철판볶음"]),
      snow:Object.freeze(["닭고기 백숙", "닭다리살 간장찜", "닭고기 얼큰전골", "닭갈비 철판볶음"]),
      weekend:Object.freeze(["닭갈비 철판볶음", "닭다리살 바비큐", "닭고기 소금구이", "닭안심 꼬치구이"]),
      spring:Object.freeze(["닭가슴살 봄나물무침", "닭다리살 달래구이", "닭안심 채소볶음", "닭갈비 미나리볶음"]),
      summer:Object.freeze(["닭가슴살 초계무침", "닭다리살 채소구이", "닭안심 냉채", "닭갈비 채소볶음"]),
      autumn:Object.freeze(["닭고기 버섯전골", "닭갈비 볶음", "닭다리살 간장찜", "닭안심 장조림"]),
      winter:Object.freeze(["닭고기 백숙", "닭다리살 매운찜", "닭고기 버섯전골", "닭갈비 철판볶음"]),
      kimchi:Object.freeze(["닭다리살 김치찜", "닭갈비 김치볶음", "닭고기 김치전골", "닭안심 묵은지찜"]),
      mild:Object.freeze(["닭다리살 간장볶음", "닭갈비 철판볶음", "닭안심 채소구이", "닭가슴살 장조림"])
    })
  });

  function hash(value) {
    return Array.from(String(value || "")).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
  }

  function clip(value, maximum = 50) {
    const chars = Array.from(String(value || "").replace(/\s+/g, " ").trim());
    return chars.length <= maximum ? chars.join("") : `${chars.slice(0, maximum - 1).join("")}…`;
  }

  function extractRegion(address) {
    const tokens = String(address || "").replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
    const district = tokens.find((token) => /(시|군|구)$/.test(token) && !/(특별시|광역시|특별자치시)$/.test(token));
    const neighborhood = tokens.find((token) => /(읍|면|동)$/.test(token));
    return district || neighborhood || tokens.find((token) => /(시|군|구|읍|면|동)$/.test(token)) || "";
  }

  function weatherKind(weather) {
    const code = Number(weather?.code);
    const temperature = Number(weather?.temperature);
    const apparentTemperature = Number(weather?.apparentTemperature);
    const humidity = Number(weather?.humidity);
    const precipitation = Number(weather?.precipitation);
    if ([71,73,75,77,85,86].includes(code)) return "snow";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || precipitation > 0) return "rainy";
    if ((Number.isFinite(apparentTemperature) && apparentTemperature >= 29) ||
        (Number.isFinite(temperature) && temperature >= 28) ||
        (Number.isFinite(temperature) && temperature >= 26 && Number.isFinite(humidity) && humidity >= 80)) return "hot";
    if ((Number.isFinite(apparentTemperature) && apparentTemperature <= 8) ||
        (Number.isFinite(temperature) && temperature <= 8)) return "cold";
    return "mild";
  }

  function calendarContext(date) {
    const target = date instanceof Date ? date : new Date(date || Date.now());
    const month = target.getMonth() + 1;
    const day = target.getDay();
    if (day === 0 || day === 6) return "주말";
    if (month >= 6 && month <= 8) return "여름철";
    if (month === 11) return "김장철";
    if (month === 12 || month <= 2) return "겨울철";
    return "";
  }

  function seasonKind(date) {
    const target = date instanceof Date ? date : new Date(date || Date.now());
    const month = target.getMonth() + 1;
    if (month === 11) return "kimchi";
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 10) return "autumn";
    return "winter";
  }

  function dayPart(date) {
    const target = date instanceof Date ? date : new Date(date || Date.now());
    const hour = target.getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  }

  function regionKind(region) {
    const value = String(region || "");
    if (/(부산|인천|강릉|속초|동해|삼척|여수|목포|제주|포항|울산|거제|통영|해운대|영도|기장|남동구|연수구)/.test(value)) return "coastal";
    if (/(서울|수원|성남|안산|고양|대전|대구|광주|부천|용인)/.test(value)) return "urban";
    if (/(군|읍|면)$/.test(value)) return "local";
    return "general";
  }

  function menuContext({ date, weather, eventName }) {
    const kind = weatherKind(weather);
    if (eventName) return "weekend";
    if (kind !== "mild") return kind;
    if (calendarContext(date) === "주말") return "weekend";
    return seasonKind(date);
  }

  function recommendationScore({ menu, position, context, partKey, regionType, eventName }) {
    let score = 100 - (position * 3);
    const contextAffinity = {
      hot:/(냉채|무침|소금구이|채소)/,
      rainy:/(찌개|전골|찜|볶음)/,
      cold:/(찌개|전골|탕|곰탕|감자탕|백숙)/,
      snow:/(찌개|전골|탕|곰탕|감자탕|백숙)/,
      weekend:/(구이|바비큐|스테이크|수육|보쌈)/,
      spring:/(미나리|달래|봄나물|채소)/,
      summer:/(냉채|무침|소금구이|채소)/,
      autumn:/(버섯|구이|불고기|찜)/,
      winter:/(찌개|전골|탕|곰탕|감자탕|백숙)/,
      kimchi:/(김치|수육|보쌈)/,
      mild:/(구이|볶음|불고기|찜)/
    };
    const partAffinity = {
      morning:/(찌개|국|탕|백숙|곰탕)/,
      afternoon:/(구이|볶음|불고기|냉채|무침)/,
      evening:/(구이|찜|전골|수육|보쌈|바비큐)/
    };
    if (contextAffinity[context]?.test(menu)) score += 24;
    if (partAffinity[partKey]?.test(menu)) score += 12;
    if (eventName && /(구이|바비큐|수육|보쌈|전골)/.test(menu)) score += 8;
    if (regionType === "urban" && /(구이|볶음|스테이크|냉채)/.test(menu)) score += 4;
    if (regionType === "local" && /(찌개|탕|수육|보쌈)/.test(menu)) score += 4;
    return score;
  }

  function selectRecommendation({ date, region, weather, eventName } = {}) {
    const target = date instanceof Date ? date : new Date(date || Date.now());
    const partKey = dayPart(target);
    const part = DAY_PARTS[partKey];
    const context = menuContext({ date:target, weather, eventName });
    const dateKey = `${target.getFullYear()}-${target.getMonth() + 1}-${target.getDate()}`;
    const localType = regionKind(region);
    const candidates = Object.entries(MENU_POOLS).flatMap(([species, pools]) => {
      const pool = pools[context] || pools.mild;
      return pool.map((menu, position) => ({
        menu,
        species,
        score:recommendationScore({ menu, position, context, partKey, regionType:localType, eventName }),
        tieBreak:hash(`${dateKey}|${partKey}|${region}|${localType}|${weather?.code}|${eventName}|${menu}`)
      }));
    });
    candidates.sort((left, right) => right.score - left.score || right.tieBreak - left.tieBreak);
    const best = candidates[0];
    return Object.freeze({ menu:best.menu, context, dayPart:partKey, dayPartLabel:part.label, species:best.species, speciesLabel:SPECIES_LABELS[best.species], regionKind:localType, recommendationScore:best.score });
  }

  function selectMenu(input) {
    return selectRecommendation(input).menu;
  }

  function subjectParticle(value) {
    const last = Array.from(String(value || "")).at(-1) || "";
    const code = last.charCodeAt(0);
    const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
    return hasBatchim ? "이" : "가";
  }

  function trendSearchUrls(menu, region) {
    const query = [region, menu, "레시피"].filter(Boolean).join(" ");
    const encoded = encodeURIComponent(query);
    const trendQuery = encodeURIComponent(menu || "고기요리");
    const instagramTag = encodeURIComponent(String(menu || "고기요리").replace(/\s+/g, ""));
    return Object.freeze({
      googleTrends:`https://trends.google.com/trends/explore?geo=KR&q=${trendQuery}`,
      google:`https://www.google.com/search?q=${encoded}`,
      naver:`https://search.naver.com/search.naver?query=${encoded}`,
      youtube:`https://www.youtube.com/results?search_query=${encoded}`,
      instagram:`https://www.instagram.com/explore/tags/${instagramTag}/`
    });
  }

  function buildBriefing(input = {}) {
    const date = input.date instanceof Date ? input.date : new Date(input.date || Date.now());
    const region = String(input.region || "").trim() || "우리 동네";
    const weather = input.weather || {};
    const recommendation = selectRecommendation({ date, region, weather, eventName:input.eventName });
    const temperature = Number(weather.temperature);
    const humidity = Number(weather.humidity);
    const weatherLabel = WEATHER_LABELS[Number(weather.code)] || weather.label || "오늘 날씨";
    const weatherBits = [
      Number.isFinite(temperature) ? `${Math.round(temperature)}℃` : "",
      weatherLabel,
      Number.isFinite(humidity) ? `습도${Math.round(humidity)}%` : ""
    ].filter(Boolean).join("·");
    const eventName = String(input.eventName || "").trim();
    const contextText = eventName ? clip(eventName, 10) : weatherBits;
    const message = `✨ ${recommendation.dayPartLabel} AI 특선 · ${region} ${contextText} · ${recommendation.menu}`;
    return Object.freeze({ ...recommendation, message:clip(message, 50), searchUrls:trendSearchUrls(recommendation.menu, region) });
  }

  function buildTip(input = {}) {
    return buildBriefing(input).message;
  }

  global.MEATOS_DAILY_BRIEFING = Object.freeze({
    WEATHER_LABELS,
    EVIDENCE_SOURCES,
    DAY_PARTS,
    SPECIES_LABELS,
    MENU_POOLS,
    clip,
    extractRegion,
    weatherKind,
    calendarContext,
    seasonKind,
    dayPart,
    regionKind,
    menuContext,
    selectRecommendation,
    selectMenu,
    subjectParticle,
    trendSearchUrls,
    buildBriefing,
    buildTip
  });
})(globalThis);
