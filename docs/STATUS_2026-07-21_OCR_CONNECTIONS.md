# MEATOS OCR 현황 정리 (2026-07-21)

거래명세서 OCR 기능의 현재 동작 상태, 비활성화한 항목, 현재 연결된 구성 요소를 정리한다.

---

## 1. 한 줄 요약

**사진 → 인식 → 검수(셀 수정) → 매입 저장 → 목록 조회** 전 과정이 동작한다.
인식은 **Supabase Edge Function `analyze-invoice` → Gemini 3.1 Flash-Lite**로 처리하며, 웜 상태 약 3초, 실측에서 6개 품목의 중량·단가·공급가·이력번호까지 정확히 추출됨.

---

## 2. OCR 성공 현황 (검증 완료)

- 실제 거래명세서(좋은축산유통, 2026-07-06) 인식 성공 — 6개 품목, 공급가 = 중량 × 단가 전부 일치.
- 처리 속도: 웜 2.8~3.1초, 첫(콜드) 호출 4~5초.
- 화면: 거래명세서 양식 표(No·상품명및등급·원산지·단위·중량·단가·공급가액·이력번호) + 합계금액.
- 셀 직접 수정(검수) 가능, 중량·단가 수정 시 공급가액 자동 재계산.
- 매입 저장: `ocr_document` + `ocr_line_item`에 DB 기록(재조회 확인 완료).
- 저장 목록/조회: 날짜·공급자 검색, 상세 명세서 열람.

---

## 3. 비활성화 / 미사용 항목

| 항목 | 상태 | 사유 |
|---|---|---|
| **PaddleOCR (브라우저)** | 모바일 비활성 | 21MB 모델·CPU 점유로 폰 화면 멈춤. PC 경로에만 폴백으로 남김. |
| **Tesseract.js** | 사실상 미사용 | 한글·표 정확도 낮음. 코드만 존재. |
| **EasyOCR** | 비활성 | 별도 Python 서버 필요(`easyOcrServiceUrl` 비어 있음). |
| **CLOVA / Upstage / Google Vision / GPT-4.1** | 미연결 | 레지스트리 stub만 존재. 키·함수 미구성. |
| **옛 서비스워커(cache-first, v9/v10)** | 교체됨 | 새 배포가 폰에 반영 안 되던 원인. network-first v11로 교체. |
| **문서합계=품목합계 강제 검산** | 제거(참고로 전환) | 여러 페이지·전잔액 포함 시 항상 오탐. |
| **전체 앱(거래명세서 확인) OCR 흐름** | 유지되나 비주력 | 캐시·복잡도 이슈. 실사용은 scan.html로 채택(A안). |

---

## 4. 현재 연결된 구성 (Active)

### 프론트엔드 (Vercel · https://meatos.vercel.app)
- `index.html` — 홈. 우측 하단 플로팅 버튼 **"📄 거래명세서 스캔"** → `scan.html`, **"📋 저장 목록"** → `records.html`.
- `scan.html` — 스캔 도구(독립 페이지). 사진→축소(1600px)→인식→양식 표→셀 수정→매입 저장. 접속 시 옛 캐시/SW 자동 제거.
- `records.html` — 저장된 명세서 목록·검색·상세 조회.
- `sw.js` — **network-first** 서비스워커(v11). 배포 즉시 반영.
- `vercel.json` — COOP/COEP 헤더(SharedArrayBuffer 허용), 정적 빌드(`dist`).

### 인식 엔진 (Supabase Edge Function)
- 함수: **`analyze-invoice`** (project `pkrsiqjzllyiafwpskll`).
- 모델: **Gemini 3.1 Flash-Lite** (사용 가능 모델 자동 탐색, `GEMINI_VISION_MODEL`로 수동 지정 가능).
- 옵션: `thinkingBudget: 0`(속도 안정화), Gemini 호환 responseSchema(`additionalProperties`·타입배열 제거), 실제 에러 메시지 노출.
- 프롬프트 규칙: 공급가 = 수량 × 단가, 정육은 kg 무게를 수량으로·박스 수는 단위로.
- 인증: 클라이언트가 Supabase anon 키를 `Authorization: Bearer` + `apikey` 헤더로 전송.

### 데이터베이스 (Supabase Postgres)
- 저장 테이블: `ocr_document`(문서 헤더·parsed_json·합계·상태) + `ocr_line_item`(품목별 raw 값).
- 테넌트: **SMARTPD_DEV** (`881f6cc1-b552-468c-b9b4-152edb464e61`).
- 익명 키로 읽기/쓰기 동작 확인.

### 배포 파이프라인
- Git: `github.com/smartpd-eco/meatos`, `main` 브랜치 → Vercel 자동 배포.
- Edge Function: `npx supabase functions deploy analyze-invoice --project-ref pkrsiqjzllyiafwpskll` (git push와 별개, 수동).

---

## 5. 처리 파이프라인 (현행)

```text
홈 "거래명세서 스캔" 버튼
→ scan.html: 사진 촬영/파일 선택
→ 클라이언트 축소(≈1600px, JPEG)
→ analyze-invoice 호출(Authorization 헤더)
→ Gemini 3.1 Flash-Lite 인식(≈3초, thinking off)
→ 거래명세서 양식 표 렌더
→ 셀 직접 수정(검수) · 중량×단가 자동계산
→ "매입 저장" → ocr_document + ocr_line_item 기록
→ records.html에서 목록·상세 조회
```

---

## 6. 남은 과제 (다음 단계 후보)

- **재고 반영**: 저장한 품목을 표준 상품과 매칭해 실제 재고 수량으로 반영.
- **촬영 경로 보정**: 기울기·반사 사진에서 합계 인식 흔들림 → OpenCV 보정 강화 또는 재촬영 유도.
- **다중 페이지**: "페이지 1/…" 명세서의 여러 장을 촬영·합산.
- **콜드 스타트 단축**: 첫 호출 4~5초 → 모델 고정(`GEMINI_VISION_MODEL`)·예열.
- **전체 앱 이식(선택)**: 이 양식·검수·저장을 기존 앱 화면에 통합(캐시 관리 필요).

---

## 7. 관련 문서
- `docs/04_AI/OCR_MODEL_COST_COMPARISON.md` — Flash vs Flash-Lite 비용·속도 비교.
- `docs/04_AI/OCR_ENGINE_ANALYSIS.md` — 오픈소스 OCR vs LLM 비전 분석.
- `OCR_FINAL_HANDOFF_PADDLE_GEMINI25_FLASH_VERCEL.md` — 초기 인수인계서.
