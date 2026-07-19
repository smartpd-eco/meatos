export const OCR_PROVIDER_REGISTRY = [
  {
    providerId: "paddleocr",
    providerName: "PaddleOCR Browser SDK",
    role: "primary",
    supports: ["camera", "gallery", "pdf", "table", "text", "layout"],
    priority: 1
  },
  {
    providerId: "easyocr-compare",
    providerName: "EasyOCR Compare",
    role: "selective_comparison",
    supports: ["korean", "product_name", "coordinates"],
    priority: 2
  },
  {
    providerId: "tesseract-compare",
    providerName: "Tesseract Compare",
    role: "numeric_validation",
    supports: ["numeric", "trace_number", "coordinates"],
    priority: 3
  },
  {
    providerId: "upstage-document-parse",
    providerName: "Upstage Document Parse",
    role: "unseen_layout_challenger",
    supports: ["korean", "table", "layout", "coordinates", "html"],
    estimatedUsdPerPage: 0.01,
    priority: 4
  },
  {
    providerId: "google-vision-document-text",
    providerName: "Google Vision Document Text",
    role: "neutral_baseline",
    supports: ["korean", "text", "coordinates"],
    estimatedUsdPerPage: 0.0015,
    priority: 5
  },
  {
    providerId: "gemini-2.5-flash",
    providerName: "Gemini 2.5 Flash Vision",
    role: "evidence_comparison",
    supports: ["korean", "image", "table", "structured_json"],
    priority: 6
  },
  {
    providerId: "gpt-4.1",
    providerName: "OpenAI GPT-4.1 Vision",
    role: "final_exception_comparison",
    supports: ["korean", "image", "table", "structured_json"],
    priority: 7
  },
  {
    providerId: "clova-general",
    providerName: "NAVER CLOVA OCR General",
    role: "final_fallback",
    supports: ["korean", "camera", "gallery", "pdf", "table", "key_value"],
    priority: 8
  },
  {
    providerId: "meatos-parser",
    providerName: "MEATOS 문서 파서",
    role: "parser",
    supports: ["table_reconstruction", "field_extraction", "review", "learning"],
    priority: 1
  }
];

export const OCR_PIPELINE_STEPS = [
  "카메라·갤러리 입력",
  "이미지 품질 검사",
  "OpenCV 자동 보정",
  "PaddleOCR 1차 인식",
  "MEATOS 표 구조 복원",
  "거래명세서 필드 추출",
  "Product Dictionary·Alias 매칭",
  "숫자·이력번호 검산",
  "필요한 셀만 비교 인식",
  "신규 양식만 외부 문서 파서 비교",
  "사용자 Review",
  "좌표·구조·수정 이력 학습"
];
