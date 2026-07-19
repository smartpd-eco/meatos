
# TASK_ORDER_008_MULTI_TENANT_FOUNDATION.md
# MEATOS Official Development Order #008
## Multi-Tenant Foundation Implementation

**Version**: 1.0  
**Status**: PM Approved  
**Target**: Codex  
**Owner**: SmartPD / Peter  
**Date**: 2026-07-12  
**Recommended Path**: `C:\MEATOS\docs\08_SPRINT\TASK_ORDER_008_MULTI_TENANT_FOUNDATION.md`

---

# 1. 목적

현재 구축된 Supabase DB에 멀티테넌트 기반을 실제 반영한다.

이번 Sprint의 목표는 업체별 운영 데이터를 안전하게 분리할 수 있도록
`tenant_id` 기반 구조를 완성하는 것이다.

새로운 업무 기능을 추가하지 않는다.

```text
Global Standard
+
Shared Multi-Tenant DB
+
Tenant-Specific Learning
+
Dedicated DB Escape Path
```

---

# 2. 이번 Sprint 핵심 목표

- Tenant 기준 테이블 생성
- 기존 운영 테이블에 `tenant_id` 추가
- Default Tenant 생성
- 기존 Seed 및 Sample 데이터 Backfill
- Tenant 단위 Unique Constraint 적용
- Tenant 선두 Index 적용
- Tenant Context Service 준비
- Cross-Tenant 접근 테스트 준비
- RLS 정책 초안 작성
- 기존 데이터 100% 보존

---

# 3. 구현 범위

## 포함

- `tenant_master`
- `tenant_user`
- `tenant_setting`
- `tenant_routing`
- `tenant_usage_daily`
- 기존 운영 테이블 `tenant_id`
- Default Tenant
- Tenant 복합 Unique
- Tenant Index
- Tenant Context Adapter
- Tenant별 Repository Helper
- RLS SQL Draft
- Tenant 테스트 Fixture
- Mock → DB 매핑 업데이트

## 제외

- 실제 Auth 연결
- 실제 RLS 활성화
- 사용자 초대
- 업체 가입 화면
- 업체 요금제 결제
- Dedicated Supabase Project 생성
- Shared Cluster 분리
- Production 배포
- Inventory / Purchase / POS 기능 추가

---

# 4. Migration 파일

기존 Migration은 수정하지 않는다.

새 Migration만 추가한다.

```text
supabase/migrations/
  202607120014_tenant_foundation.sql
  202607120015_tenant_columns.sql
  202607120016_tenant_constraints_indexes.sql
  202607120017_tenant_seed_backfill.sql
  202607120018_tenant_rls_draft.sql
```

---

# 5. Migration 014 — Tenant Foundation

다음 테이블을 생성한다.

## tenant_master

필수 컬럼:

```text
id
tenant_code
tenant_name
business_no
tenant_type
plan_code
status
data_location
created_at
updated_at
```

제약조건:

```text
tenant_code UNIQUE
status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED')
```

---

## tenant_user

필수 컬럼:

```text
id
tenant_id
user_id
role_code
status
is_default
created_at
updated_at
```

제약조건:

```text
UNIQUE (tenant_id, user_id)
role_code IN ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER', 'AUDITOR')
status IN ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED')
```

현재 Auth 미연결 상태에서는 `user_id` nullable 허용 여부를 검토하고,
실제 RLS 적용 전에는 Mock/Test User 기준으로만 사용한다.

---

## tenant_setting

필수 컬럼:

```text
id
tenant_id
timezone
currency
ocr_provider_code
auto_apply_threshold
inventory_method
data_retention_days
created_at
updated_at
```

제약조건:

```text
UNIQUE (tenant_id)
auto_apply_threshold BETWEEN 0 AND 100
```

---

## tenant_routing

필수 컬럼:

```text
id
tenant_id
deployment_type
cluster_code
project_ref
database_region
routing_status
migrated_at
created_at
updated_at
```

제약조건:

```text
UNIQUE (tenant_id)
deployment_type IN ('SHARED', 'DEDICATED', 'MIGRATING')
routing_status IN ('ACTIVE', 'PENDING', 'FAILED', 'DISABLED')
```

Default 값:

```text
deployment_type = 'SHARED'
cluster_code = 'SHARED_KR_01'
database_region = 'ap-northeast-2'
routing_status = 'ACTIVE'
```

---

## tenant_usage_daily

필수 컬럼:

```text
id
tenant_id
usage_date
active_users
api_requests
write_transactions
ocr_documents
storage_bytes
database_rows
error_count
p95_latency_ms
created_at
```

제약조건:

```text
UNIQUE (tenant_id, usage_date)
모든 Count/Bytes 값은 0 이상
```

---

# 6. Migration 015 — tenant_id 추가

다음 운영 테이블에 `tenant_id uuid`를 추가한다.

```text
supplier_master
product_master
supplier_alias
import_batch
product_source_row
import_queue
review_queue
learning_history
ocr_document
ocr_line_item
ocr_processing_history
audit_event
```

## 원칙

1. 최초에는 nullable로 추가한다.
2. Default Tenant로 Backfill한다.
3. 누락 Row가 없는지 검증한다.
4. FK를 추가한다.
5. 최종적으로 NOT NULL로 변경한다.

---

# 7. Global Table 유지

다음 테이블은 공통 표준이므로 `tenant_id`를 추가하지 않는다.

```text
product_species
product_category
product_attribute_value
product_dictionary
product_alias
ocr_provider_registry
source_registry
```

주의:

- `source_registry`는 국가·기관·학술·공통 소스를 관리한다.
- 업체 전용 Source가 필요하면 향후 `tenant_source_link` 또는 별도 연결 테이블을 검토한다.
- 지금은 구조를 임의 확장하지 않는다.

---

# 8. Migration 016 — Unique 및 Index 변경

## Tenant 단위 Unique

기존 전역 Unique를 다음처럼 변경한다.

```sql
UNIQUE (tenant_id, supplier_code)
UNIQUE (tenant_id, product_code)
UNIQUE (tenant_id, supplier_id, normalized_name)
UNIQUE (tenant_id, batch_code)
UNIQUE (tenant_id, document_code)
```

## Tenant 선두 Index

```sql
CREATE INDEX ON supplier_master (tenant_id, supplier_name);
CREATE INDEX ON product_master (tenant_id, product_name);
CREATE INDEX ON supplier_alias (tenant_id, supplier_id, normalized_name);
CREATE INDEX ON import_batch (tenant_id, created_at);
CREATE INDEX ON product_source_row (tenant_id, batch_id, row_no);
CREATE INDEX ON import_queue (tenant_id, queue_status, created_at);
CREATE INDEX ON review_queue (tenant_id, status, created_at);
CREATE INDEX ON learning_history (tenant_id, supplier_id, raw_name);
CREATE INDEX ON ocr_document (tenant_id, document_status, created_at);
CREATE INDEX ON ocr_line_item (tenant_id, ocr_document_id, line_no);
CREATE INDEX ON ocr_processing_history (tenant_id, ocr_document_id, created_at);
CREATE INDEX ON audit_event (tenant_id, entity_type, entity_id, created_at);
```

기존 Index와 중복되는 경우 새 Index를 무조건 추가하지 않는다.

`EXPLAIN` 또는 Schema 검토 후 중복 Index를 보고한다.

---

# 9. Migration 017 — Default Tenant 및 Backfill

Default Tenant를 생성한다.

```text
tenant_code: SMARTPD_DEV
tenant_name: SmartPD Labs DEV
tenant_type: INTERNAL
plan_code: DEVELOPMENT
status: ACTIVE
data_location: KR
```

Default Routing:

```text
deployment_type: SHARED
cluster_code: SHARED_KR_01
database_region: ap-northeast-2
routing_status: ACTIVE
```

Default Setting:

```text
timezone: Asia/Seoul
currency: KRW
ocr_provider_code: MOCK
auto_apply_threshold: 95
inventory_method: MOVING_AVERAGE
data_retention_days: 3650
```

기존 Seed 및 Sample Row에 Default Tenant를 연결한다.

## Backfill 검증

다음 쿼리 결과가 0이어야 한다.

```text
각 운영 테이블의 tenant_id IS NULL Row Count
FK 미연결 Row Count
Default Tenant 외 잘못된 tenant_id Row Count
```

---

# 10. Migration 018 — RLS Draft

이번 Sprint에서는 실제 RLS를 활성화하지 않는다.

다음 내용만 작성한다.

- RLS 대상 테이블 목록
- SELECT 정책 초안
- INSERT 정책 초안
- UPDATE 정책 초안
- DELETE 정책 초안
- 역할별 권한표
- Cross-Tenant 차단 테스트 SQL
- service_role 예외 주의사항
- `tenant_user` Membership 검증 함수 초안

## 기본 검증 개념

```sql
exists (
  select 1
  from tenant_user tu
  where tu.user_id = auth.uid()
    and tu.tenant_id = target_table.tenant_id
    and tu.status = 'ACTIVE'
)
```

실제 RLS 활성화는 Auth 구조 확인 후 별도 PM 승인으로 진행한다.

---

# 11. 애플리케이션 Tenant Context

앱에 Tenant Context 구조를 추가한다.

## Tenant Context 필수값

```text
tenantId
tenantCode
tenantName
roleCode
deploymentType
clusterCode
```

## 초기 동작

Auth 미연결 상태에서는 Default Tenant를 사용한다.

```text
SMARTPD_DEV
```

하드코딩을 화면과 Repository 곳곳에 분산하지 않는다.

한 곳의 Config/Context에서 관리한다.

---

# 12. Repository 규칙

모든 업체 운영 데이터 조회는 반드시 Tenant Context를 받는다.

잘못된 예:

```text
getSuppliers()
getProducts()
getOcrDocuments()
```

권장:

```text
getSuppliers(tenantId)
getProducts(tenantId)
getOcrDocuments(tenantId)
```

또는 Repository 생성 시 Tenant Context를 주입한다.

```text
createTenantRepository(tenantContext)
```

Global Dictionary 조회는 Tenant Context 없이 가능하다.

---

# 13. 테스트 Tenant

Cross-Tenant 검증용 Test Tenant를 하나 추가한다.

```text
tenant_code: TEST_TENANT_B
tenant_name: Test Tenant B
status: ACTIVE
```

각 Tenant에 서로 다른 Sample Supplier/Product/OCR Row를 넣는다.

검증:

```text
SMARTPD_DEV 조회 시 TEST_TENANT_B 데이터 미포함
TEST_TENANT_B 조회 시 SMARTPD_DEV 데이터 미포함
Global Dictionary는 양쪽 모두 동일하게 조회
```

---

# 14. 데이터 보존 검증

이번 Sprint에서 가장 중요한 완료 기준이다.

반드시 확인한다.

- 기존 Row Count 전후 동일
- 기존 PK 동일
- 기존 Raw JSON 동일
- 기존 OCR 원본 경로 동일
- 기존 Dictionary ID 동일
- 기존 Alias 연결 동일
- Backfill 외 데이터 값 변경 없음
- Hard Delete 없음
- Truncate 없음
- Drop Table 없음

---

# 15. 실행 순서

```text
1. 현재 DB Backup 또는 Export 확인
2. Migration 014 실행
3. Tenant Foundation 검증
4. Migration 015 실행
5. tenant_id nullable 상태 검증
6. Migration 017 Default Tenant/Backfill 실행
7. NULL 및 FK 검증
8. Migration 016 Constraint/Index 적용
9. 앱 Tenant Context 적용
10. Test Tenant 데이터 생성
11. Tenant별 Read 테스트
12. Build/Lint/Test
13. Migration 018 RLS Draft 작성
14. 완료 보고
```

Migration 파일 번호의 실행 순서가 실제 의존성과 다르면
새 파일명 또는 실행 순서를 조정하되 그 이유를 보고한다.

---

# 16. 금지 작업

- 기존 Migration 수정
- Table 삭제
- Column 삭제
- 데이터 초기화
- `TRUNCATE`
- Production 배포
- 실제 Auth 구조 변경
- 실제 RLS 활성화
- service_role 브라우저 사용
- Dedicated Supabase Project 생성
- 업체 가입 UI 구현
- 요금제 결제 구현
- Inventory/POS/Purchase 기능 추가
- Git Force Push

---

# 17. 검증 명령

```bash
node --check <수정한 모든 JS 파일>
npm run build
npm run lint
npm test
git diff --check
```

DB 검증:

```text
Tenant Table 존재
Default Tenant 존재
운영 Table tenant_id 존재
tenant_id NULL Row 없음
Tenant FK 정상
Tenant Unique 정상
Tenant Index 정상
Cross-Tenant Read 분리
Global Dictionary 공유
기존 Row Count 유지
```

---

# 18. 완료 보고 형식

```md
## 구현 완료 요약

## 생성한 Migration

## 신규 Tenant Table

## tenant_id 추가 Table

## Backfill 결과

## Constraint / Index 변경

## Tenant Context 구현

## Cross-Tenant 테스트

## 기존 데이터 보존 검증

## Build / Lint / Test

## 미실행 항목

## 위험 요소

## PM 승인 필요 항목

## 다음 Sprint 제안
```

---

# 19. 다음 단계 예고

이번 Sprint 완료 후 다음 단계는 아래다.

## TASK_ORDER_009 — Tenant RLS & Authentication

```text
Supabase Auth
→ tenant_user Membership
→ Role
→ RLS
→ 업체별 로그인
→ Cross-Tenant 보안 테스트
```

단, 실제 Auth와 RLS 변경은 반드시 PM 별도 승인 후 진행한다.

---

# PM Message

이번 Sprint는 업체 수를 늘리는 기능을 만드는 작업이 아니다.

업체가 늘어나도 데이터를 섞지 않고,
공통 표준은 함께 사용하며,
업체별 학습과 운영 정보는 안전하게 분리하는 기반을 만드는 작업이다.

지금 정확하게 구축하면
업체 100개에서 다시 뜯어고치지 않아도 된다.
