# TASK_ORDER_006_SUPABASE_DATABASE.md
# MEATOS Official Database Implementation Order #006

**Version**: 1.0  
**Status**: Approved for migration preparation  
**Target**: Codex  
**Database**: Supabase PostgreSQL  
**Date**: 2026-07-11  

---

# 1. 목적

현재까지 Mock과 문서로 구현된 MEATOS 핵심 기능을
Supabase PostgreSQL의 실제 데이터 구조로 전환한다.

이번 작업은 새로운 기능 추가가 아니다.

```text
Source Registry
→ Import Batch / Source Row
→ Import Queue
→ Review Queue
→ Product Dictionary
→ Product Master
→ Alias / Supplier Alias
→ Learning History
→ OCR Document Queue
```

---

# 2. 절대 원칙

1. 기존 원본 데이터는 수정하거나 덮어쓰지 않는다.
2. 원본, OCR 결과, 정제 결과, 사용자 승인 결과를 분리 저장한다.
3. Product Dictionary와 Product Master를 분리한다.
4. 자동 추측으로 Product Master를 생성하지 않는다.
5. 승인되지 않은 데이터는 운영 재고에 반영하지 않는다.
6. 모든 주요 변경은 이력으로 남긴다.
7. 테이블 삭제·초기화·Production 실행은 PM 승인 전 금지한다.
8. 이번 작업에서는 Auth 및 RLS 정책을 변경하지 않는다.

---

# 3. 이번 Sprint DB 범위

## 포함

- Source Registry
- Supplier Master
- Import Batch
- Product Source Row
- Import Queue
- Product Attribute 기준정보
- Product Dictionary
- Product Master
- Product Alias
- Supplier Alias
- Review Queue
- Learning History
- OCR Provider Registry
- OCR Document Queue
- OCR Line Item
- OCR Processing History
- Audit Event

## 제외

- Inventory Ledger
- Inbound Posting
- Outbound Posting
- Purchase Order
- POS Adapter
- 결제
- 인증/Auth
- 사용자 권한/RLS
- 실제 OCR API Secret
- Production 배포

---

# 4. Migration 파일 순서

```text
supabase/migrations/
  202607110001_extensions.sql
  202607110002_common_functions.sql
  202607110003_source_registry.sql
  202607110004_supplier_master.sql
  202607110005_product_reference.sql
  202607110006_product_dictionary.sql
  202607110007_product_master.sql
  202607110008_alias.sql
  202607110009_import_pipeline.sql
  202607110010_review_learning.sql
  202607110011_ocr_pipeline.sql
  202607110012_audit_indexes.sql
  202607110013_seed_reference.sql
```

한 파일에 전체 테이블을 몰아넣지 않는다.

---

# 5. 공통 컬럼 규칙

```text
id uuid primary key
created_at timestamptz not null
updated_at timestamptz not null
created_by uuid nullable
updated_by uuid nullable
is_active boolean not null default true
```

## ID 원칙

- 내부 PK: UUID
- 사용자 표시 코드: 별도 Code 컬럼
- 외래키는 UUID 사용
- 상품명이나 거래처명을 외래키로 사용하지 않는다.

## 시간 원칙

- DB 저장: UTC timestamptz
- 화면 표시: 사용자 지역 시간
- 날짜만 필요한 거래일은 date 타입 사용

## 금액·수량 원칙

- 금액: numeric(18,2)
- 수량/중량: numeric(18,3)
- Confidence: numeric(5,2), 0~100

---

# 6. 핵심 테이블

## 6.1 source_registry

```text
id
source_code
source_name
source_type
organization_name
authority_level
source_url
description
collected_at
collector_name
status
is_active
created_at
updated_at
```

Authority Level:

```text
L1 국가기관
L2 공공기관·협회
L3 논문·학술
L4 대형 유통사
L5 실제 유통업체
L6 정육점·현장
```

## 6.2 supplier_master

```text
id
supplier_code
supplier_name
business_no
representative_name
phone
address
source_id
is_active
created_at
updated_at
```

## 6.3 product_species

축종 기준정보.

```text
PORK
HANWOO
BEEF
IMPORTED_BEEF
CHICKEN
DUCK
OTHER
```

## 6.4 product_category

```text
id
category_code
category_name
parent_id
depth
sort_order
is_active
```

Tree 구조로 구현한다.

## 6.5 product_attribute_value

```text
id
attribute_type
attribute_code
attribute_name
sort_order
is_active
```

attribute_type:

```text
SPECIES
CATEGORY
PART
PROCESSING
SKIN
BONE
STORAGE
ORIGIN
GRADE
UNIT
BRAND
```

## 6.6 product_dictionary

```text
id
dictionary_code
standard_name
species_id
category_id
part_attribute_id
processing_attribute_id
skin_attribute_id
bone_attribute_id
storage_attribute_id
origin_attribute_id
grade_attribute_id
unit_attribute_id
confidence
source_count
alias_count
review_status
version_no
effective_from
effective_to
is_active
created_at
updated_at
```

원칙:

- Dictionary는 표준 지식 계층이다.
- 운영 재고 SKU가 아니다.
- 자동 생성 후보는 PENDING으로 저장한다.
- 승인 전 Product Master 생성 금지.

## 6.7 product_master

```text
id
product_code
product_name
dictionary_id
supplier_id nullable
brand_attribute_id nullable
default_unit_attribute_id
status
version_no
effective_from
effective_to
is_active
created_at
updated_at
```

status:

```text
DRAFT
ACTIVE
INACTIVE
ARCHIVED
```

## 6.8 product_alias

```text
id
dictionary_id
raw_name
normalized_name
source_id
confidence
use_count
verified
last_used_at
created_at
updated_at
```

## 6.9 supplier_alias

```text
id
supplier_id
dictionary_id
raw_name
normalized_name
confidence
learning_count
verified
auto_apply
last_used_at
created_at
updated_at
```

공용 Alias와 Supplier Alias는 분리한다.

---

# 7. Import Pipeline

## 7.1 import_batch

```text
id
batch_code
source_id
supplier_id nullable
file_name
file_hash
total_rows
success_rows
review_rows
error_rows
status
started_at
completed_at
created_at
```

status:

```text
RECEIVED
VALIDATING
IMPORTED
PARTIAL
FAILED
CANCELLED
```

## 7.2 product_source_row

```text
id
batch_id
row_no
raw_payload jsonb
raw_product_name
raw_specification
raw_quantity
raw_unit
raw_origin
raw_grade
raw_amount
row_hash
created_at
```

원칙:

- raw_payload 수정 금지
- 정제 결과 덮어쓰기 금지
- 원본 행 삭제 금지
- 중복 검사는 row_hash 사용

## 7.3 import_queue

```text
id
source_row_id
queue_status
dictionary_candidate_id nullable
product_master_id nullable
confidence
validation_result jsonb
assigned_to nullable
reviewed_at nullable
created_at
updated_at
```

queue_status:

```text
NEW
REVIEW
APPROVED
REJECTED
ON_HOLD
DICTIONARY_LINKED
MASTER_LINKED
```

---

# 8. Review 및 Learning

## 8.1 review_queue

```text
id
review_type
source_row_id nullable
ocr_line_item_id nullable
suggested_dictionary_id nullable
selected_dictionary_id nullable
confidence
reason_codes jsonb
status
reviewer_id nullable
review_note
reviewed_at
created_at
updated_at
```

status:

```text
PENDING
APPROVED
REJECTED
DEFERRED
```

## 8.2 learning_history

```text
id
supplier_id nullable
raw_name
normalized_name
dictionary_id
source_type
previous_confidence
new_confidence
learning_count
decision_type
review_id nullable
created_at
```

decision_type:

```text
MANUAL_APPROVAL
MANUAL_CORRECTION
REPEATED_MATCH
GLOBAL_CANDIDATE
```

추가 기록 방식으로 관리한다.

---

# 9. OCR Pipeline

## 9.1 ocr_provider_registry

```text
id
provider_code
provider_name
provider_type
priority
is_enabled
configuration jsonb
created_at
updated_at
```

API Secret은 저장하지 않는다.

## 9.2 ocr_document

```text
id
document_code
source_id nullable
supplier_id nullable
original_file_path
original_file_hash
file_name
mime_type
document_status
ocr_provider_id nullable
ocr_raw_json jsonb
parsed_json jsonb
meatos_score
provider_confidence
retry_count
next_retry_at
invoice_date nullable
total_amount nullable
created_at
updated_at
```

document_status:

```text
CAPTURED
UPLOADED
OCR_PENDING
OCR_COMPLETED
PARSE_COMPLETED
REVIEW_REQUIRED
APPROVED
POSTED
OCR_FAILED
PARSE_FAILED
```

## 9.3 ocr_line_item

```text
id
ocr_document_id
line_no
raw_product_name
raw_specification
raw_quantity
raw_unit
raw_unit_price
raw_amount
raw_origin
raw_grade
dictionary_candidate_id nullable
selected_dictionary_id nullable
product_master_id nullable
confidence
review_status
created_at
updated_at
```

## 9.4 ocr_processing_history

```text
id
ocr_document_id
from_status
to_status
provider_id nullable
result_code
result_message
processing_ms
retry_no
payload jsonb
created_at
```

---

# 10. Audit Event

## audit_event

```text
id
entity_type
entity_id
action_type
before_data jsonb
after_data jsonb
actor_id nullable
reason
created_at
```

action_type:

```text
CREATE
UPDATE
APPROVE
REJECT
LINK
UNLINK
ACTIVATE
DEACTIVATE
POST
```

---

# 11. 제약조건

- source_registry.source_code unique
- supplier_master.supplier_code unique
- product_dictionary.dictionary_code unique
- product_master.product_code unique
- import_batch.batch_code unique
- ocr_document.document_code unique
- confidence 범위 0~100 check
- 수량·금액 음수 방지 check
- version_no 1 이상 check
- product_alias: dictionary_id + normalized_name unique
- supplier_alias: supplier_id + normalized_name unique
- product_source_row: batch_id + row_no unique
- ocr_line_item: ocr_document_id + line_no unique

---

# 12. 인덱스

```text
product_dictionary(standard_name)
product_dictionary(species_id, category_id)
product_master(product_name)
product_alias(normalized_name)
supplier_alias(supplier_id, normalized_name)
product_source_row(batch_id)
import_queue(queue_status, created_at)
review_queue(status, created_at)
learning_history(supplier_id, raw_name)
ocr_document(document_status, created_at)
ocr_document(original_file_hash)
ocr_line_item(ocr_document_id)
audit_event(entity_type, entity_id, created_at)
```

한글 trigram 인덱스는 별도 migration으로 검토한다.

---

# 13. Seed Data

전체 좋은축산 1,615건은 즉시 넣지 않는다.

초기 Seed:

- Authority Level L1~L6
- 축종
- 카테고리
- 저장상태
- 기본 단위
- OCR Provider Mock
- 좋은축산 Supplier 1건
- Source Registry 1건
- 테스트 Product Dictionary 10~30건
- 테스트 Alias 20~50건

전체 Import는 스키마와 화면 검증 후 PM 승인으로 진행한다.

---

# 14. Supabase 적용 순서

```text
1. Project 생성
2. Migration SQL 작성
3. Codex 로컬 검증
4. PM SQL 검토
5. Supabase SQL Editor 실행
6. Table Editor에서 테이블·FK 확인
7. Sample Seed 실행
8. 웹 읽기 테스트
9. 웹 쓰기 테스트
10. 전체 Excel Import 승인 여부 결정
```

---

# 15. Security

- Data API는 활성화한다.
- 새 테이블을 무조건 외부에 공개하지 않는다.
- 실제 Auth/RLS 변경은 PM 승인 전 금지한다.
- service_role key 브라우저 노출 금지.
- anon key 무제한 쓰기 허용 금지.
- 초기 웹 연결은 제한된 서버 경로 또는 Read-only Adapter 사용.

---

# 16. Codex 작업 지시

1. 현재 코드와 문서를 먼저 읽는다.
2. 기존 Mock Entity와 필드명을 확인한다.
3. 문서와 코드의 필드 충돌 목록을 작성한다.
4. migration 파일을 순서대로 생성한다.
5. 각 migration에 영향 설명을 남긴다.
6. Seed Sample을 분리한다.
7. DB Adapter를 작성하되 Mock 흐름을 깨지 않는다.
8. 실제 Supabase 실행·배포·환경변수 변경은 하지 않는다.
9. SQL 파일 목록과 검증 결과를 보고한다.

---

# 17. 완료 기준

- Migration 파일 13개 생성
- FK 순서 오류 없음
- 중복·Check 제약조건 반영
- Sample Seed 분리
- Mock → DB 매핑표 작성
- 실제 DB 실행 전 검토 보고서 작성
- 기존 Build·Lint·Test 통과
- Git Commit·Push 미실행
- Supabase Production 실행 미실행

---

# 18. 완료 보고 형식

```md
## 구현 완료 요약
## 생성한 Migration 파일
## 생성·수정한 코드 파일
## Mock → DB 매핑
## 제약조건 및 인덱스
## Seed Data
## 검증 결과
## 미실행 항목
## 위험 요소
## PM 승인 필요 항목
## 다음 추천 작업
```

---

# PM Message

이번 단계는 화면을 더 만드는 단계가 아니다.

지금까지 만든 Product Dictionary, Alias, Review, Learning, OCR 구조를
실제 데이터가 안전하게 쌓일 수 있는 기반으로 옮기는 단계다.

DB는 MEATOS의 기억이다.

기억은 빠르게 만드는 것보다
정확하게 남기는 것이 중요하다.
