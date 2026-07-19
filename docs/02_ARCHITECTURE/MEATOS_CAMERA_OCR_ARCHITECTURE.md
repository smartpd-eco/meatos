
# MEATOS_CAMERA_OCR_ARCHITECTURE.md
# MEATOS 카메라 OCR 및 거래명세서 인식 아키텍처

**Version**: 1.0  
**Status**: Architecture Decision Draft  
**Owner**: Peter / SmartPD  
**Date**: 2026-07-11  
**Scope**: 카메라 촬영, 갤러리 업로드, 거래명세서 OCR, 표 구조화, 상품 치환, 사용자 검수

---

## 1. 결론

MEATOS의 OCR은 단일 OCR API 하나에 맡기지 않는다.

다음의 **다단계 하이브리드 구조**를 기본으로 한다.

```text
카메라/갤러리
→ 이미지 품질 검사
→ 자동 보정
→ 1차 OCR
→ 표·행·열 구조화
→ 거래명세서 필드 추출
→ Product Dictionary/Alias 매칭
→ 계산 검증
→ 사용자 Review
→ Learning DB 저장
→ 입고 반영
```

### 1차 권장 조합

```text
브라우저/PWA 카메라
+ NAVER CLOVA OCR General
+ MEATOS 자체 문서 파서
+ Product Dictionary/Alias Engine
+ Supabase Edge Function
+ 사용자 Review Queue
```

### 보조 검증 조합

```text
Azure Document Intelligence 또는 Google Document AI
```

대형 유통사·복잡한 양식·저품질 사진에 대해 비교 검증용으로 사용한다.

---

## 2. 왜 OCR가 기본 중의 기본인가

영세 사업장의 거래명세서는 다음과 같이 표준화되어 있지 않을 수 있다.

- 인쇄 거래명세서
- 도트프린터 출력물
- 세금계산서형 서식
- 공급사 자체 ERP 출력물
- 손글씨 추가 메모
- 도장 또는 서명 포함
- 품목명이 축약된 문서
- 표 선이 흐리거나 없는 문서
- 접히거나 구겨진 문서
- 휴대전화 그림자와 반사광이 포함된 사진
- 한 장에 여러 거래명세서가 겹친 사진
- 공급가액·세액·합계 계산 방식이 다른 문서

따라서 단순히 글자를 읽는 것만으로는 부족하다.

MEATOS OCR의 성공 기준은 다음과 같다.

> 글자를 읽는 것보다, 거래명세서의 각 품목 행을 정확히 복원하고 표준상품에 안전하게 연결하는 것이 중요하다.

---

## 3. OCR 엔진 검토

## 3.1 NAVER CLOVA OCR

### 장점

- 한국어 문서에 우선 검토할 수 있는 국내 서비스
- General OCR과 Template OCR 제공
- 이미지 전체 텍스트 인식과 지정 영역 추출 지원
- 한국어·영어·일본어 지원
- 한국어와 일본어 필기체 인식 기능 안내
- REST API 기반으로 서버 연동이 비교적 단순
- 국내 클라우드·지원 체계를 선호하는 사업자에게 적합

### 단점

- 공급사별 거래명세서 양식이 계속 달라지면 Template OCR만으로 대응하기 어렵다.
- General OCR 결과를 MEATOS가 자체적으로 표와 행 구조로 재구성해야 한다.
- 다양한 거래명세서에 대한 실제 정확도는 자체 데이터셋으로 반드시 평가해야 한다.

### 적용 판단

**MEATOS 1차 기본 OCR 엔진으로 권장한다.**

단, Template OCR 하나로 고정하지 않고 General OCR을 기본으로 사용한다.  
거래량이 많은 고정 공급사 양식만 Template을 추가한다.

공식 문서:

- [CLOVA OCR 개요](https://api.ncloud-docs.com/docs/ai-application-service-ocr)
- [CLOVA OCR 서비스](https://www.ncloud.com/product/aiService/ocr)

---

## 3.2 Microsoft Azure Document Intelligence

### 장점

- OCR뿐 아니라 표, 키-값, 문서 구조를 추출
- Invoice 모델이 송장·구매문서의 주요 필드와 품목 행을 구조화
- 휴대전화 촬영 이미지, 스캔 문서, 디지털 PDF 등 다양한 입력을 공식적으로 지원
- 고정 서식이 아닌 문서에도 Prebuilt Invoice 모델 사용 가능
- 필요하면 Custom Model로 MEATOS 거래명세서 전용 모델 확장 가능

### 단점

- 한국 축산 유통 거래명세서 용어와 필드에 완전히 맞지는 않을 수 있다.
- 클라우드·리전·비용·개인정보 정책 검토 필요
- 결과 구조를 MEATOS Product Dictionary와 연결하는 별도 계층 필요

### 적용 판단

**2차 비교 엔진 또는 복잡한 거래명세서용 보조 엔진으로 권장한다.**

공식 문서:

- [Azure Document Intelligence Invoice](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/invoice?view=doc-intel-4.0.0)
- [Azure Document Intelligence 개요](https://azure.microsoft.com/en-us/products/ai-foundry/tools/document-intelligence)

---

## 3.3 Google Cloud Document AI

### 장점

- OCR, 레이아웃, 표, 키-값 구조를 함께 처리
- 자동 기울기 보정과 문서 품질 평가 기능 제공
- 200개 이상의 언어에서 인쇄 및 손글씨 텍스트 인식을 지원하는 OCR Processor 제공
- Invoice Parser 등 조달·송장 특화 Processor 제공
- 문서 품질 점수를 이용해 재촬영 여부를 자동 판단하기 좋음

### 단점

- 국내 거래명세서에 대한 실전 정확도는 별도 테스트 필요
- 전체 Google Cloud 구성과 권한 관리가 다소 복잡할 수 있음
- 비용과 데이터 저장 위치 검토 필요

### 적용 판단

**이미지 품질 평가와 다국어·수입육 문서가 많은 경우 강력한 후보**다.

공식 문서:

- [Document AI 개요](https://docs.cloud.google.com/document-ai/docs/overview)
- [Document AI Processor 목록](https://docs.cloud.google.com/document-ai/docs/processors-list)

---

## 3.4 Amazon Textract

### 장점

- AnalyzeExpense API로 송장과 영수증 구조 추출
- 업체명, 날짜, 합계, 품목 행 등 표준화된 결과 제공
- 서식마다 별도 템플릿을 만들지 않고 다양한 송장·영수증을 분석하도록 설계
- AWS 기반 인프라를 사용할 경우 연결이 편리함

### 단점

- 한국어 거래명세서와 축산물 약어에 대한 실제 검증이 필요
- MEATOS가 현재 AWS 중심이 아니므로 운영 복잡도가 증가할 수 있음
- 국내 서비스 및 한국어 지원 관점에서 CLOVA보다 우선할 이유는 적음

### 적용 판단

**AWS를 주 인프라로 채택할 경우 후보**다. 현재는 우선순위가 낮다.

공식 문서:

- [Amazon Textract 송장·영수증 분석](https://docs.aws.amazon.com/textract/latest/dg/invoices-receipts.html)
- [AnalyzeExpense API](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeExpense.html)

---

## 4. 최종 권장안

## 4.1 MVP 단계

```text
Primary OCR   : NAVER CLOVA OCR General
Fallback      : 없음
Parser        : MEATOS 자체 파서
Review        : 필수
Backend       : Supabase Edge Function
Storage       : 원본 이미지 + OCR JSON + 정제 JSON 분리
```

### 이유

- 한국어 중심
- 초기 연결 난이도가 비교적 낮음
- 비용과 구조를 통제하기 쉬움
- 현재 MEATOS의 Supabase Edge Function 구조를 재사용할 수 있음
- 정확하지 않은 결과를 Review Queue로 보내는 현재 설계와 잘 맞음

---

## 4.2 정확도 검증 단계

동일한 실데이터 300~500장을 다음 엔진에 동시에 넣어 비교한다.

```text
A. NAVER CLOVA OCR
B. Azure Document Intelligence
C. Google Document AI
```

평가 항목:

- 업체명 정확도
- 사업자번호 정확도
- 거래일자 정확도
- 품목 행 개수 일치율
- 원본 품목명 문자 정확도
- 규격·수량·단위 정확도
- 단가·금액 정확도
- 공급가액·세액·합계 정확도
- 처리 시간
- 페이지당 비용
- 사용자 수정 횟수
- 공급사별 편차

최고 점수 하나만 선택하지 않는다.

```text
일반 거래명세서 → CLOVA
복잡한 표/불규칙 문서 → Azure 또는 Google
고정 공급사 양식 → Template OCR
```

처럼 문서 분류에 따라 엔진을 선택할 수 있다.

---

## 5. MCP의 역할

MCP는 OCR 엔진이 아니다.

MCP는 AI Agent가 다음 기능을 호출하도록 연결하는 **도구 통신 규격**으로 활용한다.

```text
OCR 요청
Source Registry 조회
Product Dictionary 검색
Alias 후보 검색
Review Queue 등록
원본 이미지 조회
검증 결과 기록
```

### 권장 방식

운영 서비스:

```text
Frontend
→ MEATOS API
→ Supabase Edge Function
→ OCR Provider
```

개발·관리 Agent:

```text
Codex/Claude
→ MEATOS MCP Server
→ Source Registry / Dictionary / Review 도구
```

따라서 OCR 실서비스 핵심 경로를 MCP에 직접 의존시키지 않는다.

> API는 운영 경로, MCP는 Agent 작업 경로로 분리한다.

---

## 6. 카메라 촬영 UX

OCR 정확도는 API보다 촬영 품질에서 크게 달라질 수 있다.

## 촬영 화면 필수 기능

- 거래명세서 테두리 가이드
- 자동 초점 안내
- 흔들림 감지
- 밝기 부족 경고
- 반사광 경고
- 문서 네 모서리 감지
- 기울기 보정
- 자동 자르기
- 회전 보정
- 재촬영 버튼
- 갤러리 선택
- 여러 장 연속 촬영
- 원본 미리보기

## 촬영 품질 판정

다음 조건이면 OCR 호출 전에 재촬영을 권고한다.

- 해상도 부족
- 글자 번짐
- 문서 일부 잘림
- 그림자가 주요 표 영역을 가림
- 반사광이 금액 또는 품목 영역을 가림
- 회전 각도가 너무 큼
- 한 이미지에 문서가 여러 장 포함됨

저품질 이미지를 비싼 OCR API로 보내는 것보다 촬영 단계에서 막는 것이 더 효율적이다.

---

## 7. 이미지 전처리

서버 전송 전에 또는 OCR 호출 직전에 다음 처리를 적용한다.

```text
EXIF 회전 보정
→ 문서 경계 감지
→ Perspective Transform
→ Crop
→ Grayscale
→ Contrast 보정
→ Noise 제거
→ Sharpen
→ 해상도 정규화
```

### 구현 후보

브라우저:

- Canvas API
- OpenCV.js

서버:

- Sharp
- OpenCV

### 권장

MVP에서는 브라우저의 과도한 전처리를 피하고 다음만 적용한다.

- 회전
- 자르기
- 크기 조절
- JPEG 품질 조절

고급 보정은 정확도 측정 후 추가한다.

---

## 8. OCR 결과 데이터 구조

원본 OCR 결과를 바로 입고 데이터로 사용하지 않는다.

```json
{
  "documentId": "DOC-20260711-0001",
  "sourceImage": {},
  "ocrProvider": "NAVER_CLOVA",
  "ocrRaw": {},
  "documentFields": {},
  "lineItems": [],
  "validation": {},
  "reviewStatus": "PENDING"
}
```

### documentFields

- supplierName
- supplierBusinessNo
- invoiceNo
- invoiceDate
- supplyAmount
- taxAmount
- totalAmount
- livestockTraceNo
- slaughterCertificateReference

### lineItems

- rowNo
- rawProductName
- normalizedProductName
- specification
- quantity
- unit
- unitPrice
- amount
- origin
- grade
- storageType
- dictionaryCandidateId
- productMasterId
- confidence
- reviewStatus

---

## 9. 거래명세서 파싱 전략

OCR가 반환한 글자 좌표를 이용해 표를 재구성한다.

```text
텍스트 박스 수집
→ Y 좌표 기준 행 그룹화
→ X 좌표 기준 열 정렬
→ 헤더 후보 탐지
→ 품목 행 범위 추출
→ 합계 영역 분리
→ 숫자형 필드 정규화
```

### 헤더 동의어 예시

| 표준 필드 | 원본 표현 |
|---|---|
| 상품명 | 품명, 품목, 제품명, 내역 |
| 규격 | 규격, 사양, 포장 |
| 수량 | 수량, 중량, Qty |
| 단위 | 단위, U/M |
| 단가 | 단가, 공급단가 |
| 금액 | 금액, 공급가액, 합계 |
| 원산지 | 원산지, 산지 |
| 이력번호 | 이력번호, 개체식별번호 |

공급사별 헤더 Alias도 Source Registry와 함께 저장한다.

---

## 10. 검증 엔진

OCR 정확도만 믿지 않고 업무 규칙으로 재검증한다.

## 계산 검증

```text
수량 × 단가 ≈ 금액
품목 금액 합계 ≈ 공급가액
공급가액 + 세액 ≈ 총액
```

반올림·절사 오차는 거래처별 허용 규칙을 둔다.

## 형식 검증

- 사업자번호 자릿수
- 날짜 형식
- 이력번호 형식
- 금액 숫자 변환
- 수량 음수 여부
- 필수 필드 누락

## 사전 검증

- Product Dictionary 후보 존재 여부
- 공급처 Alias 존재 여부
- 단위 호환 여부
- 냉장/냉동 충돌 여부
- 미박/무박 충돌 여부
- 전지/미전지 자동 병합 금지

---

## 11. Confidence 정책

Confidence는 OCR Provider 점수 하나로 결정하지 않는다.

```text
OCR 문자 신뢰도
+ 표 구조 신뢰도
+ 계산 검증
+ Dictionary 매칭
+ Supplier Alias 이력
+ 사용자 승인 이력
```

### 상태 기준

- 95 이상: 자동확정 후보
- 85~94: 빠른 확인
- 70~84: 사용자 검토
- 70 미만: 미매칭 또는 재촬영

초기에는 95 이상이라도 사용자 확인을 유지한다.  
충분한 운영 데이터가 쌓인 뒤 자동확정을 켠다.

---

## 12. 원본과 이력 보존

다음 자료를 각각 보존한다.

1. 원본 이미지
2. 전처리 이미지
3. OCR Provider 원본 JSON
4. MEATOS 정제 JSON
5. 사용자 수정 전 값
6. 사용자 수정 후 값
7. Product Dictionary 연결 결과
8. 입고 반영 결과
9. 처리 시간과 비용
10. 사용한 OCR 엔진과 버전

원본은 수정하거나 덮어쓰지 않는다.

---

## 13. 보안과 개인정보

거래명세서에는 업체명, 사업자번호, 연락처, 주소, 금액 정보가 포함될 수 있다.

필수 원칙:

- API 키를 브라우저에 노출하지 않는다.
- OCR 호출은 Edge Function 또는 서버를 통해 수행한다.
- 원본 이미지 접근 권한을 제한한다.
- 저장 기간 정책을 둔다.
- 로그에 원문 전체를 출력하지 않는다.
- 업체별 데이터가 다른 업체에 노출되지 않도록 Tenant를 분리한다.
- Production DB/RLS 변경은 PM 승인 후 진행한다.

---

## 14. 장애 대응

OCR API가 실패해도 업무가 멈추면 안 된다.

```text
촬영
→ 로컬/서버 Queue 저장
→ OCR 재시도
→ 실패 시 수동입력
```

상태:

- CAPTURED
- UPLOADED
- OCR_PENDING
- OCR_COMPLETED
- PARSE_FAILED
- REVIEW_REQUIRED
- APPROVED
- POSTED

동일 파일 중복 업로드를 막기 위해 파일 해시를 저장한다.

---

## 15. 단계별 구현 계획

## Sprint OCR-01 — 카메라 및 업로드

- 카메라 촬영
- 갤러리 선택
- 미리보기
- 재촬영
- 원본 저장
- Upload Queue

## Sprint OCR-02 — CLOVA OCR 연결

- Edge Function
- OCR 요청/응답
- 오류 처리
- Raw JSON 저장
- 처리 상태 표시

## Sprint OCR-03 — 거래명세서 파서

- 업체 정보
- 문서 정보
- 표 행 추출
- 합계 영역
- 계산 검증

## Sprint OCR-04 — Dictionary 연결

- Product Dictionary 검색
- Supplier Alias
- 후보 추천
- Confidence
- Review Queue

## Sprint OCR-05 — 비교 평가

- Azure/Google 비교
- 공급사별 정확도
- 비용/속도/수정량 분석
- OCR Routing 정책 확정

---

## 16. 완료 기준

OCR 기능은 다음 조건을 충족해야 완료로 본다.

- 카메라와 갤러리 모두 지원
- 원본 이미지 보존
- 거래처·일자·합계 추출
- 품목 행 개수 검증
- 품목명·수량·단가·금액 추출
- 계산 검증
- Dictionary 후보 연결
- 낮은 신뢰도 Review 처리
- 사용자 수정 이력 저장
- 재처리 가능
- API 장애 시 수동입력 가능

---

## 17. 최종 의사결정

### 기본 엔진

**NAVER CLOVA OCR General**

### 서비스 구조

**Supabase Edge Function을 통한 서버 호출**

### 문서 이해

**MEATOS 자체 파서 + Product Dictionary**

### 보조 엔진

**Azure Document Intelligence 또는 Google Document AI**

### MCP

**운영 OCR 엔진이 아니라 Agent 도구 연결용**

### 가장 중요한 원칙

> OCR 결과를 곧바로 재고에 반영하지 않는다.  
> OCR → 검증 → Dictionary → Review → 승인 → 입고 순서를 유지한다.

---

## 18. Codex 작업 지침

현재 Product Dictionary Sprint를 중단하지 않는다.

OCR 문서는 다음 Sprint 준비 문서로만 사용한다.

Codex는 PM 승인 전 다음을 수행하지 않는다.

- OCR Provider 실제 API 연결
- API 키 또는 환경변수 변경
- Supabase Function 배포
- 원본 이미지 저장소 정책 변경
- Production DB/RLS 변경

지금 자체 진행 가능한 범위:

- OCR 인터페이스 타입
- Mock OCR Adapter
- Upload Queue Mock
- Review UI 초안
- Provider Adapter 구조 설계
- 테스트용 Fixture 생성

---

## 참고 공식 자료

- NAVER Cloud CLOVA OCR 공식 문서
- Microsoft Azure Document Intelligence 공식 문서
- Google Cloud Document AI 공식 문서
- Amazon Textract 공식 문서
