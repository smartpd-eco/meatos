(function attachSanitationScoring(global) {
  "use strict";

  const RATING_POINTS = Object.freeze({ 1: 10, 2: 5, 3: 1 });
  const RATING_LABELS = Object.freeze({
    1: "매우 잘됨",
    2: "보통",
    3: "불량"
  });

  const ITEMS = Object.freeze([
    { id: "personal_uniform", group: "개인위생(공통)", short: "위생복·액세서리", text: "위생복 착용 및 액세서리 제거 상태" },
    { id: "personal_health", group: "개인위생(공통)", short: "건강·외상 상태", text: "전염성 질병(감기, 피부병) 및 외상 미감염 상태" },
    { id: "pre_tools", group: "작업 전", short: "장비·도구 위생", text: "식육과 접촉되는 장비·도구 등의 위생 상태" },
    { id: "pre_facility", group: "작업 전", short: "영업장 청결", text: "영업장 내 바닥·벽·천장·화장실 등의 청결 유지" },
    { id: "pre_temperature", group: "작업 전", short: "냉장·냉동 온도", text: "냉장·냉동실 적정 온도(냉장 5℃ 이하, 냉동 -18℃ 이하) 유지 및 청결 상태" },
    { id: "pre_documents", group: "작업 전", short: "증명서 비치", text: "도축검사증명서·축산물등급판정서 등의 비치 상태" },
    { id: "during_tools", group: "작업 중", short: "수시 세척", text: "식육과 접촉되는 장비·도구 등의 수시 세척 상태" },
    { id: "during_behavior", group: "작업 중", short: "금지행위 준수", text: "판매 중 흡연·음식물 섭취·껌 씹기 금지 준수 상태" },
    { id: "after_tools", group: "작업 후", short: "세척·소독", text: "작업 중 사용한 장비·도구 등의 세척·소독 상태" },
    { id: "after_facility", group: "작업 후", short: "작업장 청소", text: "바닥·배수구·벽 등 작업장 내부 청소 상태" }
  ]);

  const FRIENDLY_SCORE_MESSAGES = Object.freeze({
    incomplete:Object.freeze([
      "아직 확인할 항목이 남았어요. 천천히 마무리해 주세요.",
      "조금만 더 살펴보면 오늘 점검이 완성돼요.",
      "빠뜨린 곳이 없는지 남은 항목을 함께 확인해 볼까요?",
      "거의 다 왔어요. 미평가 항목까지 확인해 주세요.",
      "오늘의 위생 기록, 남은 항목만 채우면 든든해집니다."
    ]),
    excellent:Object.freeze([
      "오늘도 아주 깔끔해요. 이 좋은 흐름을 이어가세요.",
      "세심하게 잘 챙기셨어요. 지금 상태면 마음이 놓입니다.",
      "작업 전부터 마무리까지 아주 안정적으로 관리됐어요.",
      "오늘 점검은 훌륭해요. 작은 변화만 계속 기록해 주세요.",
      "매장 위생이 반듯하게 유지되고 있어요. 정말 좋습니다."
    ]),
    good:Object.freeze([
      "좋은 상태예요. 작은 부분 하나만 더 살피면 더 든든해요.",
      "오늘도 안정적이에요. 보통 항목만 가볍게 챙겨볼까요?",
      "기본 관리가 잘 되고 있어요. 이 흐름을 꾸준히 이어가세요.",
      "80점 이상을 잘 지켰어요. 내일도 편안하게 이어가면 됩니다.",
      "전체적으로 좋아요. 표시된 항목만 한 번 더 확인해 주세요."
    ]),
    caution:Object.freeze([
      "조금만 손보면 80점에 닿아요. 표시된 곳부터 챙겨볼까요?",
      "오늘 발견해서 다행이에요. 낮은 항목부터 차근차근 정리해요.",
      "몇 곳만 더 챙기면 훨씬 좋아져요. 우선순위부터 확인하세요.",
      "바쁜 날일수록 기본이 힘이 됩니다. 부족한 곳부터 보완해요.",
      "지금 확인한 내용이 내일의 개선점이에요. 하나씩 정리해 봐요."
    ]),
    urgent:Object.freeze([
      "오늘은 잠깐 멈추고 불량 항목부터 정리한 뒤 다시 확인해 주세요.",
      "안전을 위해 낮은 항목을 먼저 바로잡고 작업을 이어가 주세요.",
      "괜찮아요, 지금 발견한 게 중요해요. 원인부터 차분히 정리해요.",
      "현재는 즉시 보완이 필요해요. 조치 후 다시 점검해 주세요.",
      "고객과 작업자를 위해 부족한 부분을 먼저 안전하게 정리해요."
    ])
  });

  function toRating(value) {
    const rating = Number(value);
    return RATING_POINTS[rating] ? rating : null;
  }

  function scoreItems(evaluations) {
    const source = evaluations && typeof evaluations === "object" ? evaluations : {};
    return ITEMS.map((item) => {
      const raw = Array.isArray(source)
        ? source.find((entry) => entry && entry.id === item.id)?.rating
        : source[item.id]?.rating ?? source[item.id];
      const rating = toRating(raw);
      return {
        ...item,
        rating,
        label: rating ? RATING_LABELS[rating] : "미평가",
        points: rating ? RATING_POINTS[rating] : 0
      };
    });
  }

  function calculate(evaluations) {
    const items = scoreItems(evaluations);
    const completed = items.filter((item) => item.rating).length;
    const total = items.reduce((sum, item) => sum + item.points, 0);
    return {
      items,
      completed,
      remaining: ITEMS.length - completed,
      total,
      maximum: 100,
      isComplete: completed === ITEMS.length,
      targetMet: completed === ITEMS.length && total >= 80
    };
  }

  function messageIndex(seed, total) {
    return Array.from(`${seed || ""}:${total}`).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  }

  function scoreMessage(total, isComplete, seed) {
    const group = !isComplete
      ? "incomplete"
      : total >= 90
        ? "excellent"
        : total >= 80
          ? "good"
          : total >= 60
            ? "caution"
            : "urgent";
    return FRIENDLY_SCORE_MESSAGES[group][messageIndex(seed, total)];
  }

  function temperatureIssues(fridgeTemp, freezerTemp) {
    const issues = [];
    const fridge = fridgeTemp === "" || fridgeTemp == null ? null : Number(fridgeTemp);
    const freezer = freezerTemp === "" || freezerTemp == null ? null : Number(freezerTemp);
    if (Number.isFinite(fridge) && fridge > 5) issues.push(`냉장실 ${fridge}℃: 5℃ 이하로 조정`);
    if (Number.isFinite(freezer) && freezer > -18) issues.push(`냉동실 ${freezer}℃: -18℃ 이하로 조정`);
    return issues;
  }

  function dailyAdvice(evaluations, temperatures) {
    const result = calculate(evaluations);
    if (!result.isComplete) return `아직 ${result.remaining}개 항목이 남았어요. 빠뜨린 곳 없이 천천히 확인해 주세요.`;
    const bad = result.items.filter((item) => item.rating === 3);
    const normal = result.items.filter((item) => item.rating === 2);
    const temp = temperatureIssues(temperatures?.fridge, temperatures?.freezer);
    const messages = [];
    if (bad.length) messages.push(`먼저 챙겨볼 곳: ${bad.map((item) => item.short).join(", ")}`);
    if (normal.length) messages.push(`한 번 더 살펴볼 곳: ${normal.slice(0, 3).map((item) => item.short).join(", ")}`);
    if (temp.length) messages.push(temp.join(", "));
    if (!messages.length) messages.push("오늘은 모든 항목이 편안하게 잘 관리됐어요. 지금 흐름을 이어가세요.");
    return messages.join(" · ");
  }

  function monthlyAdvice(logs) {
    const validLogs = (Array.isArray(logs) ? logs : []).filter((log) => log && log.evaluation_items);
    if (!validLogs.length) return "아직 이달 기록이 없어요. 오늘 한 번 가볍게 시작해 볼까요?";
    const itemAverages = ITEMS.map((item) => {
      const points = validLogs
        .map((log) => scoreItems(log.evaluation_items).find((entry) => entry.id === item.id)?.points)
        .filter((value) => Number.isFinite(value) && value > 0);
      return {
        ...item,
        average: points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : 0
      };
    }).sort((a, b) => a.average - b.average);
    const weak = itemAverages.filter((item) => item.average < 8).slice(0, 3);
    if (!weak.length) return "이번 달은 전반적으로 안정적이에요. 지금처럼 빠짐없이 이어가세요.";
    return `${weak.map((item) => `${item.short} ${item.average.toFixed(1)}점`).join(", ")} 항목을 먼저 살펴보면 다음 점검이 한결 편해져요.`;
  }

  global.MEATOS_SANITATION = Object.freeze({
    ITEMS,
    RATING_POINTS,
    RATING_LABELS,
    FRIENDLY_SCORE_MESSAGES,
    calculate,
    scoreItems,
    scoreMessage,
    temperatureIssues,
    dailyAdvice,
    monthlyAdvice
  });
})(globalThis);
