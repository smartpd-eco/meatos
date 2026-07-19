# TASK_ORDER_023_PADDLEOCR_PRIMARY_CLOVA_FALLBACK.md

# MEATOS OCR 하이브리드 전환 설계
## PaddleOCR Primary + CLOVA OCR Fallback

- 문서 버전: 1.0
- 작성일: 2026-07-13
- 프로젝트: MEATOS
- 우선순위: 최상
- 상태: 덱스 구현 결과 검토 후 후속 개발 기준
- 저장 위치:

```text
C:\MEATOS\docs\04_AI\TASK_ORDER_023_PADDLEOCR_PRIMARY_CLOVA_FALLBACK.md
```

---

## 1. 결정 사항

MEATOS의 OCR Provider 우선순위를 다음과 같이 변경한다.

```text
1차 OCR: PaddleOCR 자체 운영
2차 OCR: NAVER CLOVA OCR
3차 처리: 사용자 검토 Review Queue
```

최종 처리 흐름:

```text
카메라 촬영 또는 파일 업로드
→ 이미지 품질 검사
→ PaddleOCR 호출
→ 텍스트·표·필수값 신뢰도 평가
→ 통과: 결과 사용
→ 실패/저신뢰: CLOVA OCR 호출
→ CLOVA 통과: 결과 사용
→ 둘 다 불확실: Review Queue
→ 사용자 확인 후 입고·재고 반영
```

PaddleOCR는 이미지와 PDF를 구조화된 데이터로 변환하는 오픈소스 OCR 도구이며, PP-StructureV3는 레이아웃 및 표 구조 분석을 지원한다. 공식 저장소는 Apache License 2.0으로 배포된다.

---

## 2. 중요한 아키텍처 원칙

### 2.1 PaddleOCR를 브라우저나 Supabase Edge Function에 직접 넣지 않는다

PaddleOCR는 Python/Paddle 런타임과 모델 파일이 필요한 추론 서비스다.

```text
MEATOS Web/PWA
      |
      v
Supabase Edge Function: analyze-ocr
      |
      +------> PaddleOCR Service (Primary)
      |
      +------> CLOVA OCR API (Fallback)
      |
      v
Normalization / Review / DB
```

권장 역할:

| 구성요소 | 역할 |
|---|---|
| 브라우저/PWA | 카메라·파일 입력, 상태 표시, 결과 검토 |
| Supabase Edge Function | 인증, tenant 검사, Provider 선택, 재시도, 결과 통합 |
| PaddleOCR Service | 이미지 전처리, 한국어 OCR, 표 구조 추출 |
| CLOVA OCR | PaddleOCR 실패 또는 저신뢰 문서 보조 처리 |
| Supabase DB/Storage | 원본·보정본·결과·Provider 이력 저장 |

### 2.2 로컬 개발과 운영 환경을 구분한다

개발:

```text
C:\MEATOS\services\paddleocr-service
```

운영:

```text
Docker 기반 별도 OCR Worker/Service
```

로컬 PC에만 설치된 PaddleOCR를 운영 서비스로 간주하지 않는다.

---

## 3. 권장 폴더 구조

```text
C:\MEATOS
├─ services
│  └─ paddleocr-service
│     ├─ app
│     │  ├─ main.py
│     │  ├─ api/ocr.py
│     │  ├─ core/config.py
│     │  ├─ preprocessing
│     │  ├─ providers
│     │  ├─ parsers
│     │  └─ schemas
│     ├─ models
│     ├─ tests
│     ├─ Dockerfile
│     ├─ docker-compose.yml
│     ├─ requirements.lock
│     ├─ .env.example
│     └─ README.md
├─ supabase/functions/analyze-ocr/index.ts
└─ docs
   ├─ 04_AI
   └─ 08_SPRINT
```

PaddleOCR 원본 저장소를 애플리케이션 코드에 무작정 복사하지 않는다.

필요 시 참조 영역:

```text
C:\MEATOS\vendor\PaddleOCR
```

운영 코드는 `services\paddleocr-service`에 어댑터 형태로 작성한다.

---

## 4. Git Clone 및 버전 관리 원칙

공식 저장소:

```text
https://github.com/PaddlePaddle/PaddleOCR.git
```

권장:

```powershell
cd C:\MEATOS\vendor
git clone https://github.com/PaddlePaddle/PaddleOCR.git
cd PaddleOCR
git checkout <검증된_태그_또는_커밋>
```

금지:

- main 브랜치를 매 실행 때 자동 pull
- 검증되지 않은 최신 버전 자동 적용
- 모델 버전 기록 없이 운영

반드시 기록할 값:

- PaddleOCR Git commit SHA
- PaddleOCR 패키지 버전
- PaddlePaddle 버전
- Python 버전
- PP-OCR 모델명
- PP-Structure 모델명
- 언어 모델
- 실행 장치 CPU/GPU
- Docker image digest

---

## 5. PaddleOCR 구성 기준

### 5.1 일반 문자 인식 대상

- 공급사명
- 사업자번호
- 거래일자
- 거래명세서 번호
- 품목명
- 규격
- 수량
- 단가
- 공급가액
- 세액
- 합계

### 5.2 표 구조 인식

거래명세서에는 표 구조가 핵심이므로 PP-StructureV3 또는 공식 표 인식 Pipeline을 사용한다.

```text
문서 레이아웃 분석
→ 표 영역 검출
→ 셀/행/열 구조 추론
→ 셀 텍스트 OCR
→ HTML/JSON 구조 생성
→ MEATOS 품목행으로 변환
```

### 5.3 모델 선택 원칙

최소 비교:

```text
A. 경량 CPU 모델
B. 정확도 우선 서버 모델
C. PP-StructureV3 표 인식
```

선택 기준:

- 한국어 품목명 정확도
- 숫자 정확도
- 표 행·열 복원율
- CPU 처리시간
- 메모리 사용량
- 문서 1장당 평균 비용
- 운영 난이도

---

## 6. 공통 OCR 응답 계약

Provider별 결과를 UI에 직접 전달하지 않고 공통 구조로 변환한다.

```json
{
  "ok": true,
  "provider": "paddleocr",
  "providerVersion": "pinned-version",
  "fallbackUsed": false,
  "document": {
    "supplierName": "공급사명",
    "businessNumber": "000-00-00000",
    "documentNumber": "0002",
    "transactionDate": "2026-07-06",
    "totalAmount": 3105880,
    "taxAmount": 0
  },
  "lines": [],
  "quality": {
    "imageQualityScore": 0.0,
    "textConfidence": 0.0,
    "tableConfidence": 0.0,
    "requiredFieldScore": 0.0,
    "arithmeticValidation": false
  },
  "timing": {
    "preprocessMs": 0,
    "ocrMs": 0,
    "parseMs": 0,
    "totalMs": 0
  },
  "errors": []
}
```

---

## 7. CLOVA Fallback 조건

다음 조건 중 하나 이상이면 fallback 후보로 판정한다.

### 기술적 실패

- HTTP 오류
- OCR Service timeout
- 모델 로드 실패
- 파일 디코딩 실패
- 응답 JSON 파싱 실패
- 표 Pipeline 예외

### 품질 실패

- `textConfidence < 기준값`
- `tableConfidence < 기준값`
- 품목행 0건
- 필수 헤더 미검출
- 숫자열 분리 실패
- 합계 검산 실패
- 거래일자 미검출
- 공급사 미검출
- 문서 전체가 잘림 또는 흐림

초기 권장 임계치:

```text
textConfidence < 0.88
tableConfidence < 0.85
requiredFieldScore < 0.90
품목행 < 1
합계 검산 실패
```

임계치는 하드코딩하지 않고 환경설정 또는 DB Policy로 관리한다.

---

## 8. Provider 결정 로직

```text
1. 파일·이미지 검증
2. 중복 문서 검사
3. PaddleOCR 실행
4. 결과 정규화
5. 필수값 및 산술 검증
6. Confidence 평가
7. 통과하면 PaddleOCR 결과 채택
8. 실패하면 CLOVA OCR 1회 호출
9. CLOVA 결과 정규화
10. 두 결과 비교
11. 신뢰도 높은 결과 또는 검산 가능한 필드별 결과 선택
12. 불확실하면 Review Queue
```

---

## 9. 산술 검증

반드시 아래를 검증한다.

```text
수량 × 단가 ≈ 공급가액
공급가액 + 세액 ≈ 행 합계
모든 행 합계 ≈ 문서 총액
사업자번호 형식
날짜 형식과 유효성
수량·단가·금액의 음수/비정상 범위
```

자동 재고 반영은 Provider 성공이 아니라 이 검증을 통과했을 때만 허용한다.

---

## 10. 비용 통제

CLOVA 호출은 다음 조건을 모두 만족할 때만 허용한다.

- PaddleOCR 결과가 실패 또는 저신뢰
- 동일 파일의 CLOVA 결과 캐시 없음
- 월/일 호출 한도 이내
- tenant별 한도 이내
- 자동 재시도 횟수 이내

권장 제한:

```text
PaddleOCR 재시도: 최대 1회
CLOVA fallback: 문서당 최대 1회
```

기록할 지표:

- 전체 문서 수
- Paddle 단독 성공률
- CLOVA fallback 비율
- Review Queue 비율
- Provider별 평균 처리시간
- Provider별 품목·숫자 정확도
- CLOVA 월 예상비용
- tenant별 호출량

---

## 11. 저장 데이터

### ocr_documents 추가/확인 필드

```text
primary_provider
fallback_provider
fallback_trigger
final_provider
provider_request_id
document_hash
processing_status
review_required
```

### ocr_provider_attempts 권장 테이블

```text
id
document_id
tenant_id
provider
provider_version
attempt_no
started_at
completed_at
status
error_code
text_confidence
table_confidence
required_field_score
arithmetic_valid
latency_ms
estimated_cost
response_storage_path
```

---

## 12. 보안

- PaddleOCR Service를 공개 무인증 API로 노출하지 않는다.
- Edge Function에서 Service-to-Service 인증을 사용한다.
- tenant_id는 로그인 세션에서 결정한다.
- 원본 거래명세서는 private bucket에 저장한다.
- 로그에 사업자번호, 전화번호, 계좌정보, Secret을 평문으로 남기지 않는다.
- MIME, 확장자, 실제 파일 signature를 검사한다.
- 요청 크기와 페이지 수 제한을 둔다.

---

## 13. 라이선스 준수

PaddleOCR 공식 저장소는 Apache License 2.0이다.

배포 시:

- LICENSE 고지 유지
- NOTICE 유무 확인
- 수정 파일의 저작권 고지 유지
- 사용 모델 및 추가 종속성 라이선스 별도 감사
- Docker image 포함 라이브러리 라이선스 확인

PaddleOCR 자체 라이선스만 보고 전체 종속성이 동일하다고 가정하지 않는다.

---

## 14. 테스트 데이터셋

최소 50장으로 시작한다.

| 구분 | 최소 수량 |
|---|---:|
| 정상 촬영 | 10 |
| 기울어짐 | 5 |
| 그림자/반사 | 5 |
| 흐림 | 5 |
| 일부 훼손 | 5 |
| 다양한 공급사 | 10 |
| PDF/스캔본 | 5 |
| 다페이지 | 5 |

정답 데이터:

- 공급사명
- 거래일자
- 문서번호
- 품목 행 수
- 품목명
- 수량
- 단가
- 공급가액
- 세액
- 총액

---

## 15. 평가 지표

```text
문자 정확도
필드 정확도
품목행 완전 일치율
수량 정확도
단가 정확도
총액 정확도
표 구조 복원율
Paddle 단독 처리율
CLOVA fallback 비율
사람 검토 비율
문서당 평균 처리시간
문서당 평균 외부 API 비용
```

초기 완료 기준 제안:

```text
총액 정확도 ≥ 99%
수량·단가 정확도 ≥ 97%
필수 헤더 정확도 ≥ 98%
Paddle 단독 처리율 ≥ 80%
CLOVA fallback 비율 ≤ 20%
Review Queue ≤ 10%
```

---

## 16. 구현 순서

### Phase A — 분석 및 기준선

1. 공식 저장소 clone
2. 특정 commit/tag 고정
3. 라이선스 및 의존성 감사
4. 10장으로 CLI 추론
5. 한국어·숫자·표 결과 확인
6. CLOVA 기존 결과와 비교

### Phase B — 로컬 Service

1. Python 가상환경
2. PaddleOCR/PP-Structure 설치
3. FastAPI 또는 공식 Serving 방식 적용
4. `/health`
5. `/v1/ocr`
6. 공통 응답 Contract 변환
7. Docker 구성
8. 단위 테스트

### Phase C — MEATOS 연결

1. `analyze-ocr`에 Paddle Provider Adapter 추가
2. Paddle 우선 호출
3. Fallback Policy 추가
4. CLOVA Provider 유지
5. Provider Attempt 저장
6. Review Queue 연결

### Phase D — 실전 검증

1. 동일 거래명세서 Paddle 실행
2. 표 6행 추출 확인
3. 총액 3,105,880원 검산
4. 저품질 샘플로 CLOVA fallback 확인
5. 둘 다 실패하는 샘플 Review Queue 확인
6. 비용·시간 Dashboard 확인

### Phase E — 운영 전환

1. 운영 OCR Service 배포 승인
2. URL/Secret 등록 승인
3. 제한된 tenant에 Pilot
4. 1~2주 지표 수집
5. 임계치 재조정
6. 전체 적용 승인

---

## 17. 덱스 완료 보고 필수 항목

```md
## 구현 완료 요약
## PaddleOCR 고정 버전/Commit
## 설치 및 실행 환경
## 생성·수정 파일
## 서비스 Endpoint
## 공통 응답 Contract
## Fallback 조건
## Paddle 단독 테스트 결과
## CLOVA Fallback 테스트 결과
## Review Queue 테스트 결과
## 정확도 비교표
## 처리시간 비교표
## 비용 추정
## 라이선스 확인
## 보안 점검
## 검증 명령
## 남은 문제
## 다음 추천 작업
```

다음은 실행 전에 사용자 승인이 필요하다.

- 운영 배포
- Supabase Secret 변경
- Production Edge Function 배포
- DB migration 실제 적용
- RLS 변경
- Git commit/push

---

## 18. 차후 개발 시 금지 사항

- PaddleOCR 성공 응답만 보고 정확하다고 판정
- Confidence 없이 텍스트 존재만으로 통과
- 합계 검산 없이 재고 자동 반영
- CLOVA를 모든 문서에 병렬 호출
- 실패마다 무제한 CLOVA 재호출
- Provider 원본 응답을 그대로 UI에 노출
- main 최신 버전을 자동 반영
- 모델 버전 및 commit 기록 누락
- 로컬 PC 테스트를 운영 완료로 보고
- 저신뢰 결과를 자동 재고 반영

---

## 19. 최종 완료 기준

- PaddleOCR Service 독립 실행
- 한국어 거래명세서 텍스트 인식 성공
- 표 행·열 구조 추출 성공
- 공통 응답 Contract 변환 성공
- 필수값 및 산술 검증 성공
- 저신뢰 시 CLOVA fallback 성공
- 두 Provider 실패 시 Review Queue 이동
- 중복 파일 재호출 차단
- Provider별 이력 저장
- 비용 및 호출량 측정
- Secret 비노출
- 테스트 결과 보고
- 운영 배포 전 PM 승인
