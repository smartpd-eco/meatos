# MEATOS Vision AI 전략 및 비용 분석

Version: 2.0  
Date: 2026-07-16  
Status: Implementation Prepared / External Secrets Pending

## 1. 결론

CPU 기반 OCR을 우선하고, 불확실한 문서만 Vision LLM으로 비교하는 방향은 타당하다.

다만 다음 원칙을 고정한다.

1. OCR 또는 Vision LLM의 점수만으로 재고에 자동 반영하지 않는다.
2. 수량, 단가, 공급가액, 세액, 합계, 이력번호는 문서 증거와 검산을 모두 통과해야 한다.
3. 읽을 수 없는 값은 추정하지 않고 `null`과 Review 사유로 보존한다.
4. 높은 신뢰도는 자동 저장이 아니라 사용자 승인 후보를 의미한다.
5. 최종 재고 반영은 사용자 승인 후 Inventory Engine을 통해서만 수행한다.

## 2. 운영 파이프라인

```text
카메라/파일
  -> 품질 검사
  -> OpenCV 보정
  -> PaddleOCR + 좌표
  -> 표 행/열 복원
  -> 상품명 원문 보존
  -> 숫자/이력번호 증거 검증
  -> 상품 Dictionary 후보
  -> 불확실 셀만 EasyOCR/Tesseract 비교
  -> 여전히 불확실하면 Gemini 2.5 Flash 비교
  -> Gemini 결과 재검산
  -> 해결되지 않은 경우 GPT-4.1 비교
  -> GPT 결과 재검산
  -> 사용자 Review/승인
  -> Inventory Engine 반영
```

Vision LLM은 원본을 대체하지 않는다. 기존 OCR 결과와 이미지 증거를 비교하는 예외 처리 Provider다.

## 3. 승인 기준

단일 95% 기준을 사용하지 않는다.

### 승인 후보 조건

- 품목 행이 1개 이상 존재
- 필수 필드 증거가 모두 존재
- `수량 x 단가 = 공급가액` 일치
- `공급가액 + 세액 = 금액` 일치
- 품목 행 합계와 문서 합계 일치
- 이력번호/수입번호가 필요한 품목은 형식 검증 통과
- 상품 Dictionary 후보 연결률 80% 이상
- 미분류 단어와 충돌 필드 없음

하나라도 실패하면 자동 반영하지 않고 Review로 보낸다.

## 4. Provider 역할

| 단계 | Provider | 역할 | 호출 정책 |
|---|---|---|---|
| 1 | OpenCV | 회전, 기울기, 대비, 문서 영역 보정 | 모든 문서 |
| 2 | PaddleOCR | 글자와 좌표 추출 | 모든 문서 |
| 3 | MEATOS Parser | 표 복원, 필드 매핑, 숫자 검산 | 모든 문서 |
| 4 | EasyOCR | 낮은 신뢰도 상품명 셀 비교 | 필요한 셀만 |
| 5 | Tesseract | 숫자와 이력번호 재검증 | 필요한 셀만 |
| 6 | Gemini 2.5 Flash | 신규 양식/흐린 영역의 구조 비교 | 검증 실패 문서만 |
| 7 | GPT-4.1 | Gemini 이후 남은 예외 비교 | 최종 예외만 |

## 5. 현재 구현 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| OpenCV형 이미지 보정 | 구현됨 | 브라우저 이미지 파이프라인 |
| PaddleOCR | 구현됨 | 브라우저 SDK, 운영 성능 재측정 필요 |
| EasyOCR | 어댑터/서비스 구현 | 운영 서버 미배포 |
| Tesseract | 구현됨 | 숫자 비교용 |
| 증거 기반 검산 | 구현됨 | 누락/충돌/추론 숫자 차단 |
| Inventory 승인 차단 | 구현됨 | APPROVED 문서만 반영 |
| Gemini Provider | 서버 함수 준비 | API Key와 배포 필요 |
| GPT-4.1 Provider | 서버 함수 준비 | API Key와 배포 필요 |
| CPU OCR 서버 | 미구축 | 현재 문서의 서버 사양은 목표 구성 |

따라서 현재 상태를 CPU OCR 서버 운영 완료로 표현하면 안 된다.

## 6. 비용 산정 방식

건당 비용은 이미지 해상도, 입력 토큰, 출력 JSON 길이에 따라 달라진다. 고정 2원 또는 7원으로 확정하지 않는다.

공식 표준 요율 기준:

- Gemini 2.5 Flash: 입력 $0.30 / 1M tokens, 출력 $2.50 / 1M tokens
- GPT-4.1: 입력 $2.00 / 1M tokens, 출력 $8.00 / 1M tokens

예시 계산은 환율 1 USD = 1,500 KRW, 호출당 입력 3,000 tokens, 출력 1,000 tokens을 가정한다.

| Provider | 예시 건당 비용 |
|---|---:|
| Gemini 2.5 Flash | 약 $0.0034 / 약 5.1원 |
| GPT-4.1 | 약 $0.014 / 약 21원 |

Gemini 15%, GPT 2% 호출 가정:

| 월 문서 | Gemini 호출 | GPT 호출 | API 추정비 |
|---:|---:|---:|---:|
| 1,000 | 150 | 20 | 약 $0.79 / 약 1,200원 |
| 10,000 | 1,500 | 200 | 약 $7.90 / 약 11,900원 |
| 60,000 | 9,000 | 1,200 | 약 $47.40 / 약 71,100원 |

이 금액은 API 추론비만 포함한다. CPU 서버, Storage, 네트워크, Supabase/Vercel 비용은 별도다. 운영 후 실제 토큰 사용량으로 매월 다시 계산한다.

## 7. 시간 단축 설계

1. 촬영 직후 1600~2200px 범위로 해상도를 정규화한다.
2. 원본 전체를 여러 Provider에 반복 전송하지 않는다.
3. 첫 OCR 실패 필드의 셀 좌표만 잘라 재인식한다.
4. 이미지 해시와 셀 해시로 OCR 결과를 캐시한다.
5. 공급사 Template은 검증 성공 문서에서만 생성한다.
6. Provider 모델 버전을 고정하고 응답시간을 기록한다.
7. 모바일 화면에는 진행 상태와 확인 필드만 표시한다.

목표 3초는 SLA가 아니라 벤치마크 목표다. 모바일 네트워크, 이미지 크기, CPU 서버 동시 처리량을 포함한 p50/p95 측정 후 확정한다.

## 8. GPU 도입 판단

RTX 4060 8GB는 PaddleOCR 가속과 소규모 실험에는 사용할 수 있다. 그러나 Surya와 Vision 모델을 동시에 운영하고 동시 요청을 처리하기에는 메모리 여유가 부족할 수 있다.

GPU 도입 판단은 다음 실측값으로 결정한다.

- 월 Vision API 비용
- 월 문서 수와 피크 동시 요청
- CPU OCR p95 처리시간
- Vision fallback 비율
- GPU 서버의 전력/관리/장애 대응 비용

운영형 자체 Vision 서버는 16GB 이상 VRAM을 우선 검토하고, RTX 4060은 개발/벤치마크 장비로 분류한다.

## 9. 배포 전 필요한 항목

1. `GEMINI_API_KEY`
2. `OPENAI_API_KEY`
3. Supabase Secret 등록 승인
4. `analyze-invoice` Edge Function 배포 승인
5. 실제 거래명세서와 정답표 최소 30장
6. 공급사별 정확도/처리시간/호출비용 기준선

## 10. 완료 기준

- 숫자 필드 오류가 자동 재고 반영되지 않음
- 원문, 보정본, OCR 결과, Vision 비교 결과가 분리 저장됨
- Gemini/GPT 결과도 MEATOS 검산을 다시 통과함
- 사용자 승인 전 Inventory Engine 호출이 차단됨
- 문서별 Provider, 모델 버전, 처리시간, 토큰, 비용, fallback 사유가 기록됨
- 모바일 실촬영 30장 기준 결과 보고서가 생성됨

## 11. 공식 기준 자료

- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- OpenAI GPT-4.1 model and pricing: https://developers.openai.com/api/docs/models/gpt-4.1

가격과 지원 모델은 변경될 수 있으므로 배포 전 공식 문서를 다시 확인한다.
