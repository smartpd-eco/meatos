# MEATOS OCR Apex AI Strategy
## 오픈소스 OCR 장점 융합 기반 거래명세서 전용 AI OCR 설계

- 문서 버전: 1.0
- 작성일: 2026-07-13
- 프로젝트: MEATOS AI 축산물 유통 SCM 플랫폼
- 목표: 무료/저비용 OCR 엔진들의 장점만 조합하여, 축산물 거래명세서에 특화된 고정확도 OCR AI를 구현한다.

---

## 1. 결론

MEATOS는 특정 OCR 하나에 종속되면 안 된다.

PaddleOCR, EasyOCR, Tesseract, Docling, Surya, OpenCV, Table Transformer의 장점을 분해해서 다음 구조로 재조립한다.

```text
MEATOS OCR Apex AI
  = 이미지 보정 엔진
  + 다중 OCR Provider
  + 표 구조 복원 엔진
  + 축산물 거래명세서 전용 Parser
  + 상품 Alias Engine
  + 금액/수량 검산 엔진
  + 사용자 수정 학습 AI
```

핵심은 OCR 모델이 아니라 **거래명세서 업무 지식 기반 검증 AI**다.

OCR은 글자를 읽는다.  
MEATOS는 입고 데이터를 만든다.

---

## 2. 공식 소스 및 검토 링크

| 구분 | 공식 링크 | 라이선스/주의 | MEATOS에서 가져올 장점 |
|---|---|---|---|
| PaddleOCR | https://github.com/PaddlePaddle/PaddleOCR | Apache-2.0 | 한국어 OCR, PP-OCR, PP-Structure, 문서 구조화 |
| PaddleOCR.js | https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js | Apache-2.0 | 브라우저 OCR, WASM/ONNX 기반 로컬 실행 |
| EasyOCR | https://github.com/JaidedAI/EasyOCR | Apache-2.0 | 설치 쉬움, 한국어 포함 다국어 OCR 비교 엔진 |
| Tesseract | https://github.com/tesseract-ocr/tesseract | Apache-2.0 | hOCR/TSV 좌표 출력, 검증용 보조 OCR |
| Tesseract language data | https://github.com/tesseract-ocr/tessdata_best | Apache-2.0 | 정확도 우선 언어 데이터 |
| hOCR 표준 | https://kba.github.io/hocr-spec/ | 공개 표준 | 글자/단어 좌표, confidence, layout 표현 방식 |
| Docling | https://github.com/docling-project/docling | MIT | 문서 변환, 레이아웃 분석, TableFormer 기반 표 구조 |
| Surya OCR | https://github.com/datalab-to/surya | 코드 Apache-2.0, 모델은 별도 조건 확인 필요 | layout, reading order, table recognition, OCR 오류 감지 |
| OpenCV | https://github.com/opencv/opencv | Apache-2.0 | 기울기 보정, 문서 외곽 검출, 표 선 검출, 명암 보정 |
| Microsoft Table Transformer | https://github.com/microsoft/table-transformer | MIT | 표 영역/행/열 검출 아이디어 |
| Layout Parser | https://github.com/Layout-Parser/layout-parser | Apache-2.0 | 문서 이미지 레이아웃 분석 프레임워크 |

주의: Surya는 코드와 모델 가중치의 라이선스 조건이 다르다. 상용 서비스에 넣기 전 반드시 모델 라이선스를 별도 검토한다.

---

## 3. OCR별 특장점 교차 검증

| OCR/도구 | 강점 | 약점 | MEATOS 사용 위치 | 단독 주력 여부 |
|---|---|---|---|---|
| PaddleOCR | 한국어 OCR, 속도/정확도 균형, PP-Structure 지원, 브라우저 SDK 존재 | 모델 파일 관리 필요, 거래명세서 전용 파싱은 직접 필요 | 1차 OCR Primary | 가능 |
| EasyOCR | 설치 쉬움, 한국어 가능, 빠른 비교 테스트 좋음 | 표 구조 복원 약함, 운영 속도 최적화 필요 | Paddle 결과 비교용 Secondary | 단독은 비추천 |
| Tesseract | 완전 무료, hOCR/TSV 좌표 강함, 검산 보조 좋음 | 사진 문서/기울어진 표/작은 글씨에 약함 | 좌표 검증, 숫자 재확인, fallback | 단독은 비추천 |
| Docling | 문서 구조화와 표 해석에 강함 | 무거울 수 있음, 한국어 OCR 자체보다 구조 파싱 중심 | 표 구조 복원 아이디어/서버 옵션 | 보조 구조 엔진 |
| Surya | OCR, layout, reading order, table recognition 통합 | 모델 크기/런타임 부담, 모델 라이선스 확인 필요 | 고정확도 서버 옵션, 검증 리그 | 조건부 |
| OpenCV | 빠름, 무료, 전처리 필수 도구 | OCR 자체는 아님 | 모든 OCR 전처리 앞단 | 필수 |
| Table Transformer | 표 검출 전문 | OCR은 아님, 통합 작업 필요 | 표 영역/셀 후보 검출 연구용 | 보조 |

판단:

```text
PaddleOCR = 기본 OCR 엔진
OpenCV = 품질을 올리는 전처리 엔진
Tesseract = 좌표/숫자 검증 엔진
EasyOCR = 교차 OCR 비교 엔진
Docling/Table Transformer = 표 구조 복원 아이디어
Surya = 서버형 고정확도 후보, 라이선스 확인 후 제한 적용
```

---

## 4. MEATOS가 직접 만들어야 하는 핵심

오픈소스에서 가져올 것은 OCR 모델 자체보다 다음 설계 원리다.

```text
1. 글자를 여러 방식으로 읽는다.
2. 글자를 좌표로 정렬한다.
3. 표 행/열을 복원한다.
4. 업무 규칙으로 틀린 값을 걸러낸다.
5. 사용자 수정값을 학습한다.
```

MEATOS 전용 모듈:

```text
src/data/ocr-image-preprocessor.js
src/data/ocr-provider-ensemble.js
src/data/ocr-table-reconstructor.js
src/data/ocr-invoice-parser.js
src/data/ocr-business-validator.js
src/data/ocr-learning-ai.js
```

---

## 5. 목표 아키텍처

```text
거래명세서 이미지
  |
  v
Image Quality Gate
  - 해상도
  - 흔들림
  - 밝기
  - 대비
  - 기울기
  |
  v
Preprocessing Variants
  - 원본
  - 문서 외곽 crop
  - 기울기 보정
  - 흑백/이진화
  - contrast/sharpen
  - table crop
  |
  v
Fast OCR Lane
  - PaddleOCR browser/local
  - 1회 우선 실행
  |
  v
Confidence Gate
  - 필수 필드 존재
  - 품목 행 수
  - 숫자 검산
  - Alias 매칭률
  |
  +-- 통과 --> MEATOS Normalized Invoice
  |
  +-- 실패/불확실 -->
        Selective Ensemble Lane
          - EasyOCR 후보 비교
          - Tesseract TSV/hOCR 숫자/좌표 확인
          - 표 영역 crop 재시도
          - 필요 시 CLOVA 1회 fallback
```

---

## 6. 속도 전략

목표는 사용자가 느끼지 못하는 수준이다.

초기 목표:

| 단계 | 목표 시간 |
|---|---:|
| 이미지 품질 분석 | 100ms 이하 |
| 전처리 preview 생성 | 300ms 이하 |
| 1차 Paddle OCR | 1.5초 이하 |
| 표 복원/파싱/검산 | 300ms 이하 |
| 성공 케이스 전체 | 2초 이하 |
| 불확실 케이스 ensemble | 5초 이하 |

운영 원칙:

- 모든 OCR을 항상 동시에 돌리지 않는다.
- 먼저 가장 빠른 경로를 돌린다.
- 실패한 필드만 추가 OCR을 돌린다.
- 같은 이미지는 hash로 캐시한다.
- crop 단위 결과도 캐시한다.
- 사용자는 즉시 preview를 보고, OCR은 백그라운드에서 진행된다.

```text
좋은 UX = 빠른 성공 + 조용한 재시도 + 필요한 부분만 확인
```

---

## 7. 정확도 전략

OCR confidence만 믿지 않는다.

거래명세서에서는 업무 검산이 더 강하다.

필수 검증:

```text
수량 x 단가 = 공급가
행 공급가 합계 = 문서 총액
공급가 + 세액 = 청구액
사업자번호 형식 = 000-00-00000
거래일자 형식 = YYYY-MM-DD
수량/단가/금액은 숫자 범위 안
상품명은 축산물 Alias 후보와 유사
원산지/등급/보관상태 키워드 존재 여부
```

MEATOS 신뢰 점수:

```text
meatosScore =
  OCR confidence 25%
  table reconstruction 20%
  arithmetic validation 25%
  required fields 15%
  alias matching 15%
```

자동 입고 허용 기준:

```text
meatosScore >= 92
arithmeticValidation = true
lineItems >= 1
aliasMatchRate >= 80%
totalAmountMatched = true
```

그 외는 Review Queue로 보낸다.

---

## 8. 각 오픈소스 장점의 MEATOS 적용 방식

### 8.1 PaddleOCR에서 가져올 것

- 한국어/다국어 OCR 기본 엔진
- text detection + recognition 분리 구조
- PP-Structure의 문서 구조화 사고방식
- PaddleOCR.js의 브라우저 로컬 실행
- 모델 버전 고정 및 provider metadata 기록

적용:

```text
provider: paddleocr
role: primary_fast_ocr
output: text boxes + confidence + raw text
```

### 8.2 EasyOCR에서 가져올 것

- 간단한 설치와 빠른 비교 실행
- 특정 crop에서 Paddle이 약한 글자를 재확인
- 한국어 품목명 비교 후보 생성

적용:

```text
provider: easyocr
role: secondary_text_vote
trigger:
  - 상품명 confidence 낮음
  - 숫자 검산 실패
  - Paddle 결과 공백
```

### 8.3 Tesseract에서 가져올 것

- hOCR/TSV처럼 단어 단위 좌표와 confidence를 명시적으로 활용
- 숫자 열, 날짜, 사업자번호 같은 정형 필드 재검증
- 매우 저비용 fallback

적용:

```text
provider: tesseract
role: coordinate_and_numeric_validator
trigger:
  - 총액/단가/수량 불일치
  - 사업자번호/날짜 인식 실패
```

### 8.4 Docling에서 가져올 것

- 문서를 구조화된 표현으로 바꾸는 관점
- 표를 단순 텍스트가 아니라 row/cell 구조로 보는 방식
- Markdown/JSON 출력의 문서 AI 친화 구조

적용:

```text
module: meatos-table-reconstructor
role: table_structure_inspiration
output: rows, columns, cells, spans
```

### 8.5 Surya에서 가져올 것

- OCR + layout + reading order + table recognition 통합 관점
- block 단위 confidence와 HTML/table 출력 구조
- OCR error detection 사고방식

적용:

```text
provider: surya_optional
role: high_accuracy_server_candidate
status: license_review_required
```

### 8.6 OpenCV에서 가져올 것

- 문서 외곽 검출
- 기울기 보정
- 표 선 검출
- 명암/대비/샤프닝
- crop variant 생성

적용:

```text
module: ocr-image-preprocessor
role: accuracy_multiplier
```

---

## 9. MEATOS Ensemble 판단 로직

모든 엔진을 병렬로 무조건 돌리면 느리다.

대신 단계형 ensemble을 쓴다.

```text
Step 1. PaddleOCR 단독 실행
Step 2. MEATOS 검산
Step 3. 통과하면 종료
Step 4. 실패 필드만 crop
Step 5. crop에 EasyOCR/Tesseract 선택 실행
Step 6. 결과 후보를 field 단위로 투표
Step 7. 금액/수량 검산으로 최종 선택
Step 8. 불확실하면 사용자 확인
Step 9. 사용자 수정값을 학습
```

Field voting 예시:

```json
{
  "field": "totalAmount",
  "candidates": [
    { "provider": "paddleocr", "value": 3105880, "confidence": 0.82 },
    { "provider": "tesseract", "value": 3105880, "confidence": 0.76 },
    { "provider": "business_rule", "value": 3105880, "confidence": 0.99 }
  ],
  "selected": 3105880,
  "reason": "two_providers_and_arithmetic_matched"
}
```

---

## 10. 우리 학습 AI 연결

사용자 수정은 단순 로그가 아니라 학습 데이터다.

저장할 학습 이벤트:

```text
rawText
selectedText
fieldName
providerCandidates
imageCropHash
supplierId
templateId
userCorrection
acceptedAliasId
createdAt
```

학습 대상:

```text
공급사별 템플릿
상품명 Alias
숫자 오인식 패턴
행/열 위치 패턴
품목명-원산지 결합 패턴
단가 범위
보통 출고 단위
```

예:

```text
OCR: 미후지(황금)
사용자 확정: 냉동 미후지
Alias 학습: 미후지, 황금, 냉동미후지 -> 냉동 미후지
```

다음번에는 OCR 글자가 조금 틀려도 업무 데이터는 맞게 만든다.

---

## 11. 구현 우선순위

### Phase 1: 현재 프로젝트 즉시 적용

1. PaddleOCR 모델 파일 경로 확정
2. OCR 결과 공통 Contract 유지
3. 이미지 hash 기반 캐시 추가
4. 필수 필드/금액 검산 score 추가
5. 실패 필드만 Review Queue로 이동

### Phase 2: 전처리 엔진

1. OpenCV 기반 문서 외곽 crop
2. 기울기 보정
3. 흑백/대비/샤프닝 variant
4. 표 영역 자동 crop
5. crop별 OCR 결과 캐시

### Phase 3: 다중 OCR 교차 검증

1. EasyOCR 서버형 adapter 추가
2. Tesseract TSV adapter 추가
3. field-level voting 엔진 추가
4. 숫자 필드 전용 재인식
5. provider별 정확도 로그

### Phase 4: 표 구조 복원

1. 좌표 기반 row grouping
2. column anchor 추정
3. 품목명/원산지/수량/단가/공급가 열 분리
4. 공급사별 template memory
5. 수동 수정 기반 template update

### Phase 5: Apex AI

1. 사용자 수정값 학습
2. 공급사별 자동 템플릿 추천
3. Alias Engine 자동 추천
4. OCR provider 자동 선택
5. CLOVA 호출 최소화 정책

---

## 12. 소스 다운로드 및 프로젝트 반영 원칙

오픈소스 코드를 무작정 프로젝트에 복사하지 않는다.

원칙:

```text
1. 공식 저장소 URL 기록
2. commit SHA 또는 release tag 고정
3. LICENSE/NOTICE 보존
4. vendor 폴더는 참조용
5. 운영 코드는 services 아래에 adapter 형태로 작성
6. 모델 파일은 별도 models 폴더에 관리
7. npm/python package로 설치 가능한 것은 package manager 사용
```

권장 폴더:

```text
C:\MEATOS
  docs\04_AI
  services\ocr-service
    app
      providers
        paddle_provider.py
        easyocr_provider.py
        tesseract_provider.py
      preprocessing
      table
      parser
      learning
    models
    tests
  vendor
    PaddleOCR
    EasyOCR
    tesseract
    docling
    surya
```

주의:

- Git clone은 코드 참조용이다.
- 모델 파일은 별도 다운로드가 필요한 경우가 많다.
- 모델 라이선스는 코드 라이선스와 다를 수 있다.
- Production 배포 전 라이선스 검토를 완료한다.

---

## 13. 성능/정확도 검증 기준

최소 샘플:

| 샘플 유형 | 최소 개수 |
|---|---:|
| 좋은축산 거래명세서 | 10 |
| 다른 공급사 거래명세서 | 20 |
| 기울어진 사진 | 10 |
| 어두운 사진 | 10 |
| 흔들린 사진 | 10 |
| 접힘/그림자 | 10 |
| PDF/스캔 | 10 |
| 품목 많은 문서 | 10 |

평가 지표:

```text
필수 헤더 정확도
품목 행 분리 정확도
상품명 정확도
수량 정확도
단가 정확도
공급가 정확도
총액 검산 성공률
Alias 자동 매칭률
자동 입고 가능률
Review Queue 비율
평균 처리 시간
외부 API 호출률
문서당 비용
```

목표:

```text
총액 검산 성공률 >= 99%
수량/단가/공급가 정확도 >= 97%
상품 Alias 자동 매칭률 >= 90%
자동 입고 가능률 >= 80%
Review Queue 비율 <= 15%
CLOVA fallback <= 10%
성공 케이스 체감 처리시간 <= 2초
```

---

## 14. 개발 금지 사항

- OCR confidence만 보고 자동 입고하지 않는다.
- 모든 OCR 엔진을 항상 병렬 실행하지 않는다.
- main branch 최신 코드를 검증 없이 운영 반영하지 않는다.
- 모델 라이선스 확인 없이 상용 배포하지 않는다.
- 사용자 수정값을 학습 데이터로 저장하지 않고 버리지 않는다.
- 숫자 검산 실패 문서를 자동 반영하지 않는다.
- 시크릿/API 키를 코드나 로그에 남기지 않는다.

---

## 15. 최종 설계 판단

MEATOS의 OCR 경쟁력은 “PaddleOCR을 붙였다”가 아니다.

경쟁력은 다음 세 가지다.

```text
1. 축산물 거래명세서 전용 표 복원
2. 상품 Alias Engine
3. 업무 검산 기반 AI 학습 루프
```

오픈소스 OCR은 부품이다.

MEATOS는 그 부품들을 조합해서 **거래명세서를 재고 데이터로 바꾸는 AI**가 되어야 한다.

최종 운영 구조:

```text
Fast Path:
  PaddleOCR + OpenCV + MEATOS 검산

Selective Path:
  EasyOCR/Tesseract field-level 재확인

Structure Path:
  MEATOS Table Reconstructor

Learning Path:
  사용자 수정 + Alias + 공급사 템플릿 학습

Paid Emergency Path:
  CLOVA 1회 제한 fallback
```

이 구조가 비용을 낮추고, 속도를 유지하고, 시간이 갈수록 정확도가 올라가는 방향이다.
