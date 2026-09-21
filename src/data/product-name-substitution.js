(function (global) {
  "use strict";

  const ORIGIN_LABELS = [
    "국내산", "국내", "미국산", "수입산", "수입", "호주산", "캐나다산",
    "브라질산", "덴마크산", "스페인산", "칠레산", "네덜란드산", "멕시코산"
  ];

  // 현장 OCR 오인식과 유통업계 동의어를 표준 품목명으로 치환한다.
  const SUBSTITUTIONS = Object.freeze([
    { pattern: /넥장|넹장|냉쟝/g, replacement: "냉장" },
    { pattern: /넥동|넹동|냉돔/g, replacement: "냉동" },
    { pattern: /황창|항창|황정살?|항졍/g, replacement: "항정" },
    { pattern: /삼겸/g, replacement: "삼겹" },
    { pattern: /삼겹쌀|삼겹삽/g, replacement: "삼겹살" },
    { pattern: /(?<!소|우)목심/g, replacement: "목살" },
    { pattern: /부체살/g, replacement: "부채살" },
    { pattern: /채끝살/g, replacement: "채끝" }
  ]);

  // 현장에서 같은 품목으로 통용되는 명칭을 표준 사전명으로 통합한다.
  // 한글 단어 경계를 직접 제한해 "항미전지"처럼 더 긴 별도 품목을
  // 부분 문자열만 보고 잘못 치환하지 않는다.
  const STANDARD_PRODUCT_ALIASES = Object.freeze([
    {
      dictionaryCode: "DICT-0001",
      productCode: "PROD-0001",
      standardName: "오겹살",
      category: "돼지고기",
      cut: "삼겹",
      qualifiers: ["미박"],
      // "박피 삼겹"은 반대 속성이므로 포함하지 않는다. 미박 계열 오타와
      // 삼겹 부위가 함께 있을 때만 치환해 다른 품목의 "미빅"을 건드리지 않는다.
      pattern: /(^|[\s(])(?:오겹살?|(?:미빅피|미박피|미밖피|미뱍피|미박|미빅|미밖|미백|미뱍|미)\s*(?:삼겹살?|삼겹쌀|삽겹살?))(?=$|[\s)])/g
    },
    {
      dictionaryCode: "DICT-0002",
      productCode: "PROD-0002",
      standardName: "미박 앞다리살",
      category: "돼지고기",
      cut: "앞다리살",
      qualifiers: ["미박"],
      pattern: /(^|[\s(])(?:미전지|미젼지|미전쥐|미전디|이전지|(?:미박|미밖)\s*전지|미\s*(?:앞다리|압다리|앞다라)살|(?:미박|미밖)\s*(?:앞다리|압다리|앞다라)살?|(?:앞다리|압다리|앞다라)살?\s*(?:미박|미밖))(?=$|[\s()])/g
    },
    {
      dictionaryCode: "DICT-PORK-LEG-SKIN-ON",
      productCode: "PROD-PORK-LEG-SKIN-ON",
      standardName: "미박 뒷다리살",
      category: "돼지고기",
      cut: "뒷다리",
      qualifiers: ["미박"],
      pattern: /(^|[\s(])(?:미후지|미\s*후지|미박\s*후지|미\s*뒷다리살?|미박\s*뒷다리살?)(?=$|[\s()])/g
    },
    {
      dictionaryCode: "DICT-PORK-BELLY-TWO-LAYER",
      productCode: "PROD-PORK-BELLY-TWO-LAYER",
      standardName: "이겹살",
      category: "돼지고기",
      cut: "이겹살",
      qualifiers: [],
      pattern: /(^|[\s(])이겹살?(?=$|[\s()])/g
    },
    {
      dictionaryCode: "DICT-PORK-GABURI",
      productCode: "PROD-PORK-GABURI",
      standardName: "가브리살",
      category: "돼지고기",
      cut: "가브리살",
      qualifiers: [],
      pattern: /(^|[\s(])(?:등심덧살|가브리|가브리살|가브릿살|가브리쌀|가브리삽|가브리샬|가브라살|가부리|가부리살|가비리살|까브리살)(?=$|[\s()])/g
    },
    {
      dictionaryCode: "DICT-PORK-RIB",
      productCode: "PROD-PORK-RIB",
      standardName: "돼지 갈비",
      category: "돼지고기",
      cut: "갈비",
      qualifiers: [],
      pattern: /(^|[\s(])(?:돼지\s*갈비살?|돈\s*갈비살?)(?=$|[\s()])/g
    },
    {
      dictionaryCode: "DICT-PORK-BELLY-SKINLESS",
      productCode: "PROD-PORK-BELLY-SKINLESS",
      standardName: "삼겹살",
      category: "돼지고기",
      cut: "삼겹",
      qualifiers: [],
      pattern: /(^|[\s(])(?:박피|박펴|박파|박비|빅피|밖피)\s*(?:삼겹살?|삼겹쌀|삽겹살?)(?=$|[\s()])/g
    }
  ]);

  // 품목명을 재고 분류 축으로 변환한다. 긴/구체적인 부위를 먼저 검사해야
  // "우삼겹"이 "삼겹"으로 잘못 분류되지 않는다.
  const CUT_RULES = Object.freeze([
    { pattern: /우삼겹살?|소삼겹살?/, cut: "우삼겹", category: "소고기" },
    { pattern: /우목심|우목살|소목심|소목살/, cut: "목심", category: "소고기" },
    { pattern: /차돌박이/, cut: "차돌박이", category: "소고기" },
    { pattern: /도가니/, cut: "도가니", category: "소고기" },
    { pattern: /부채살/, cut: "부채살", category: "소고기" },
    { pattern: /채끝/, cut: "채끝", category: "소고기" },
    { pattern: /안심/, cut: "안심", category: "소고기" },
    { pattern: /등심/, cut: "등심", category: "소고기" },
    { pattern: /사태/, cut: "사태", category: "소고기" },
    { pattern: /등뼈/, cut: "등뼈", category: "돼지고기" },
    { pattern: /등갈비/, cut: "등갈비", category: "돼지고기" },
    { pattern: /쪽갈비/, cut: "쪽갈비", category: "돼지고기" },
    { pattern: /돼지갈비|돈갈비/, cut: "갈비", category: "돼지고기" },
    { pattern: /갈비/, cut: "갈비", category: "소고기" },
    { pattern: /우족/, cut: "우족", category: "소고기" },
    { pattern: /사골/, cut: "사골", category: "소고기" },
    { pattern: /스지/, cut: "스지", category: "소고기" },
    { pattern: /미박\s*삼겹/, cut: "삼겹", category: "돼지고기", qualifiers: ["미박"] },
    { pattern: /오겹/, cut: "삼겹", category: "돼지고기", qualifiers: ["미박"] },
    { pattern: /미박\s*앞다리살?/, cut: "앞다리살", category: "돼지고기", qualifiers: ["미박"] },
    { pattern: /미박\s*뒷다리살?/, cut: "뒷다리", category: "돼지고기", qualifiers: ["미박"] },
    { pattern: /이겹살?/, cut: "이겹살", category: "돼지고기" },
    { pattern: /삼겹/, cut: "삼겹", category: "돼지고기" },
    { pattern: /목살/, cut: "목살", category: "돼지고기" },
    { pattern: /항정/, cut: "항정", category: "돼지고기" },
    { pattern: /가브리살|가브릿살|가브리살살/, cut: "가브리살", category: "돼지고기" },
    { pattern: /갈매기살?/, cut: "갈매기살", category: "돼지고기" },
    { pattern: /앞다리/, cut: "앞다리", category: "돼지고기" },
    { pattern: /뒷다리/, cut: "뒷다리", category: "돼지고기" },
    { pattern: /볼살|뽈살/, cut: "볼살", category: "돼지고기" },
    { pattern: /닭가슴살|계육가슴살/, cut: "가슴살", category: "닭고기" },
    { pattern: /닭다리살|계육다리살/, cut: "다리살", category: "닭고기" }
  ]);

  const FUZZY_CUT_DICTIONARY = Object.freeze([
    {
      aliases: ["삼겹", "삼겹살", "삼겹쌀", "삼겹삽"],
      cut: "삼겹",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-BELLY-SKINLESS",
      productCode: "PROD-PORK-BELLY-SKINLESS"
    },
    {
      aliases: ["이겹", "이겹살", "이겹쌀", "이겹삽"],
      cut: "이겹살",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-BELLY-TWO-LAYER",
      productCode: "PROD-PORK-BELLY-TWO-LAYER"
    },
    { aliases: ["목살", "목쌀", "목삽"], cut: "목살", category: "돼지고기" },
    { aliases: ["항정", "항졍"], cut: "항정", category: "돼지고기" },
    {
      aliases: [
        "가브리살", "가브리", "등심덧살", "가브릿살", "가브리살살",
        "가브리쌀", "가브리삽", "가브리샬", "가브라살", "가부리살", "가부리", "가비리살", "까브리살"
      ],
      cut: "가브리살",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-GABURI",
      productCode: "PROD-PORK-GABURI"
    },
    { aliases: ["갈매기살", "갈매기", "갈매기삽", "갈매기쌀"], cut: "갈매기살", category: "돼지고기", dictionaryCode: "DAESAN-22E90F9F530500B3" },
    { aliases: ["앞다리", "앞다리살", "전지", "압다리", "압다리살", "앞다라", "앞다라살", "앞다리삭"], cut: "앞다리", category: "돼지고기" },
    { aliases: ["뒷다리", "뒷다리살", "뒷다라", "뒷다라살", "뒷다리삭", "후지"], cut: "뒷다리", category: "돼지고기" },
    { aliases: ["등뼈", "돼지등뼈", "돈등뼈", "돈뼈"], cut: "등뼈", category: "돼지고기", dictionaryCode: "DICT-PORK-BACK-BONE", productCode: "PROD-PORK-BACK-BONE" },
    { aliases: ["볼살", "뽈살", "돼지볼살", "돈볼살"], cut: "볼살", category: "돼지고기", dictionaryCode: "DICT-PORK-CHEEK", productCode: "PROD-PORK-CHEEK" },
    { aliases: ["우삼겹", "우삼겹살", "소삼겹", "소삼겹살"], cut: "우삼겹", category: "소고기", dictionaryCode: "DICT-BEEF-SHORT-PLATE", productCode: "PROD-BEEF-SHORT-PLATE" },
    { aliases: ["우목심", "우목살", "소목심", "소목살"], cut: "목심", category: "소고기", dictionaryCode: "DICT-BEEF-CHUCK", productCode: "PROD-BEEF-CHUCK" },
    { aliases: ["차돌박이", "차돌바기", "차돌박히", "우차돌"], cut: "차돌박이", category: "소고기", dictionaryCode: "DAESAN-F309B87BA29496EC" },
    { aliases: ["도가니", "소도가니", "우도가니", "도가니뼈"], cut: "도가니", category: "소고기", dictionaryCode: "DAESAN-85AED3CE1E08F569" },
    { aliases: ["부채살", "부쳬살", "부체살", "부채삭"], cut: "부채살", category: "소고기" },
    { aliases: ["채끝", "채끝살", "소채끝", "스트립로인"], cut: "채끝", category: "소고기", dictionaryCode: "DAESAN-6C63251DBE395A0E" },
    { aliases: ["안심", "소안심", "우안심", "텐더로인"], cut: "안심", category: "소고기", dictionaryCode: "DICT-0006", productCode: "PROD-0006" },
    { aliases: ["등심", "소등심", "우등심", "등심살"], cut: "등심", category: "소고기", dictionaryCode: "DICT-0005", productCode: "PROD-0005" },
    { aliases: ["사태", "소사태", "우사태", "사태살"], cut: "사태", category: "소고기", dictionaryCode: "DAESAN-04F0CA79C528A779" },
    {
      aliases: ["갈비", "갈비살", "갈빗살", "갈비쌀", "갈삐", "소갈비", "우갈비", "한우갈비"],
      cut: "갈비",
      category: "소고기",
      dictionaryCode: "DICT-0003",
      productCode: "PROD-0003"
    },
    {
      aliases: ["돼지갈비", "돼지갈비살", "돈갈비", "돈갈비살"],
      cut: "갈비",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-RIB",
      productCode: "PROD-PORK-RIB"
    },
    {
      aliases: ["등갈비", "등갈비살", "등갈삐", "로인립"],
      cut: "등갈비",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-BACK-RIB",
      productCode: "PROD-PORK-BACK-RIB"
    },
    {
      aliases: ["쪽갈비", "쪽갈비살", "쪽갈삐", "스페어립"],
      cut: "쪽갈비",
      category: "돼지고기",
      dictionaryCode: "DICT-PORK-SIDE-RIB",
      productCode: "PROD-PORK-SIDE-RIB"
    },
    { aliases: ["우족", "소족", "쇠족", "소발"], cut: "우족", category: "소고기", dictionaryCode: "DAESAN-5556EB246FDF159F" },
    { aliases: ["사골", "소사골", "우사골", "사골뼈"], cut: "사골", category: "소고기", dictionaryCode: "DAESAN-87492A06F2D19472" },
    { aliases: ["스지", "소힘줄", "쇠심줄", "우근"], cut: "스지", category: "소고기", dictionaryCode: "DAESAN-CC088CCCACD6750F" },
    { aliases: ["닭가슴살", "계육가슴살", "가슴살", "닭가슴설", "가슴설"], cut: "가슴살", category: "닭고기" },
    { aliases: ["닭다리살", "계육다리살", "다리살", "닭다리삭", "다리삭"], cut: "다리살", category: "닭고기" }
  ]);

  const MEANINGFUL_QUALIFIERS = Object.freeze([
    "미박", "박피", "무뼈", "유뼈", "뼈", "껍질", "무항생제",
    "한우", "육우", "젖소", "암소", "거세", "1++", "1+", "1등급", "2등급", "3등급"
  ]);

  const LOCAL_STORAGE_PREFIX = "meatos.product-name-learning.v1.";
  const LEARNED_MIN_CONFIDENCE = 90;
  const FUZZY_MIN_MARGIN = 0.06;
  const AUTO_SUBSTITUTE_MIN_CONFIDENCE = 65;
  const REVIEW_CONFIDENCE_MAX = 80;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CHILLED_SHELF_LIFE_DAYS = Object.freeze({
    "소고기": Object.freeze({ "등심": 14, "안심": 12, "채끝": 14, "갈비": 14, "양지": 12, "전부위": 12 }),
    "돼지고기": Object.freeze({ "삼겹": 14, "목살": 14, "앞다리": 12, "뒷다리": 12, "갈비": 12, "미후지": 10, "전부위": 10 }),
    "닭고기": Object.freeze({ "전부위": 7 })
  });
  const learnedPatterns = new Map();
  const supplierDirectory = new Map();
  const supplierNames = new Map();

  function canonicalize(value, context = {}) {
    let name = normalizeKnownOcrMisreads(value);
    if (!name) return "(미인식)";
    name = normalizeSupplierProductOcr(name, context);

    const learned = findLearnedPattern(name, context);
    if (learned) name = cleanDisplayText(learned.targetPattern);

    for (const rule of SUBSTITUTIONS) {
      name = name.replace(rule.pattern, rule.replacement);
    }

    for (const origin of ORIGIN_LABELS) {
      const escaped = escapeRegExp(origin);
      name = name
        .replace(new RegExp("\\(\\s*" + escaped + "\\s*\\)", "g"), " ")
        .replace(new RegExp("(^|\\s)" + escaped + "(?=\\s|$)", "g"), " ");
    }

    name = name
      .replace(/\s+/g, " ")
      .replace(/\s*\(\s*/g, "(")
      .replace(/\s*\)\s*/g, ")")
      .replace(/^(냉장|냉동)\s*/g, "$1 ")
      .trim();

    name = applyStandardProductAliases(name);
    return name || "(미인식)";
  }

  function normalizeSupplierProductOcr(value, context = {}) {
    void context;
    // `마후지`는 미전지와 미후지 중 어느 쪽인지 원문 확인이 필요한 OCR
    // 결과다. 공급처만으로 앞다리로 확정하지 않고 suggest()의 회색 후보로
    // 보내야 실제 미후지를 잘못된 앞다리 재고로 저장하지 않는다.
    return cleanDisplayText(value);
  }

  function applyStandardProductAliases(value) {
    let name = normalizeContextualProductTypos(cleanDisplayText(value));
    for (const alias of STANDARD_PRODUCT_ALIASES) {
      alias.pattern.lastIndex = 0;
      name = name.replace(alias.pattern, "$1" + alias.standardName);
    }
    return cleanDisplayText(name);
  }

  function normalizeContextualProductTypos(value) {
    let name = cleanDisplayText(value);
    name = name
      .replace(/(^|[\s(])(?:미박\s*후지|미\s*후지|미후지)(?=$|[\s()])/g, "$1미박 뒷다리살")
      .replace(
        /(^|[\s(])미(?:빅|밖|백|뱍)(?:피)?\s*(?=(?:삼겹|앞다리|압다리|앞다라|전지|뒷다리|후지)(?:살)?(?=$|[\s()]))/g,
        "$1미박 "
      )
      .replace(
        /(^|[\s(])미\s*(?=(?:삼겹|앞다리|압다리|앞다라|전지|뒷다리|후지)(?:살)?(?=$|[\s()]))/g,
        "$1미박 "
      );
    const compactProduct = name
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, "");
    const compactStorage = compactProduct.match(/^(냉장|냉동)/)?.[1] || "";
    const compactWithoutStorage = compactStorage
      ? compactProduct.slice(compactStorage.length)
      : compactProduct;
    if (
      /^(?:미빅피|미박피|미밖피|미뱍피|미박|미빅|미밖|미백|미뱍|미)(?:삼겹|삼겸|삽겹)(?:살|쌀)?$/.test(compactWithoutStorage)
    ) {
      return [compactStorage, "오겹살"].filter(Boolean).join(" ");
    }
    if (
      /^(?:박피|박펴|박파|박비|빅피|밖피)(?:삼겹|삼겸|삽겹)(?:살|쌀)?$/.test(compactWithoutStorage)
    ) {
      return [compactStorage, "삼겹살"].filter(Boolean).join(" ");
    }
    const anchored = name.match(/^((?:냉장|냉동)\s+)?([가-힣]{1,4})\s+([가-힣]{2,6})(.*)$/);
    if (
      anchored
      && isLikelySkinOnBellyQualifier(anchored[2])
      && isLikelyBellyTerm(anchored[3])
    ) {
      name = (anchored[1] || "") + "오겹살" + (anchored[4] || "");
    }
    return name.replace(
      /(^|[\s(])([가-힣]{1,4})\s*((?:삼겹|삼겸|삽겹)(?:살|쌀)?)(?=$|[\s)])/g,
      (match, boundary, qualifier) => {
        if (!isLikelySkinOnBellyQualifier(qualifier)) return match;
        return boundary + "오겹살";
      }
    );
  }

  function isLikelyBellyTerm(value) {
    const term = cleanDisplayText(value);
    return Math.min(
      levenshteinDistance(term, "삼겹"),
      levenshteinDistance(term, "삼겹살")
    ) <= 1;
  }

  function isLikelySkinOnBellyQualifier(value) {
    const qualifier = cleanDisplayText(value);
    if (qualifier === "박피" || qualifier === "미국" || qualifier === "우") return false;
    if (qualifier === "미") return true;
    if (!/^미/.test(qualifier) || !/[박빅밖백뱍]/.test(qualifier)) return false;
    return Math.min(
      levenshteinDistance(qualifier, "미박"),
      levenshteinDistance(qualifier, "미박피")
    ) <= 1;
  }

  function configureLearnedPatterns(rows = []) {
    learnedPatterns.clear();
    supplierDirectory.clear();
    supplierNames.clear();
    mergeLearnedPatterns(rows);
    return listLearnedPatterns();
  }

  function mergeLearnedPatterns(rows = []) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const sourcePattern = cleanDisplayText(row.sourcePattern ?? row.source_pattern);
      const targetPattern = cleanDisplayText(row.targetPattern ?? row.target_pattern);
      const confidence = Number(row.confidence ?? 0);
      const successCount = Number(row.successCount ?? row.success_count ?? 0);
      const sampleCount = Number(row.sampleCount ?? row.sample_count ?? successCount);
      if (!sourcePattern || !targetPattern || confidence < LEARNED_MIN_CONFIDENCE || successCount < 1 || row.is_active === false) continue;

      const sourceKey = fingerprint(sourcePattern);
      const metadata = row.matchMetadata ?? row.match_metadata ?? {};
      const category = cleanDisplayText(row.category ?? metadata.category);
      const standardCut = cleanDisplayText(row.standardCut ?? row.standard_cut ?? metadata.standard_cut);
      const storage = cleanDisplayText(row.storage ?? metadata.storage);
      if (!sourceKey || (sourceKey === fingerprint(targetPattern) && !category && !standardCut)) continue;
      const supplierId = cleanDisplayText(row.supplierId ?? row.supplier_id);
      const supplierName = cleanDisplayText(row.supplierName ?? row.supplier_name);
      if (supplierId && supplierName) registerSupplier(supplierId, supplierName);
      const candidate = {
        sourcePattern,
        sourceKey,
        targetPattern,
        supplierId,
        supplierName,
        sourceType: cleanDisplayText(row.sourceType ?? row.source_type) || "ocr_pattern_learning",
        priority: Number(row.priority ?? (supplierId ? 300 : 100)),
        category,
        standardCut,
        storage,
        confidence,
        successCount,
        sampleCount,
        lastUsedAt: row.lastUsedAt ?? row.last_used_at ?? ""
      };
      const patternKey = learnedPatternKey(supplierId, sourceKey);
      const existing = learnedPatterns.get(patternKey);
      if (!existing) {
        learnedPatterns.set(patternKey, candidate);
        continue;
      }
      if (fingerprint(existing.targetPattern) === fingerprint(candidate.targetPattern)) {
        const preferred = learningScore(candidate) > learningScore(existing) ? candidate : existing;
        const supplemental = preferred === candidate ? existing : candidate;
        learnedPatterns.set(patternKey, {
          ...preferred,
          category: preferred.category || supplemental.category,
          standardCut: preferred.standardCut || supplemental.standardCut,
          storage: preferred.storage || supplemental.storage
        });
        continue;
      }
      if (learningScore(candidate) > learningScore(existing)) {
        learnedPatterns.set(patternKey, candidate);
      }
    }
    return listLearnedPatterns();
  }

  function recordLocalCorrection({
    tenantId,
    supplierId = "",
    supplierName = "",
    sourceText,
    targetText,
    category = "",
    standardCut = "",
    storage = "",
    dictionaryCode = "",
    productCode = "",
    confidence = 98
  }) {
    const sourcePattern = cleanDisplayText(sourceText);
    const resolvedSupplierId = resolveSupplierId({ supplierId, supplierName });
    const targetPattern = canonicalizeWithoutLearning(targetText, { supplierId: resolvedSupplierId, supplierName });
    const sourceKey = fingerprint(sourcePattern);
    if (!sourceKey || !targetPattern || sourceKey === fingerprint(targetPattern)) return null;

    const patternKey = learnedPatternKey(resolvedSupplierId, sourceKey);
    const existing = learnedPatterns.get(patternKey);
    const pattern = {
      sourcePattern,
      sourceKey,
      targetPattern,
      supplierId: resolvedSupplierId,
      supplierName: cleanDisplayText(supplierName),
      sourceType: "manual_correction",
      priority: resolvedSupplierId ? 500 : 450,
      category: cleanDisplayText(category),
      standardCut: cleanDisplayText(standardCut),
      storage: cleanDisplayText(storage),
      dictionaryCode: cleanDisplayText(dictionaryCode),
      productCode: cleanDisplayText(productCode),
      confidence: Math.max(Number(existing?.confidence ?? 0), Number(confidence) || 0),
      successCount: Number(existing?.successCount ?? 0) + 1,
      sampleCount: Number(existing?.sampleCount ?? 0) + 1,
      lastUsedAt: new Date().toISOString()
    };
    learnedPatterns.set(patternKey, pattern);
    persistLocalLearning(tenantId);
    return { ...pattern };
  }

  function loadLocalLearning(tenantId) {
    if (typeof localStorage === "undefined") return [];
    try {
      const rows = JSON.parse(localStorage.getItem(storageKey(tenantId)) || "[]");
      mergeLearnedPatterns(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async function loadRemoteLearning({ restUrl, headers, tenantId }) {
    const localRows = loadLocalLearning(tenantId);
    if (typeof fetch !== "function" || !restUrl || !tenantId) return localRows;
    try {
      const base = String(restUrl).replace(/\/+$/, "");
      const supplierQuery = "/supplier_master?tenant_id=eq." + encodeURIComponent(tenantId)
        + "&is_active=eq.true&select=id,supplier_name,supplier_code&limit=5000";
      const supplierNameAliasQuery = "/supplier_name_alias?tenant_id=eq." + encodeURIComponent(tenantId)
        + "&is_active=eq.true&verified=eq.true&confidence=gte." + LEARNED_MIN_CONFIDENCE
        + "&select=supplier_id,alias_name,normalized_alias&limit=5000";
      const patternQuery = "/ocr_pattern_learning?tenant_id=eq." + encodeURIComponent(tenantId)
        + "&pattern_type=eq.PRODUCT_NAME_SUBSTITUTION&is_active=eq.true"
        + "&confidence=gte." + LEARNED_MIN_CONFIDENCE + "&success_count=gte.1"
        + "&select=source_pattern,target_pattern,sample_count,success_count,confidence,last_used_at,is_active,supplier_id,match_metadata,approval_source"
        + "&order=confidence.desc,success_count.desc,last_used_at.desc&limit=5000";
      const supplierAliasQuery = "/supplier_alias?tenant_id=eq." + encodeURIComponent(tenantId)
        + "&is_active=eq.true&verified=eq.true&auto_apply=eq.true"
        + "&confidence=gte." + LEARNED_MIN_CONFIDENCE
        + "&select=raw_name,confidence,learning_count,last_used_at,supplier_id,product_dictionary!inner(standard_name)"
        + "&limit=5000";
      const productAliasQuery = "/product_alias?is_active=eq.true&verified=eq.true"
        + "&confidence=gte." + LEARNED_MIN_CONFIDENCE
        + "&select=raw_name,confidence,use_count,last_used_at,product_dictionary!inner(standard_name)"
        + "&limit=5000";
      const [supplierResponse, supplierNameAliasResponse, patternResponse, supplierAliasResponse, productAliasResponse] = await Promise.all([
        fetchWithTimeout(base + supplierQuery, { headers }),
        fetchWithTimeout(base + supplierNameAliasQuery, { headers }),
        fetchWithTimeout(base + patternQuery, { headers }),
        fetchWithTimeout(base + supplierAliasQuery, { headers }),
        fetchWithTimeout(base + productAliasQuery, { headers })
      ]);

      const suppliers = supplierResponse.ok ? await supplierResponse.json() : [];
      for (const supplier of Array.isArray(suppliers) ? suppliers : []) {
        registerSupplier(supplier.id, supplier.supplier_name, supplier.supplier_code);
      }
      const supplierNameAliases = supplierNameAliasResponse.ok ? await supplierNameAliasResponse.json() : [];
      for (const alias of Array.isArray(supplierNameAliases) ? supplierNameAliases : []) {
        registerSupplierAlias(alias.supplier_id, alias.alias_name, alias.normalized_alias);
      }

      const remoteRows = patternResponse.ok ? await patternResponse.json() : [];
      const supplierAliasRows = supplierAliasResponse.ok ? await supplierAliasResponse.json() : [];
      const productAliasRows = productAliasResponse.ok ? await productAliasResponse.json() : [];
      const combinedRows = [
        ...(Array.isArray(remoteRows) ? remoteRows.map((row) => ({
          ...row,
          supplier_name: supplierNameForId(row.supplier_id),
          source_type: "ocr_pattern_learning",
          sourceType: row.approval_source || "ocr_pattern_learning",
          priority: row.supplier_id ? 300 : 100
        })) : []),
        ...(Array.isArray(supplierAliasRows) ? supplierAliasRows.map((row) => ({
          source_pattern: row.raw_name,
          target_pattern: row.product_dictionary?.standard_name,
          supplier_id: row.supplier_id,
          supplier_name: supplierNameForId(row.supplier_id),
          confidence: row.confidence,
          sample_count: row.learning_count,
          success_count: row.learning_count,
          last_used_at: row.last_used_at,
          is_active: true,
          source_type: "supplier_alias",
          priority: 400
        })) : []),
        ...(Array.isArray(productAliasRows) ? productAliasRows.map((row) => ({
          source_pattern: row.raw_name,
          target_pattern: row.product_dictionary?.standard_name,
          confidence: row.confidence,
          sample_count: row.use_count,
          success_count: row.use_count,
          last_used_at: row.last_used_at,
          is_active: true,
          source_type: "product_alias",
          priority: 200
        })) : [])
      ];
      mergeLearnedPatterns(combinedRows);
      persistLocalLearning(tenantId);
      return [...localRows, ...combinedRows];
    } catch {
      return localRows;
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function learnCorrection({
    restUrl,
    headers,
    tenantId,
    storeId = "",
    supplierId = "",
    supplierName = "",
    sourceText,
    targetText,
    category = "",
    standardCut = "",
    storage = "",
    dictionaryCode = "",
    productCode = ""
  }) {
    const resolvedSupplierId = resolveSupplierId({ supplierId, supplierName });
    const pattern = recordLocalCorrection({
      tenantId,
      supplierId: resolvedSupplierId,
      supplierName,
      sourceText,
      targetText,
      category,
      standardCut,
      storage,
      dictionaryCode,
      productCode,
      confidence: 98
    });
    if (!pattern) return { learned: false, remotePersisted: false };
    if (typeof fetch !== "function" || !restUrl || !tenantId) {
      return { learned: true, remotePersisted: false, pattern };
    }

    const base = String(restUrl).replace(/\/+$/, "");
    const commonHeaders = { ...(headers || {}), "Content-Type": "application/json" };
    try {
      const confirmationResponse = await fetch(base + "/rpc/confirm_product_name_learning", {
        method: "POST",
        headers: { ...commonHeaders, Prefer: "return=representation" },
        body: JSON.stringify({
          p_tenant_id: tenantId,
          p_store_id: storeId || null,
          p_supplier_name: cleanDisplayText(supplierName) || null,
          p_source_pattern: pattern.sourcePattern,
          p_target_pattern: pattern.targetPattern,
          p_category: cleanDisplayText(category) || null,
          p_standard_cut: cleanDisplayText(standardCut) || null,
          p_storage: cleanDisplayText(storage) || null,
          p_dictionary_code: cleanDisplayText(dictionaryCode) || null,
          p_product_code: cleanDisplayText(productCode) || null,
          p_confidence: 99
        })
      });
      if (confirmationResponse.ok) {
        const promotion = await confirmationResponse.json().catch(() => null);
        return {
          learned: true,
          remotePersisted: true,
          pattern,
          promotion
        };
      }

      const lookup = "/ocr_pattern_learning?tenant_id=eq." + encodeURIComponent(tenantId)
        + "&pattern_type=eq.PRODUCT_NAME_SUBSTITUTION"
        + (resolvedSupplierId
          ? "&supplier_id=eq." + encodeURIComponent(resolvedSupplierId)
          : "&supplier_id=is.null")
        + "&source_pattern=eq." + encodeURIComponent(pattern.sourcePattern)
        + "&target_pattern=eq." + encodeURIComponent(pattern.targetPattern)
        + "&is_active=eq.true&select=id,sample_count,success_count,confidence&order=updated_at.desc&limit=1";
      const lookupResponse = await fetch(base + lookup, { headers: commonHeaders });
      const existingRows = lookupResponse.ok ? await lookupResponse.json() : [];
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      let response;

      if (existing?.id) {
        response = await fetch(base + "/ocr_pattern_learning?id=eq." + encodeURIComponent(existing.id), {
          method: "PATCH",
          headers: { ...commonHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({
            sample_count: Number(existing.sample_count || 0) + 1,
            success_count: Number(existing.success_count || 0) + 1,
            confidence: Math.max(Number(existing.confidence || 0), 98),
            last_used_at: new Date().toISOString(),
            is_active: true
          })
        });
      } else {
        response = await fetch(base + "/ocr_pattern_learning", {
          method: "POST",
          headers: { ...commonHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({
            tenant_id: tenantId,
            supplier_id: resolvedSupplierId || null,
            pattern_type: "PRODUCT_NAME_SUBSTITUTION",
            source_pattern: pattern.sourcePattern,
            target_pattern: pattern.targetPattern,
            sample_count: 1,
            success_count: 1,
            confidence: 98,
            last_used_at: new Date().toISOString(),
            is_active: true,
            match_metadata: {
              category: cleanDisplayText(category),
              standard_cut: cleanDisplayText(standardCut),
              storage: cleanDisplayText(storage),
              dictionary_code: cleanDisplayText(dictionaryCode),
              product_code: cleanDisplayText(productCode),
              learning_scope: resolvedSupplierId ? "SUPPLIER" : "BUSINESS"
            },
            approval_source: "USER_CONFIRMED_PRODUCT_NAME",
            approved_at: new Date().toISOString()
          })
        });
      }

      return { learned: true, remotePersisted: response.ok, pattern };
    } catch {
      return { learned: true, remotePersisted: false, pattern };
    }
  }

  function listLearnedPatterns() {
    return [...learnedPatterns.values()].map((row) => ({ ...row }));
  }

  function findLearnedPattern(value, context = {}) {
    const normalizedValue = normalizeKnownOcrMisreads(value);
    const sourceKey = fingerprint(normalizedValue);
    if (!sourceKey) return null;
    const supplierId = resolveSupplierId(context);
    const supplierExact = supplierId ? learnedPatterns.get(learnedPatternKey(supplierId, sourceKey)) : null;
    if (supplierExact) return { ...supplierExact, matchType: "supplier_exact", similarity: 1 };

    // 거래처 ERP가 품목명 뒤에 도축장/농협/유통사 명칭을 덧붙이는 경우가 있다.
    // 동일 공급처에서 학습한 원문이 앞부분에 완전히 일치할 때만 가장 긴 규칙을
    // 선택해, 일반 품목의 단순 접두어가 과도하게 치환되는 것을 막는다.
    if (supplierId && hasSupplierVendorTail(normalizedValue)) {
      const prefixMatches = [...learnedPatterns.values()]
        .filter((candidate) =>
          candidate.supplierId === supplierId
          && (
            candidate.sourceKey.length >= 6
            || isVerifiedShortSupplierPrefix(candidate, normalizedValue, context)
          )
          && sourceKey.length > candidate.sourceKey.length
          && sourceKey.startsWith(candidate.sourceKey)
          && sameStorageCondition(normalizedValue, candidate.sourcePattern)
        )
        .sort((left, right) =>
          right.sourceKey.length - left.sourceKey.length
          || learningScore(right) - learningScore(left)
        );
      const bestPrefix = prefixMatches[0];
      const competingPrefix = prefixMatches.find((candidate) =>
        learnedTargetIdentity(candidate) !== learnedTargetIdentity(bestPrefix)
      );
      if (
        bestPrefix
        && (!competingPrefix || bestPrefix.sourceKey.length - competingPrefix.sourceKey.length >= 3)
      ) {
        return { ...bestPrefix, matchType: "supplier_prefix", similarity: 0.97 };
      }
    }

    const globalExact = learnedPatterns.get(learnedPatternKey("", sourceKey));
    if (globalExact) return { ...globalExact, matchType: "global_exact", similarity: 1 };

    const ranked = [];
    for (const candidate of learnedPatterns.values()) {
      if (candidate.supplierId && candidate.supplierId !== supplierId) continue;
      if (!sameStorageCondition(normalizedValue, candidate.sourcePattern)) continue;
      const similarity = normalizedSimilarity(sourceKey, candidate.sourceKey);
      const comparableLength = Math.min(sourceKey.length, candidate.sourceKey.length);
      const threshold = comparableLength <= 4 ? 0.95 : (comparableLength <= 7 ? 0.86 : 0.82);
      if (similarity < threshold) continue;
      ranked.push({
        candidate,
        similarity,
        scopeBonus: candidate.supplierId ? 0.03 : 0,
        score: similarity + (candidate.supplierId ? 0.03 : 0) + Math.min(candidate.priority, 500) / 100000
      });
    }
    ranked.sort((left, right) => right.score - left.score || learningScore(right.candidate) - learningScore(left.candidate));
    const best = ranked[0];
    if (!best) return null;
    const competing = ranked.find((entry) =>
      fingerprint(entry.candidate.targetPattern) !== fingerprint(best.candidate.targetPattern)
    );
    if (competing && best.similarity - competing.similarity < FUZZY_MIN_MARGIN) return null;
    return {
      ...best.candidate,
      matchType: best.candidate.supplierId ? "supplier_fuzzy" : "global_fuzzy",
      similarity: best.similarity
    };
  }

  function hasSupplierVendorTail(value) {
    return /(주식회사|농협|엘피씨|\bLPC\b|도드람|유통회사|축산유통|미트유통)/i.test(
      cleanDisplayText(value)
    );
  }

  function isVerifiedShortSupplierPrefix(candidate, value, context = {}) {
    if (candidate.sourceKey.length < 4) return false;
    if (!["냉장", "냉동"].includes(candidate.storage)) return false;
    if (!["돼지고기", "소고기", "닭고기", "양고기", "오리고기", "염소고기"].includes(candidate.category)) {
      return false;
    }

    const inputStorage = storageFromText(value);
    if (!inputStorage || inputStorage !== candidate.storage) return false;

    const declaredCategory = normalizeCategoryHint(
      context?.category ?? context?.species ?? context?.speciesName ?? context?.species_name
    );
    if (declaredCategory && declaredCategory !== candidate.category) return false;

    const explicitCategory = explicitCategoryFromText(value);
    return !explicitCategory || explicitCategory === candidate.category;
  }

  function learnedTargetIdentity(candidate) {
    if (!candidate) return "";
    return [
      candidate.category,
      candidate.storage,
      fingerprint(candidate.targetPattern)
    ].join("|");
  }

  function normalizeCategoryHint(value) {
    const text = cleanDisplayText(value);
    if (/돼지|돈육|PIG|PORK/i.test(text)) return "돼지고기";
    if (/소고기|쇠고기|우육|한우|육우|CATTLE|BEEF/i.test(text)) return "소고기";
    if (/닭|계육|CHICKEN/i.test(text)) return "닭고기";
    if (/양고기|LAMB/i.test(text)) return "양고기";
    if (/오리|DUCK/i.test(text)) return "오리고기";
    if (/염소|GOAT/i.test(text)) return "염소고기";
    return "";
  }

  function explicitCategoryFromText(value) {
    // OCR 결과가 "우 삼 겹", "계 육 가 슴 살"처럼 글자마다
    // 띄어져도 축종 표식을 잃지 않도록 비교용 문자열만 붙여 본다.
    const text = cleanDisplayText(value).replace(/\s+/g, "");
    if (/한우|육우|우육|소고기|쇠고기|우삼겹|소삼겹|우목심|우목살|소목심|소목살|차돌|소도가니|우도가니|소채끝|소안심|우안심|소등심|우등심|소사태|우사태|소족|쇠족|소발|소사골|우사골|소힘줄|쇠심줄|우근/.test(text)) return "소고기";
    if (/돼지|돈육|돈피|돈족|돈뼈|등뼈|돈갈비|등갈비|쪽갈비|삼겹|목살|항정|가브리|등심덧살/.test(text)) {
      return "돼지고기";
    }
    if (/닭|계육/.test(text)) return "닭고기";
    if (/양고기|램/.test(text)) return "양고기";
    if (/오리/.test(text)) return "오리고기";
    if (/염소/.test(text)) return "염소고기";
    return "";
  }

  function canonicalizeWithoutLearning(value, context = {}) {
    const saved = new Map(learnedPatterns);
    learnedPatterns.clear();
    const result = canonicalize(value, context);
    learnedPatterns.clear();
    for (const [key, pattern] of saved) learnedPatterns.set(key, pattern);
    return result;
  }

  function groupKey(value, context = {}) {
    return resolve(value, context).key;
  }

  function categoryOf(value, context = {}) {
    return resolve(value, context).category;
  }

  function classify(value, context = {}) {
    const sourceName = normalizeSupplierProductOcr(normalizeKnownOcrMisreads(value), context);
    const sourceSkinState = detectPorkSkinState(sourceName);
    const learned = findLearnedPattern(sourceName, context);
    const originalCanonicalName = canonicalize(value, context);
    const declaredCategory = explicitCategoryFromText(value) || normalizeCategoryHint(
      context?.category ?? context?.species ?? context?.speciesName ?? context?.species_name
    )
      || (sourceSkinState !== "unknown" ? "돼지고기" : "");
    let standardProduct = STANDARD_PRODUCT_ALIASES.find((item) => {
      if (item.dictionaryCode === "DICT-PORK-BELLY-SKINLESS") {
        return sourceSkinState === "skinless" && originalCanonicalName.includes(item.standardName);
      }
      return originalCanonicalName.includes(item.standardName);
    });
    if (sourceSkinState === "skin_on" && /앞다리|전지/.test(originalCanonicalName + " " + (learned?.standardCut || ""))) {
      standardProduct = STANDARD_PRODUCT_ALIASES.find((item) => item.dictionaryCode === "DICT-0002") || standardProduct;
    }
    if (standardProduct && declaredCategory && standardProduct.category !== declaredCategory) {
      standardProduct = null;
    }
    const hintedCategory = learned?.category || declaredCategory || inferCategory(originalCanonicalName);
    const hintedCut = learned?.standardCut || inferCut(originalCanonicalName);
    const storageDecision = inferStorage(value, context, learned, hintedCategory, hintedCut);
    const storage = storageDecision.storage;
    const canonicalName = applyStorageLabel(originalCanonicalName, storage, storageDecision.source);
    const unsupportedSkinOnCut = detectUnsupportedSkinOnCut(sourceName);
    if (unsupportedSkinOnCut) {
      const displayName = applyStorageLabel(unsupportedSkinOnCut, storage, storageDecision.source);
      return {
        category: unsupportedSkinOnCut === "등심" || unsupportedSkinOnCut === "갈비" ? "기타" : "돼지고기",
        storage,
        storageSource: storageDecision.source,
        storageConfidence: storageDecision.confidence,
        storageAgeDays: storageDecision.ageDays,
        storageThresholdDays: storageDecision.thresholdDays,
        cut: unsupportedSkinOnCut,
        qualifiers: [],
        displayName,
        canonicalName,
        confidence: 70,
        learningMatch: null,
        learningSource: null,
        dictionaryCode: null,
        productCode: null,
        requiresReview: true,
        reviewReason: "unsupported_skin_on_cut",
        key: ["검토필요", storage, unsupportedSkinOnCut, fingerprint(sourceName)].join("|").toLowerCase()
      };
    }
    const ambiguousBellyQualifier = !learned && !standardProduct
      ? findAmbiguousBellyQualifier(canonicalName)
      : "";
    if (ambiguousBellyQualifier) {
      const reviewName = stripIncidentalLabels(canonicalName);
      return {
        category: "돼지고기",
        storage,
        storageSource: storageDecision.source,
        storageConfidence: storageDecision.confidence,
        storageAgeDays: storageDecision.ageDays,
        storageThresholdDays: storageDecision.thresholdDays,
        cut: "삼겹",
        qualifiers: [],
        displayName: reviewName,
        canonicalName,
        confidence: 55,
        learningMatch: null,
        learningSource: null,
        dictionaryCode: null,
        productCode: null,
        requiresReview: true,
        reviewReason: "unknown_belly_qualifier",
        key: ["돼지고기", storage, "검토필요", fingerprint(reviewName)].join("|")
      };
    }
    if (learned?.category && learned?.standardCut && !standardProduct) {
      const learnedStandardCut = learned.category === "돼지고기"
        ? normalizeLearnedPorkCut(learned.standardCut)
        : learned.standardCut;
      const learnedBaseName = cleanDisplayText(originalCanonicalName)
        .replace(/^(냉장|냉동)\s*/, "")
        || cleanDisplayText(learned.targetPattern)
        || learnedStandardCut;
      const learnedDisplayName = learned.category === "돼지고기"
        ? preservePorkSkinQualifier(learnedBaseName, sourceSkinState)
        : learnedBaseName;
      const displayName = applyStorageLabel(learnedDisplayName, storage, storageDecision.source);
      const learnedQualifiers = sourceSkinState === "skin_on"
        ? ["미박"]
        : (sourceSkinState === "skinless" && learnedStandardCut !== "삼겹" ? ["박피"] : []);
      return {
        category: learned.category,
        storage,
        storageSource: storageDecision.source,
        storageConfidence: storageDecision.confidence,
        storageAgeDays: storageDecision.ageDays,
        storageThresholdDays: storageDecision.thresholdDays,
        cut: learnedStandardCut,
        qualifiers: learnedQualifiers,
        displayName,
        canonicalName,
        confidence: Math.min(100, Number(learned.confidence || 0)),
        learningMatch: learned.matchType,
        learningSource: learned.sourceType,
        key: [learned.category, storage, learnedStandardCut, learnedQualifiers.join("+")].join("|").toLowerCase()
      };
    }
    const compact = canonicalName.replace(/\s+/g, "");
    let cutRule = CUT_RULES.find((rule) => rule.pattern.test(compact));
    if (standardProduct?.dictionaryCode === "DICT-PORK-GABURI") {
      cutRule = {
        cut: standardProduct.cut,
        category: standardProduct.category,
        qualifiers: standardProduct.qualifiers
      };
    }
    const fuzzyCut = findFuzzyCut(canonicalName, {
      ...context,
      category: declaredCategory || context?.category
    });
    if (fuzzyCut?.autoApply && fuzzyCut.dictionaryCode === "DICT-PORK-GABURI") {
      cutRule = {
        cut: fuzzyCut.cut,
        category: fuzzyCut.category,
        qualifiers: fuzzyCut.qualifiers
      };
    }
    const categoryHint = declaredCategory;
    if (
      cutRule
      && categoryHint
      && cutRule.category !== categoryHint
      && /^(안심|등심|사태|갈비)$/.test(cutRule.cut)
    ) {
      cutRule = { ...cutRule, category: categoryHint };
    }
    if (
      !standardProduct
      && cutRule
      && fuzzyCut
      && sourceSkinState === "unknown"
      && !fuzzyIdentityMatchesCore(canonicalName, cutRule)
    ) {
      cutRule = fuzzyCut.autoApply
        ? {
            cut: fuzzyCut.cut,
            category: fuzzyCut.category,
            qualifiers: fuzzyCut.qualifiers
          }
        : null;
    } else if (!cutRule && fuzzyCut?.autoApply) {
      cutRule = {
        cut: fuzzyCut.cut,
        category: fuzzyCut.category,
        qualifiers: fuzzyCut.qualifiers
      };
    }

    if (!cutRule) {
      const fallbackName = stripIncidentalLabels(canonicalName);
      const category = fuzzyCut?.category || inferCategory(fallbackName);
      return {
        category,
        storage,
        storageSource: storageDecision.source,
        storageConfidence: storageDecision.confidence,
        storageAgeDays: storageDecision.ageDays,
        storageThresholdDays: storageDecision.thresholdDays,
        cut: fuzzyCut?.cut || fallbackName,
        qualifiers: [],
        displayName: fallbackName,
        canonicalName,
        confidence: fuzzyCut ? Math.round(fuzzyCut.similarity * 100) : (learned ? Math.min(100, Number(learned.confidence || 0)) : 60),
        learningMatch: learned?.matchType || null,
        learningSource: learned?.sourceType || null,
        fuzzyMatch: fuzzyCut?.alias || null,
        requiresReview: Boolean(fuzzyCut),
        reviewReason: fuzzyCut ? "ambiguous_fuzzy_cut" : null,
        key: [category, storage, fuzzyCut ? "검토필요" : "", fingerprint(fallbackName)].join("|")
      };
    }

    const qualifiers = new Set(cutRule.qualifiers || []);
    for (const qualifier of MEANINGFUL_QUALIFIERS) {
      if (compact.includes(qualifier.replace(/\s+/g, ""))) qualifiers.add(qualifier);
    }
    // "무뼈"가 잡혔을 때 부분 문자열인 "뼈"는 별도 속성으로 중복 저장하지 않는다.
    if (qualifiers.has("무뼈")) qualifiers.delete("뼈");
    if (cutRule.category === "돼지고기" && sourceSkinState === "skin_on") {
      qualifiers.add("미박");
      qualifiers.delete("박피");
    } else if (cutRule.category === "돼지고기" && sourceSkinState === "skinless") {
      if (cutRule.cut === "삼겹") qualifiers.delete("박피");
      else qualifiers.add("박피");
      qualifiers.delete("미박");
    }
    const orderedQualifiers = [...qualifiers].sort((left, right) => left.localeCompare(right, "ko"));
    const classificationConfidence = standardProduct
      ? 100
      : (sourceSkinState !== "unknown" && cutRule.category === "돼지고기")
      ? 96
      : fuzzyCut
      ? Math.round(fuzzyCut.similarity * 100)
      : (learned ? Math.min(100, Number(learned.confidence || 0)) : 96);
    const reviewRange = !standardProduct
      && Boolean(fuzzyCut)
      && !learned
      && sourceSkinState === "unknown"
      && classificationConfidence >= AUTO_SUBSTITUTE_MIN_CONFIDENCE
      && classificationConfidence <= REVIEW_CONFIDENCE_MAX;
    const approvedStandardNameBase = standardProduct?.standardName
      || (fuzzyCut?.autoApply ? standardDisplayName(fuzzyCut) : "");
    const approvedStandardName = cutRule.category === "돼지고기"
      ? preservePorkSkinQualifier(approvedStandardNameBase, sourceSkinState)
      : approvedStandardNameBase;
    const displayParts = [
      storage === "보관미상" ? "" : storage,
      ...(approvedStandardName
        ? [approvedStandardName]
        : [
            ...orderedQualifiers.filter((item) => !["한우", "육우", "젖소", "암소", "거세"].includes(item)),
            cutRule.cut
          ])
    ].filter(Boolean);

    return {
      category: cutRule.category,
      storage,
      storageSource: storageDecision.source,
      storageConfidence: storageDecision.confidence,
      storageAgeDays: storageDecision.ageDays,
      storageThresholdDays: storageDecision.thresholdDays,
      cut: cutRule.cut,
      qualifiers: orderedQualifiers,
      displayName: displayParts.join(" "),
      canonicalName,
      confidence: classificationConfidence,
      learningMatch: learned?.matchType || null,
      learningSource: learned?.sourceType || null,
      fuzzyMatch: fuzzyCut?.alias || null,
      requiresReview: reviewRange,
      reviewReason: reviewRange ? "medium_confidence_substitution" : null,
      dictionaryCode: standardProduct?.dictionaryCode || fuzzyCut?.dictionaryCode || null,
      productCode: standardProduct?.productCode || fuzzyCut?.productCode || null,
      key: [cutRule.category, storage, cutRule.cut, orderedQualifiers.join("+")].join("|").toLowerCase()
    };
  }

  function suggest(value, context = {}) {
    const sourceText = cleanDisplayText(value);
    const probableSkinOnRearLegOcr = /(^|[\s(])(?:미우지|마후지|하후지|하우지)(?=$|[\s()])/.test(sourceText);
    if (probableSkinOnRearLegOcr) {
      const ocrSource = sourceText.match(/(?:미우지|마후지|하후지|하우지)/)?.[0] || "미우지";
      const correctedSource = sourceText.replace(/(^|[\s(])(?:미우지|마후지|하후지|하우지)(?=$|[\s()])/g, "$1미후지");
      const corrected = classify(correctedSource, context);
      return {
        sourceName: sourceText,
        suggestedName: corrected.displayName || "미박 뒷다리살",
        category: "돼지고기",
        cut: "뒷다리",
        qualifiers: ["미박"],
        storage: corrected.storage,
        confidence: /^(?:미우지|마후지)$/.test(ocrSource) ? 78 : 72,
        dictionaryCode: corrected.dictionaryCode || "DICT-PORK-LEG-SKIN-ON",
        productCode: corrected.productCode || "PROD-PORK-LEG-SKIN-ON",
        requiresConfirmation: true,
        reviewRange: true,
        highRiskReview: false,
        autoSubstituted: true,
        candidateFound: true,
        learned: false,
        ocrCorrection: `${ocrSource}→미후지`,
        classification: corrected,
        alternativeNames: ["뒷다리살", "앞다리살"]
      };
    }
    const classification = classify(value, context);
    if (
      classification.learningMatch
      || (!classification.requiresReview && classification.category !== "기타")
    ) {
      return {
        sourceName: cleanDisplayText(value),
        suggestedName: classification.displayName,
        category: classification.category,
        cut: classification.cut,
        qualifiers: classification.qualifiers || [],
        storage: classification.storage,
        confidence: classification.confidence,
        dictionaryCode: classification.dictionaryCode || null,
        productCode: classification.productCode || null,
        requiresConfirmation: false,
        reviewRange: false,
        autoSubstituted: true,
        candidateFound: true,
        learned: Boolean(classification.learningMatch),
        classification
      };
    }

    const candidate = rankStandardProductSuggestions(value, context)[0] || null;
    const candidateConfidence = candidate ? Math.round(candidate.score * 100) : 0;
    if (!candidate || candidateConfidence < AUTO_SUBSTITUTE_MIN_CONFIDENCE) {
      return {
        sourceName: cleanDisplayText(value),
        suggestedName: "정육 표준품목 후보 없음",
        category: classification.category,
        cut: classification.cut,
        qualifiers: [],
        storage: classification.storage,
        confidence: candidateConfidence,
        dictionaryCode: null,
        productCode: null,
        requiresConfirmation: true,
        reviewRange: false,
        autoSubstituted: false,
        candidateFound: false,
        learned: false,
        classification
      };
    }

    const suggestedName = applyStorageLabel(
      candidate.standardName,
      classification.storage,
      classification.storageSource
    );
    const reviewRange = candidateConfidence <= REVIEW_CONFIDENCE_MAX;
    const highRiskReview = Boolean(classification.requiresReview) && !reviewRange;
    return {
      sourceName: cleanDisplayText(value),
      suggestedName,
      category: candidate.category,
      cut: candidate.cut,
      qualifiers: candidate.qualifiers || [],
      storage: classification.storage,
      confidence: candidateConfidence,
      dictionaryCode: candidate.dictionaryCode || null,
      productCode: candidate.productCode || null,
      requiresConfirmation: reviewRange || highRiskReview,
      reviewRange,
      highRiskReview,
      autoSubstituted: true,
      candidateFound: true,
      learned: false,
      classification,
      alternativeNames: rankStandardProductSuggestions(value, context)
        .slice(1, 3)
        .map((item) => item.standardName)
    };
  }

  function resolve(value, context = {}) {
    const suggestion = suggest(value, context);
    if (!suggestion.candidateFound || !suggestion.autoSubstituted) {
      return suggestion.classification;
    }
    const qualifiers = Array.isArray(suggestion.qualifiers) ? suggestion.qualifiers : [];
    return {
      ...suggestion.classification,
      category: suggestion.category,
      cut: suggestion.cut,
      qualifiers,
      displayName: suggestion.suggestedName,
      confidence: suggestion.confidence,
      dictionaryCode: suggestion.dictionaryCode,
      productCode: suggestion.productCode,
      requiresReview: suggestion.reviewRange,
      reviewReason: suggestion.reviewRange ? "medium_confidence_substitution" : null,
      autoSubstituted: true,
      key: [
        suggestion.category,
        suggestion.storage,
        suggestion.cut,
        qualifiers.join("+")
      ].join("|").toLowerCase()
    };
  }

  function rankStandardProductSuggestions(value, context = {}) {
    const source = suggestionProductCore(value);
    if (!source.compact) return [];
    const categoryHint = normalizeCategoryHint(
      context?.category ?? context?.species ?? context?.speciesName ?? context?.species_name
    ) || explicitCategoryFromText(value);
    const sourceHasGalbi = /갈비|갈삐/.test(source.compact);
    const candidates = [];
    const skinOnBelly = scoreSkinOnBellySuggestion(source);
    if (skinOnBelly >= AUTO_SUBSTITUTE_MIN_CONFIDENCE / 100) {
      candidates.push({
        standardName: "오겹살",
        category: "돼지고기",
        cut: "삼겹",
        qualifiers: ["미박"],
        dictionaryCode: "DICT-0001",
        productCode: "PROD-0001",
        score: skinOnBelly
      });
    }
    const skinlessBelly = scoreSkinlessBellySuggestion(source);
    if (skinlessBelly >= AUTO_SUBSTITUTE_MIN_CONFIDENCE / 100) {
      candidates.push({
        standardName: "삼겹살",
        category: "돼지고기",
        cut: "삼겹",
        qualifiers: [],
        dictionaryCode: "DICT-PORK-BELLY-SKINLESS",
        productCode: "PROD-PORK-BELLY-SKINLESS",
        score: skinlessBelly
      });
    }

    for (const entry of FUZZY_CUT_DICTIONARY) {
      if (categoryHint && entry.category !== categoryHint) continue;
      if (sourceHasGalbi && entry.cut === "등갈비" && !/등/.test(source.compact)) continue;
      if (sourceHasGalbi && entry.cut === "쪽갈비" && !/쪽/.test(source.compact)) continue;
      let score = 0;
      for (const alias of entry.aliases) {
        score = Math.max(score, productTermSimilarity(source, alias));
      }
      const standardName = standardDisplayName(entry);
      candidates.push({
        standardName,
        category: entry.category,
        cut: entry.cut,
        qualifiers: [],
        dictionaryCode: entry.dictionaryCode || null,
        productCode: entry.productCode || null,
        score
      });
    }

    const unique = new Map();
    for (const candidate of candidates) {
      const identity = [candidate.category, candidate.standardName].join("|");
      const existing = unique.get(identity);
      if (!existing || candidate.score > existing.score) unique.set(identity, candidate);
    }
    return [...unique.values()].sort((left, right) =>
      right.score - left.score
      || right.standardName.length - left.standardName.length
    );
  }

  function scoreSkinOnBellySuggestion(source) {
    const skinState = detectPorkSkinState(source.compact);
    if (skinState === "skinless") return 0;
    const qualifierScores = source.tokens.map((token) =>
      Math.max(
        hangulTermSimilarity(token, "미박"),
        hangulTermSimilarity(token, "미박피")
      )
    );
    const qualifierScore = Math.max(0, ...qualifierScores);
    const qualifierIndex = qualifierScores.indexOf(qualifierScore);
    const cutTokens = source.tokens.filter((token, index) => index !== qualifierIndex);
    const cutSource = cutTokens.join("") || source.compact;
    const cutScore = Math.max(
      productTermSimilarity({ compact: cutSource, tokens: cutTokens }, "삼겹"),
      productTermSimilarity({ compact: cutSource, tokens: cutTokens }, "삼겹살")
    );
    const startsLikeSkinOn = source.tokens.some((token) => /^미/.test(token)) ? 0.08 : 0;
    return Math.min(1, qualifierScore * 0.34 + cutScore * 0.66 + startsLikeSkinOn);
  }

  function scoreSkinlessBellySuggestion(source) {
    const skinState = detectPorkSkinState(source.compact);
    if (skinState === "skin_on") return 0;
    const qualifierScores = source.tokens.map((token) =>
      Math.max(
        hangulTermSimilarity(token, "박피"),
        hangulTermSimilarity(token, "빅피")
      )
    );
    const qualifierScore = Math.max(0, ...qualifierScores);
    const qualifierIndex = qualifierScores.indexOf(qualifierScore);
    const cutTokens = source.tokens.filter((token, index) => index !== qualifierIndex);
    const cutSource = cutTokens.join("") || source.compact;
    const cutScore = Math.max(
      productTermSimilarity({ compact: cutSource, tokens: cutTokens }, "삼겹"),
      productTermSimilarity({ compact: cutSource, tokens: cutTokens }, "삼겹살")
    );
    const explicitSkinless = skinState === "skinless" ? 0.12 : 0;
    return Math.min(1, qualifierScore * 0.38 + cutScore * 0.62 + explicitSkinless);
  }

  function detectPorkSkinState(value) {
    const compact = fingerprint(value);
    if (!compact) return "unknown";
    if (/미(?:박|빅|밖|백|뱍)(?:피)?/.test(compact)) return "skin_on";
    if (/^(?:냉장|냉동)?미(?:전지|젼지|전쥐|전디|앞다리|압다리|앞다라|후지|뒷다리|삼겹|목살|등심|갈비)/.test(compact)) return "skin_on";
    if (/(?:^|냉장|냉동)(?:박피|박펴|박파|박비|빅피|밖피)/.test(compact)) return "skinless";
    return "unknown";
  }

  function detectUnsupportedSkinOnCut(value) {
    const compact = fingerprint(value).replace(/^(냉장|냉동)/, "");
    const match = compact.match(/^미(?:박|빅|밖|백|뱍)?(?:피)?(목살|등심|갈비)/);
    return match?.[1] || "";
  }

  function preservePorkSkinQualifier(value, skinState) {
    const name = cleanDisplayText(value);
    if (!name) return name;
    if (skinState === "skin_on") {
      if (/오겹|미박/.test(name)) return name;
      return "미박 " + name;
    }
    if (skinState === "skinless") {
      if (/^(?:박피\s*)?삼겹살?$/.test(name)) return "삼겹살";
      if (/박피/.test(name)) return name;
      return "박피 " + name;
    }
    return name;
  }

  function normalizeLearnedPorkCut(value) {
    const cut = cleanDisplayText(value);
    const compact = fingerprint(cut);
    if (/후지|뒷다리/.test(compact)) return "뒷다리";
    if (/전지|앞다리/.test(compact)) return "앞다리";
    return cut;
  }

  function productTermSimilarity(source, alias) {
    const aliasKey = fingerprint(alias);
    if (!aliasKey) return 0;
    let best = hangulTermSimilarity(source.compact, aliasKey);
    for (const token of source.tokens) {
      best = Math.max(best, hangulTermSimilarity(token, aliasKey));
    }
    const minimumLength = Math.max(1, aliasKey.length - 1);
    const maximumLength = Math.min(source.compact.length, aliasKey.length + 1);
    for (let length = minimumLength; length <= maximumLength; length += 1) {
      for (let start = 0; start + length <= source.compact.length; start += 1) {
        best = Math.max(
          best,
          hangulTermSimilarity(source.compact.slice(start, start + length), aliasKey)
        );
      }
    }
    return best;
  }

  function hangulTermSimilarity(left, right) {
    const leftKey = fingerprint(left);
    const rightKey = fingerprint(right);
    if (!leftKey || !rightKey) return 0;
    const syllableEdit = normalizedSimilarity(leftKey, rightKey);
    const jamoEdit = normalizedSimilarity(
      decomposeHangul(leftKey),
      decomposeHangul(rightKey)
    );
    const orderless = multisetDice(leftKey, rightKey);
    return Math.max(
      syllableEdit,
      jamoEdit * 0.96,
      orderless * 0.88
    );
  }

  function decomposeHangul(value) {
    const initial = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    const medial = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
    const final = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    return [...String(value)].map((character) => {
      const code = character.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return character;
      return initial[Math.floor(code / 588)]
        + medial[Math.floor((code % 588) / 28)]
        + final[code % 28];
    }).join("");
  }

  function multisetDice(left, right) {
    const counts = new Map();
    for (const character of left) counts.set(character, (counts.get(character) || 0) + 1);
    let intersection = 0;
    for (const character of right) {
      const count = counts.get(character) || 0;
      if (!count) continue;
      intersection += 1;
      counts.set(character, count - 1);
    }
    return (2 * intersection) / Math.max(1, left.length + right.length);
  }

  function suggestionProductCore(value) {
    let text = cleanDisplayText(value)
      .replace(/^(냉장|냉동|넥장|넹장|냉쟝|넥동|넹동|냉돔)\s*/, "")
      .replace(/\([^)]*\)/g, " ");
    for (const origin of ORIGIN_LABELS) {
      text = text.replace(new RegExp(escapeRegExp(origin), "g"), " ");
    }
    const tokens = text
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map(fingerprint)
      .filter(Boolean);
    return { tokens, compact: tokens.join("") };
  }

  function standardDisplayName(entry) {
    if (entry.dictionaryCode === "DICT-0001") return "오겹살";
    if (entry.dictionaryCode === "DICT-PORK-BELLY-SKINLESS") return "삼겹살";
    if (entry.category === "돼지고기" && entry.cut === "삼겹") return "삼겹살";
    if (entry.category === "돼지고기" && entry.cut === "앞다리") return "앞다리살";
    if (entry.category === "돼지고기" && entry.cut === "뒷다리") return "뒷다리살";
    if (entry.category === "닭고기" && entry.cut === "가슴살") return "닭가슴살";
    if (entry.category === "닭고기" && entry.cut === "다리살") return "닭다리살";
    if (entry.category === "소고기" && entry.cut === "목심") return "우목심";
    return entry.cut;
  }

  function inferStorage(value, context, learned, category, cut) {
    const explicitStorage = storageFromText(value);
    if (explicitStorage) {
      return storageDecision(explicitStorage, "explicit_name", 100);
    }

    const contextualStorage = storageFromText(
      context?.storage ?? context?.storageType ?? context?.storage_type ?? context?.condition
    );
    if (contextualStorage) {
      return storageDecision(contextualStorage, "document_context", 94);
    }

    const referenceDate = firstValidDate(
      context?.movementDate,
      context?.movement_date,
      context?.receivedAt,
      context?.received_at,
      context?.createdAt,
      context?.created_at
    );
    const expiryDate = firstValidDate(context?.expiryDate, context?.expiry_date);
    if (referenceDate && expiryDate) {
      const daysPastExpiry = daysBetween(expiryDate, referenceDate);
      if (daysPastExpiry <= 0) {
        return storageDecision("냉장", "expiry_date", 96, daysPastExpiry, 0);
      }
    }

    const slaughterDate = firstValidDate(context?.slaughterDate, context?.slaughter_date);
    if (referenceDate && slaughterDate) {
      const ageDays = daysBetween(slaughterDate, referenceDate);
      if (ageDays >= 0) {
        const thresholdDays = chilledShelfLifeDays(category, cut, context);
        if (thresholdDays !== null && ageDays <= thresholdDays) {
          return storageDecision("냉장", "slaughter_age", 90, ageDays, thresholdDays);
        }
      }
    }

    if (learned?.storage && learned.storage !== "미확인") {
      return storageDecision(learned.storage, "learned_pattern", Math.min(100, Number(learned.confidence || 90)));
    }

    const canonicalStorage = storageFromText(learned?.targetPattern || "");
    if (canonicalStorage) {
      return storageDecision(canonicalStorage, "learned_name", Math.min(100, Number(learned?.confidence || 85)));
    }
    return storageDecision("보관미상", "unknown", 0);
  }

  function storageDecision(storage, source, confidence, ageDays = null, thresholdDays = null) {
    return { storage, source, confidence, ageDays, thresholdDays };
  }

  function firstValidDate(...values) {
    for (const value of values) {
      const parsed = parseDateOnly(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function parseDateOnly(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = new Date(timestamp);
    if (
      date.getUTCFullYear() !== Number(match[1])
      || date.getUTCMonth() !== Number(match[2]) - 1
      || date.getUTCDate() !== Number(match[3])
    ) return null;
    return timestamp;
  }

  function daysBetween(earlier, later) {
    return Math.floor((later - earlier) / DAY_MS);
  }

  function chilledShelfLifeDays(category, cut, context = {}) {
    const contextualDays = Number(context?.chilledShelfLifeDays ?? context?.chilled_shelf_life_days);
    if (Number.isFinite(contextualDays) && contextualDays >= 0) return contextualDays;
    const categoryPolicy = CHILLED_SHELF_LIFE_DAYS[category];
    if (!categoryPolicy) return null;
    return categoryPolicy[cut] ?? categoryPolicy["전부위"] ?? null;
  }

  function inferCut(name) {
    const compact = cleanDisplayText(name).replace(/\s+/g, "");
    return CUT_RULES.find((rule) => rule.pattern.test(compact))?.cut || "전부위";
  }

  function findAmbiguousBellyQualifier(value) {
    const name = cleanDisplayText(value)
      .replace(/^(냉장|냉동)\s*/, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const match = name.match(/^([가-힣]{1,8})\s*삼겹(?=$|\s)/);
    if (!match) return "";
    const qualifier = match[1];
    if (["우", "미박", "박피", "무항생제"].includes(qualifier)) return "";
    return qualifier;
  }

  function findFuzzyCut(value, context = {}) {
    const core = fuzzyProductCore(value);
    if (!core) return null;
    // 평문 '갈비'(등/쪽 없는 갈비류)가 등갈비·쪽갈비로 오매칭되는 것을 원천 차단.
    // 단 '로인립·스페어립'처럼 갈비 글자가 없는 별칭은 영향 없음.
    const coreHasGalbi = /갈비|갈삐/.test(core);
    const categoryHint = normalizeCategoryHint(
      context?.category ?? context?.species ?? context?.speciesName ?? context?.species_name
    ) || explicitCategoryFromText(value);
    const rankedByIdentity = new Map();
    for (const entry of FUZZY_CUT_DICTIONARY) {
      if (categoryHint && entry.category !== categoryHint) continue;
      if (coreHasGalbi && entry.cut === "등갈비" && !/등/.test(core)) continue;
      if (coreHasGalbi && entry.cut === "쪽갈비" && !/쪽/.test(core)) continue;
      for (const alias of entry.aliases) {
        const aliasKey = fingerprint(alias);
        const distance = levenshteinDistance(core, aliasKey);
        const similarity = normalizedSimilarity(core, aliasKey);
        const identity = [entry.category, entry.cut].join("|");
        const candidate = { ...entry, alias, distance, similarity };
        const previous = rankedByIdentity.get(identity);
        if (
          !previous
          || candidate.similarity > previous.similarity
          || (
            candidate.similarity === previous.similarity
            && candidate.distance < previous.distance
          )
        ) rankedByIdentity.set(identity, candidate);
      }
    }
    const ranked = [...rankedByIdentity.values()].sort((left, right) =>
      right.similarity - left.similarity
      || left.distance - right.distance
      || right.alias.length - left.alias.length
    );
    const best = ranked[0];
    if (!best || best.similarity < 0.5) return null;
    const competitor = ranked.find((candidate) =>
      candidate.category !== best.category || candidate.cut !== best.cut
    );
    const margin = competitor ? best.similarity - competitor.similarity : 1;
    const comparableLength = Math.max(core.length, fingerprint(best.alias).length);
    const maximumDistance = comparableLength <= 2 ? 0 : (comparableLength <= 5 ? 1 : 2);
    const bestAliasKey = fingerprint(best.alias);
    const suffix = core.startsWith(bestAliasKey)
      ? core.slice(bestAliasKey.length)
      : "";
    const hasRecognizedCutSuffix = suffix.length === 1 && /^(살|쌀|삽|삭)$/.test(suffix);
    const hasUnknownAffix = core !== bestAliasKey
      && core.includes(bestAliasKey)
      && !hasRecognizedCutSuffix;
    const highRiskAmbiguity = isHighRiskCutAmbiguity(core, best);
    const autoApply = !hasUnknownAffix
      && !highRiskAmbiguity
      && best.distance <= maximumDistance
      && best.similarity >= AUTO_SUBSTITUTE_MIN_CONFIDENCE / 100
      && margin >= (comparableLength <= 3 ? 0.2 : 0.12);
    return {
      ...best,
      margin,
      autoApply,
      qualifiers: fuzzyQualifiers(value, best)
    };
  }

  function isHighRiskCutAmbiguity(core, candidate) {
    if (candidate.cut === "가브리살") {
      if (core.length <= 2) return true;
      if (/^갈/.test(core) && !["갈비"].includes(core)) return true;
    }
    if (candidate.cut === "갈비" && /^가브/.test(core)) return true;
    return false;
  }

  function fuzzyIdentityMatchesCore(value, cutRule) {
    const core = fuzzyProductCore(value);
    const dictionaryEntry = FUZZY_CUT_DICTIONARY.find((entry) =>
      entry.category === cutRule.category && entry.cut === cutRule.cut
    );
    if (!dictionaryEntry) return true;
    return dictionaryEntry.aliases.some((alias) => fingerprint(alias) === core);
  }

  function fuzzyProductCore(value) {
    let name = cleanDisplayText(value)
      .replace(/^(냉장|냉동)\s*/, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/(?:\s|^)[A-Z](?=\s|$)/gi, " ")
      .replace(/([가-힣)])?[A-Z]$/i, (match, korean) => korean || "")
      .replace(/(?:미박|박피|무뼈|유뼈|무항생제|한우|육우|젖소|암소|거세|돼지고기|돈육|소고기|쇠고기|닭고기|계육)/g, " ")
      .replace(/1\+\+|1\+|[123]등급/g, " ")
      .replace(/[\s\p{P}\p{S}]+/gu, "");
    for (const origin of ORIGIN_LABELS) {
      name = name.replace(new RegExp(escapeRegExp(origin), "g"), "");
    }
    return name;
  }

  function fuzzyQualifiers(value, candidate) {
    const compact = cleanDisplayText(value).replace(/\s+/g, "");
    const qualifiers = [];
    for (const qualifier of MEANINGFUL_QUALIFIERS) {
      if (compact.includes(qualifier.replace(/\s+/g, ""))) qualifiers.push(qualifier);
    }
    if (qualifiers.includes("무뼈")) {
      const boneIndex = qualifiers.indexOf("뼈");
      if (boneIndex >= 0) qualifiers.splice(boneIndex, 1);
    }
    const skinState = candidate.category === "돼지고기" ? detectPorkSkinState(compact) : "unknown";
    if (skinState === "skin_on") {
      if (!qualifiers.includes("미박")) qualifiers.push("미박");
      const skinlessIndex = qualifiers.indexOf("박피");
      if (skinlessIndex >= 0) qualifiers.splice(skinlessIndex, 1);
    } else if (skinState === "skinless") {
      if (!qualifiers.includes("박피")) qualifiers.push("박피");
      const skinOnIndex = qualifiers.indexOf("미박");
      if (skinOnIndex >= 0) qualifiers.splice(skinOnIndex, 1);
    }
    return qualifiers;
  }

  function applyStorageLabel(value, storage, source) {
    const name = cleanDisplayText(value);
    if (!name || storage === "보관미상" || source === "unknown") return name;
    if (/^(냉장|냉동)(?=\s|$)/.test(name)) {
      return name.replace(/^(냉장|냉동)(?=\s|$)/, storage);
    }
    return storage + " " + name;
  }

  function inferCategory(name) {
    if (/돼지|돈뼈|등뼈|돈갈비|등갈비|쪽갈비|삼겹|목살|앞다리|뒷다리|항정|가브리|갈매기|미박|박피/.test(name)) return "돼지고기";
    if (/한우|육우|소고기|등심|안심|채끝|갈비|사태|우삼겹/.test(name)) return "소고기";
    if (/닭|계육/.test(name)) return "닭고기";
    return "기타";
  }

  function stripIncidentalLabels(value) {
    return cleanDisplayText(value)
      // 거래처/브랜드 표기가 들어가는 괄호는 미분류 품목에서만 제거한다.
      // 품질 속성은 classify()의 qualifiers에서 별도로 보존된다.
      .replace(/\([^)]*\)/g, " ")
      // OCR이나 엑셀 열에서 붙는 고립 영문 한 글자 꼬리표(S/A/B 등)를 제거한다.
      .replace(/(?:\s|^)[A-Z](?=\s|$)/gi, " ")
      .replace(/([가-힣)])?[A-Z]$/i, (match, korean) => korean || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cleanDisplayText(value) {
    return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  function fingerprint(value) {
    let text = normalizeKnownOcrMisreads(value)
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, "");
    for (const origin of ORIGIN_LABELS) {
      text = text.replace(new RegExp(escapeRegExp(origin), "g"), "");
    }
    return text;
  }

  function normalizedSimilarity(left, right) {
    if (left === right) return 1;
    const maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 1;
    return 1 - levenshteinDistance(left, right) / maxLength;
  }

  function levenshteinDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      let diagonal = previous[0];
      previous[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const above = previous[rightIndex];
        previous[rightIndex] = Math.min(
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + 1,
          diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  function sameStorageCondition(left, right) {
    const leftStorage = storageFromText(left);
    const rightStorage = storageFromText(right);
    return !leftStorage || !rightStorage || leftStorage === rightStorage;
  }

  function storageFromText(value) {
    const text = normalizeKnownOcrMisreads(value);
    return /냉동/.test(text) ? "냉동" : (/냉장/.test(text) ? "냉장" : "");
  }

  function normalizeKnownOcrMisreads(value) {
    let text = cleanDisplayText(value);
    for (const rule of SUBSTITUTIONS.slice(0, 2)) {
      text = text.replace(rule.pattern, rule.replacement);
    }
    return text;
  }

  function learningScore(pattern) {
    const recency = Date.parse(pattern.lastUsedAt || "") || 0;
    return (Number(pattern.priority || 0) * 1000000000)
      + (Number(pattern.confidence) * 1000000)
      + (Math.min(Number(pattern.successCount), 999) * 1000)
      + Math.floor(recency / 86400000);
  }

  function learnedPatternKey(supplierId, sourceKey) {
    return [cleanDisplayText(supplierId) || "*", sourceKey].join("|");
  }

  function registerSupplier(supplierId, supplierName, supplierCode = "") {
    const id = cleanDisplayText(supplierId);
    const name = cleanDisplayText(supplierName);
    const code = cleanDisplayText(supplierCode);
    if (!id) return;
    supplierNames.set(id, name);
    supplierDirectory.set(id, id);
    if (name) supplierDirectory.set(fingerprint(name), id);
    if (name) supplierDirectory.set(supplierFingerprint(name), id);
    if (code) supplierDirectory.set(fingerprint(code), id);
  }

  function registerSupplierAlias(supplierId, ...aliases) {
    const id = cleanDisplayText(supplierId);
    if (!id) return;
    for (const alias of aliases) {
      const cleaned = cleanDisplayText(alias);
      if (!cleaned) continue;
      supplierDirectory.set(fingerprint(cleaned), id);
      supplierDirectory.set(supplierFingerprint(cleaned), id);
    }
  }

  function resolveSupplierId(context = {}) {
    if (typeof context === "string") {
      return supplierDirectory.get(fingerprint(context))
        || supplierDirectory.get(supplierFingerprint(context))
        || "";
    }
    const explicit = cleanDisplayText(context?.supplierId ?? context?.supplier_id);
    if (explicit) return explicit;
    const name = cleanDisplayText(context?.supplierName ?? context?.supplier_name);
    return name
      ? (supplierDirectory.get(fingerprint(name)) || supplierDirectory.get(supplierFingerprint(name)) || "")
      : "";
  }

  function supplierFingerprint(value) {
    return fingerprint(value)
      .replace(/^(주식회사|농업회사법인|유한회사)/, "")
      .replace(/^주/, "")
      .replace(/유통$/, "");
  }

  function supplierNameForId(supplierId) {
    const id = cleanDisplayText(supplierId);
    return id ? (supplierNames.get(id) || "") : "";
  }

  function storageKey(tenantId) {
    return LOCAL_STORAGE_PREFIX + String(tenantId || "default");
  }

  function persistLocalLearning(tenantId) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(storageKey(tenantId), JSON.stringify(listLearnedPatterns().slice(0, 500)));
    } catch {
      // 저장 공간이 부족해도 현재 세션의 학습 치환은 유지한다.
    }
  }

  global.MEATOS_PRODUCT_NAMES = Object.freeze({
    canonicalize,
    classify,
    suggest,
    resolve,
    groupKey,
    categoryOf,
    configureLearnedPatterns,
    mergeLearnedPatterns,
    recordLocalCorrection,
    loadLocalLearning,
    loadRemoteLearning,
    learnCorrection,
    listLearnedPatterns,
    fingerprint,
    substitutions: SUBSTITUTIONS,
    thresholds: Object.freeze({
      autoSubstituteMin: AUTO_SUBSTITUTE_MIN_CONFIDENCE,
      reviewMax: REVIEW_CONFIDENCE_MAX
    })
  });
})(typeof window === "undefined" ? globalThis : window);
