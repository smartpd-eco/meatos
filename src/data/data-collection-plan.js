export const DATA_COLLECTION_LEVELS = [
  {
    level: 1,
    label: "국가 기준",
    sources: ["농림축산식품부", "축산물품질평가원(KAPE)", "식품의약품안전처", "축산물이력제"],
    target: ["부위명", "축종", "등급", "원산지", "이력 기준", "품목 분류"],
    usage: "Product Master 표준 기준",
    priority: "highest"
  },
  {
    level: 2,
    label: "공공기관 / 협회",
    sources: ["농협경제지주", "축산관련 협회", "한돈자조금", "한우자조금", "유통 관련 기관"],
    target: ["업계 표준 용어", "유통 용어", "품목 코드", "권장 분류"],
    usage: "Product Dictionary 검증",
    priority: "high"
  },
  {
    level: 3,
    label: "논문 / 학술자료",
    sources: ["KCI", "RISS", "농촌진흥청", "정부 연구용역", "학회지"],
    target: ["부위 분류", "용어 정의", "유통 구조", "AI/OCR 연구"],
    usage: "AI 규칙 설계",
    priority: "medium"
  },
  {
    level: 4,
    label: "대형 유통사",
    sources: ["쿠팡", "SSG", "이마트", "GS", "홈플러스", "롯데마트", "네이버쇼핑", "컬리"],
    target: ["상품명", "판매명", "규격", "옵션", "카테고리"],
    usage: "소비자 표현 Dictionary",
    priority: "medium"
  },
  {
    level: 5,
    label: "실제 유통업체",
    sources: ["육가공업체", "도매상", "공급사"],
    target: ["거래명세서", "상품명", "규격", "약어", "현장 용어"],
    usage: "Supplier Alias",
    priority: "low"
  },
  {
    level: 6,
    label: "정육점",
    sources: ["POS 상품명", "판매 상품명", "진열명", "지역 용어"],
    target: ["Alias 확장"],
    usage: "현장 표현 누적",
    priority: "low"
  }
];

export const DATA_COLLECTION_FLOW = [
  "국가 표준",
  "협회",
  "논문",
  "대형 유통",
  "실제 거래처",
  "정육점",
  "MEATOS Product Dictionary",
  "AI Learning Database"
];
