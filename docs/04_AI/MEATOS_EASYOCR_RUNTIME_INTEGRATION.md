# MEATOS EasyOCR Runtime Integration

Version: 1.0  
Date: 2026-07-13  
Status: Implemented for local validation

## 1. 목적

PaddleOCR 결과가 불확실할 때 EasyOCR를 실제 비교 엔진으로 실행한다. 모든 문서에 여러 OCR을 동시에 실행하지 않고 실패한 문서와 필드만 단계적으로 재검증한다.

정확도 목표는 OCR 문자 점수 100%가 아니다. 상품명, 수량, 단가, 금액과 총액이 업무 규칙상 모순 없이 복원되고, 불확실한 값은 자동 반영되지 않는 상태다.

## 2. 실행 순서

```text
이미지 품질 검사 및 보정
 -> PaddleOCR Primary
 -> MEATOS 표 복원 및 계산 검증
 -> EasyOCR 상품명/한글 비교
 -> Tesseract 숫자/좌표 비교
 -> Field Voting 및 재검산
 -> CLOVA 최종 Fallback
 -> Review Queue
```

EasyOCR 실행 조건:

- PaddleOCR가 결과를 반환하지 못함
- 품목 행이 1개도 없음
- MEATOS Score가 92 미만
- 수량 x 단가와 금액이 불일치
- 공급가액 + 세액과 총액이 불일치
- 상품명 또는 필수 문서 필드가 누락됨

## 3. 런타임 구조

```text
Browser EasyOcrCompareProvider
 -> http://127.0.0.1:8765
 -> FastAPI
 -> EasyOCR ko/en CPU Runtime
 -> OpenCV 명암/선명도 보정
 -> 글자 Box + Confidence + 좌표
 -> MEATOS Table Reconstructor
 -> MEATOS Business Validator
```

EasyOCR는 브라우저에 모델을 싣지 않는다. Python 서비스가 모델을 한 번 메모리에 올리고 요청 간 재사용한다. 서비스가 꺼져 있으면 Health Check 실패 후 Tesseract와 CLOVA 순서로 계속 진행한다.

## 4. 파일 구조

```text
services/ocr-service/
  requirements.txt
  app/main.py
  app/easyocr_provider.py
scripts/run-easyocr-service.mjs
src/data/ocr-provider-adapter.js
src/data/ocr-provider-ensemble.js
```

모델 저장 위치:

```text
C:\MEATOS\ocr-models\easyocr
```

모델 파일은 Git에 커밋하지 않는다.

## 5. 실행

```bash
npm run ocr:easy
npm run dev
```

Health Check:

```text
GET http://127.0.0.1:8765/health
```

OCR:

```text
POST http://127.0.0.1:8765/recognize
Content-Type: application/json
```

## 6. 결과 계약

EasyOCR 결과는 Provider 고유 구조를 앱에 직접 노출하지 않는다.

```json
{
  "providerId": "easyocr-compare",
  "providerName": "EasyOCR Compare",
  "providerVersion": "easyocr@1.7.2",
  "providerConfidence": 91.2,
  "rawText": "...",
  "items": [],
  "lines": [],
  "processingMs": 2840
}
```

브라우저 어댑터는 이 값을 MEATOS 공통 OCR Contract로 바꾼 뒤 표 복원, 거래명세서 파싱, Dictionary 후보 생성, 계산 검증을 수행한다.

## 7. 선택 및 승인 정책

Provider 점수가 높다는 이유만으로 결과를 선택하지 않는다.

선택 우선순위:

1. 계산 검증 통과
2. 총액 일치
3. 품목 행 수
4. 필수 필드 충족
5. Dictionary/Alias 일치
6. OCR Confidence

자동 반영 후보 조건:

```text
MEATOS Score >= 92
calculationOk = true
totalAmountMatched = true
lineItems >= 1
```

현재 Sprint에서는 조건을 충족해도 Review 기록을 유지한다.

## 8. 오차 관리 원칙

OCR에서 오차범위 0%를 보장할 수는 없다. 대신 잘못된 데이터를 자동 반영하지 않는 구조로 업무 오차를 통제한다.

- 원본 OCR 결과를 변경하지 않는다.
- Provider별 후보와 선택 이유를 기록한다.
- 숫자 검산 실패는 자동 승인하지 않는다.
- 공급사 Alias 충돌은 Review로 보낸다.
- 사용자 수정은 Tenant별 Learning History에 저장한다.
- 같은 이미지 Hash는 결과를 재사용한다.

## 9. 검증 데이터셋

최소 100장으로 공급사별 Ground Truth를 만든다.

```text
정상 30장
기울어짐 15장
그림자/반사광 15장
저해상도/흔들림 15장
접힘/일부 가림 10장
다른 공급사 양식 15장
```

필드별 평가:

- 공급사명 정확도
- 거래일 정확도
- 품목 행 개수
- 상품명 CER 및 Dictionary Top1/Top5
- 수량/단가/금액 정확도
- 총액 검산 성공률
- Paddle 단독 대비 EasyOCR 개선율
- CLOVA 호출률
- Review 수정 건수

## 10. 완료 기준

- EasyOCR Health Check 성공
- 실제 이미지 OCR 성공
- Paddle 실패 시 EasyOCR 선택 실행
- EasyOCR 실패 시 Tesseract/CLOVA 진행
- 표와 품목 행 좌표 복원
- 계산 검증 실패 시 Review 이동
- Raw 결과 및 Provider 정보 보존
- Build/Lint/Test 통과

## 11. 1차 실문서 검증 결과

테스트 파일:

```text
C:\MEATOS\test-assets\good-meat-invoice.jpg
```

1차 EasyOCR CPU 결과:

```text
Provider: EasyOCR 1.7.2
텍스트 박스: 121개
복원 행: 18개
평균 Provider Confidence: 55.81
최초 처리시간: 약 79초
```

입력 최대 변 1,800px 제한 후 재검증:

```text
텍스트 박스: 116개
복원 행: 18개
평균 Provider Confidence: 59.33
처리시간: 약 48초
```

판정:

- EasyOCR 서비스, 한국어 모델, 이미지 전송, 좌표 결과 반환은 정상이다.
- 문서 제목, 날짜, 일부 금액과 품목 표현을 읽었지만 공급사명과 작은 한글은 오인식이 남았다.
- 이 결과는 자동 확정 기준을 충족하지 않으며 Paddle 결과 비교와 Review가 필요하다.
- CPU 전체 문서 재인식은 느리므로 운영에서는 실패한 상품명/숫자 영역만 Crop하여 EasyOCR에 전달해야 한다.
- 첫 결과를 근거로 최대 입력 크기를 1,800px로 제한하고 동시 추론을 직렬화했다.

다음 정확도 검증은 공급사별 정답 데이터와 Field Crop을 사용해 문자 정확도보다 상품명, 수량, 단가, 금액의 최종 업무 정확도로 측정한다.

## 12. Selective Field Crop 최적화 결과

Paddle 좌표를 재사용하여 EasyOCR의 Text Detection 단계를 생략했다. 가장 불확실한 행만 `상품 설명 / 수량·단가 / 금액` 셀로 나누고 Recognition 모델만 실행한다.

```text
전체 문서 OCR: 약 48초
행 Crop + Text Detection: 약 31초
행 Crop + Detection 생략: 약 10.15초
4개 우선 행 + 3개 Field Cell: 약 9.58초
모델 Warm 상태 Browser Adapter: 약 5.98초
반복 이미지 Memory Cache: 약 1ms, 네트워크 OCR 호출 없음
```

정확도 보호 정책:

- Paddle 숫자가 계산 검증을 통과하면 EasyOCR 숫자로 덮어쓰지 않는다.
- EasyOCR 숫자가 계산 검증을 통과하고 Paddle 숫자가 실패한 경우에만 교체 후보가 된다.
- 상품명은 EasyOCR Confidence가 더 높을 때만 교체 후보가 된다.
- 병합 후 전체 금액을 다시 검산한다.
- 검산 실패 결과는 CLOVA 또는 Review Queue로 이동한다.

현재 좋은축산 테스트 문서에서 EasyOCR 단독 Confidence는 자동 승인 기준보다 낮았다. 따라서 이 문서에서는 EasyOCR가 보조 후보만 제공하고 Paddle 결과와 업무 검산이 최종 선택을 통제한다.

수동 비율로 만든 테스트 Crop은 실제 Paddle 좌표보다 범위가 넓어 4개 행 중 1개만 구조화된 품목으로 복원됐다. 운영 경로는 Paddle의 실제 행 Bounds를 사용하지만, 공급사별 Column Anchor가 충분히 학습되기 전까지 EasyOCR 숫자는 산술 검증을 통과한 경우에만 반영한다.
