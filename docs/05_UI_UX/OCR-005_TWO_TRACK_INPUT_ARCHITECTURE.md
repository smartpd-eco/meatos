# OCR-005_TWO_TRACK_INPUT_ARCHITECTURE.md

# MEATOS OCR 투트랙 입력 구조
Version 1.0
작성일: 2026-07-12

## 저장 위치

`C:\MEATOS\docs\03_OCR\OCR-005_TWO_TRACK_INPUT_ARCHITECTURE.md`

---

# 1. 목적

MEATOS의 거래명세서 입력 방식은 아래 두 가지를 동일한 OCR 파이프라인으로 처리한다.

1. 카메라로 바로 촬영
2. 기존 이미지/PDF 파일 불러오기

사용자는 입력 방식만 선택하고, 이후 처리 과정은 동일하게 유지한다.

---

# 2. 사용자 화면

상단 메인 버튼:

## 고기가 들어왔어요

버튼 클릭 시 아래 두 가지 선택지만 표시한다.

- 사진 찍기
- 파일 불러오기

복잡한 설명은 숨기고, 두 버튼만 크게 노출한다.

---

# 3. 투트랙 입력 흐름

## Track A. 카메라 촬영

```text
고기가 들어왔어요
→ 사진 찍기
→ 카메라 권한 확인
→ 거래명세서 촬영
→ 자동 자르기
→ 기울기/회전/명암 보정
→ 촬영 품질 검사
→ OCR 요청
→ 결과 확인
→ 입고/재고 반영
```

### 카메라 입력값

- 촬영 이미지
- 파일 형식
- 촬영 시각
- 이미지 폭/높이
- 파일 크기
- 기기 정보
- 매장/사용자 식별값
- 선택 공급사(선택 입력)

### 촬영 실패 처리

- 초점 불량
- 반사광
- 문서 잘림
- 흔들림
- 너무 어두움
- 문서가 화면 밖에 있음

사용자 메시지는 단순하게 표시한다.

- 사진이 흐립니다. 다시 찍어주세요.
- 문서 전체가 보이게 찍어주세요.
- 빛 반사를 피해 다시 찍어주세요.

---

## Track B. 기존 파일 불러오기

```text
고기가 들어왔어요
→ 파일 불러오기
→ 갤러리/파일 선택
→ 이미지 또는 PDF 선택
→ 파일 형식/용량 검사
→ 이미지 변환 및 전처리
→ OCR 요청
→ 결과 확인
→ 입고/재고 반영
```

### 허용 파일

- JPG
- JPEG
- PNG
- WEBP
- PDF

### 파일 제한 권장값

- 이미지 최대 20MB
- PDF 최대 50MB
- PDF 최대 10페이지
- 한 번에 최대 10개 파일
- HEIC는 업로드 전 JPEG 변환

### 파일 입력값

- 원본 파일명
- MIME Type
- 파일 크기
- 페이지 수
- 업로드 시각
- 업로드 사용자
- 공급사 선택값(선택)
- 원본 파일 해시

---

# 4. 공통 입력 데이터 구조

```json
{
  "inputType": "camera | file",
  "fileName": "invoice_20260712.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 2450000,
  "pageCount": 1,
  "capturedAt": "2026-07-12T10:30:00+09:00",
  "uploadedAt": "2026-07-12T10:30:05+09:00",
  "supplierId": null,
  "tenantId": "tenant_uuid",
  "userId": "user_uuid",
  "documentHash": "sha256_hash",
  "source": "mobile-camera | gallery | desktop-file"
}
```

---

# 5. 공통 OCR 처리 파이프라인

```text
입력
→ 파일 검증
→ 전처리
→ 품질 점수 계산
→ 중복 검사
→ OCR Provider 호출
→ Raw JSON 저장
→ 필드 파싱
→ 공급사 식별
→ 상품명 표준화
→ Confidence 계산
→ 검토 필요 여부 판정
→ 입고/재고 반영
→ Failure Learning 저장
```

---

# 6. 중복 검사

OCR 호출 전에 아래를 검사한다.

- 파일 해시
- 공급사
- 거래일
- 합계금액
- 거래명세서 번호
- 이미지 지문
- 최근 업로드 이력

완전히 동일한 파일이면 기존 결과를 재사용한다.

단, 양식이 같아도 수량·단가·금액은 달라질 수 있으므로 단순 템플릿 일치만으로 OCR을 생략하지 않는다.

---

# 7. UI 원칙

사용자가 보는 버튼은 두 개만 둔다.

```text
[ 사진 찍기 ]

[ 파일 불러오기 ]
```

처리 중 문구:

- 사진 확인 중
- 문서 읽는 중
- 품목 정리 중
- 입고 준비 중

완료 문구:

- 거래명세서가 준비되었습니다.
- 확인 후 재고에 반영해주세요.

개발 용어인 API, OCR Provider, JSON, Secret, Confidence는 기본 화면에 노출하지 않는다.

---

# 8. 결과 확인 화면

필수 노출값:

- 공급사명
- 거래일
- 품목 수
- 합계금액
- 확인 필요 항목 수
- 재고 반영 버튼

선택 노출값:

- 원본 보기
- 인식 결과 수정
- 품목명 표준화 결과
- 공급사 학습 상태
- 상세 인식 점수

---

# 9. 데이터베이스 권장 필드

## ocr_documents

- id
- tenant_id
- user_id
- supplier_id
- input_type
- source
- original_file_name
- mime_type
- file_size
- page_count
- document_hash
- storage_path
- quality_score
- provider
- provider_version
- processing_status
- created_at
- completed_at

## ocr_document_results

- id
- document_id
- raw_json
- parsed_json
- confidence_score
- review_required
- retry_count
- error_code
- error_message

## ocr_document_files

- id
- document_id
- original_path
- processed_path
- thumbnail_path
- page_no

---

# 10. 보안 규칙

- CLOVA Secret은 브라우저에 노출하지 않는다.
- 모든 OCR 호출은 Supabase Edge Function을 경유한다.
- 원본 파일은 테넌트별 저장 경로로 분리한다.
- 다른 업체 파일은 조회할 수 없도록 RLS를 적용한다.
- 파일명만 믿지 않고 MIME Type과 실제 파일 서명을 검증한다.
- 악성 파일과 비정상 확장자를 차단한다.
- 로그에 Secret과 원본 개인정보를 남기지 않는다.

---

# 11. 덱스 구현 오더

1. `고기가 들어왔어요` 버튼 클릭 시 입력 선택 모달 표시
2. 카메라 촬영 입력 구현
3. 파일/갤러리 입력 구현
4. 두 입력을 공통 `OcrInputPayload` 구조로 변환
5. 공통 업로드 함수로 전달
6. 이미지 품질 검사 연결
7. Edge Function `analyze-ocr` 호출
8. OCR 처리 상태 표시
9. 결과 확인 화면 연결
10. 실패 시 재촬영/재선택 안내
11. 원본 파일과 처리 결과 DB 저장
12. 중복 업로드 검사
13. build/lint/test/typecheck 수행

---

# 12. 완료 기준

## 시나리오 A

```text
모바일에서 사진 촬영
→ OCR 완료
→ 공급사/품목/금액 표시
→ 재고 반영 준비
```

## 시나리오 B

```text
PC 또는 모바일에서 기존 이미지/PDF 선택
→ OCR 완료
→ 공급사/품목/금액 표시
→ 재고 반영 준비
```

두 입력 방식 모두 동일한 결과 화면과 동일한 DB 구조를 사용해야 한다.

---

# 13. PM 제안

- 최근 사용한 입력 방식을 기억하되 두 선택지는 항상 함께 보이게 한다.
- 공급사 사전 선택은 선택사항으로 둔다.
- 원본 파일, 보정본, OCR 결과를 함께 보관한다.
- 다페이지 거래명세서를 고려해 처음부터 pageCount 구조를 둔다.
- 완전 동일 파일과 이미 처리된 재시도만 외부 OCR 호출 전에 차단한다.

---

# 14. 기존 문서 중복 검토

기존 CLOVA 연결 문서와 OCR Failure Learning 문서는 Provider 연결 및 실패 학습이 중심이다.

본 문서는 카메라 촬영과 기존 파일 불러오기 두 경로를 하나의 OCR 처리 구조로 통합하는 신규 문서이며 기존 문서와 직접 중복되지 않는다.
