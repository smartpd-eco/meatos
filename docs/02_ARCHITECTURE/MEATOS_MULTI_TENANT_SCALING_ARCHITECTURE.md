# MEATOS_MULTI_TENANT_SCALING_ARCHITECTURE.md
# MEATOS 업체 100·1,000·10,000개 대응 멀티테넌트 DB 확장 설계

**Version**: 1.0  
**Status**: Architecture Decision / Implementation Ready  
**Owner**: SmartPD / Peter  
**Target**: Codex  
**Database**: Supabase PostgreSQL  
**Recommended Path**: `C:\MEATOS\docs\02_ARCHITECTURE\MEATOS_MULTI_TENANT_SCALING_ARCHITECTURE.md`  
**Date**: 2026-07-12  

---

## 1. 결론

업체 수가 100개, 1,000개, 10,000개라고 해서 각 업체마다 데이터베이스를 하나씩 만들지 않는다.

MEATOS의 기본 구조는 다음과 같이 한다.

```text
공통 Product Dictionary
+ 공통 정부·기관 표준
+ 업체별 tenant_id
+ 업체별 RLS
+ 업체별 Alias / Learning
+ 업체별 운영 데이터
```

즉, **하나의 공유 PostgreSQL DB를 사용하는 멀티테넌트 구조**로 시작한다.

다만 다음 조건에 해당하는 대형 업체는 공유 DB에서 독립 DB로 분리할 수 있도록 처음부터 Routing 구조를 둔다.

```text
일반 업체 → Shared DB
대형·고부하·격리 요구 업체 → Dedicated DB
전체 서비스 → Hybrid Multi-Tenant
```

### 핵심 원칙

> 업체 수가 아니라 데이터량, 트랜잭션량, 동시접속, 계약상 격리 요구를 기준으로 분리한다.

---

## 2. 업체 수만으로 DB 한계를 판단하면 안 되는 이유

업체 10,000개라도 업체당 사용량이 작다면 하나의 PostgreSQL 클러스터에서 운영할 수 있다.

반대로 업체가 100개뿐이어도 한 업체가 하루 수십만 건의 POS 판매와 OCR 문서를 생성하면 별도 분리가 필요할 수 있다.

따라서 다음 지표를 함께 본다.

```text
Tenant Count
Active Tenant Count
Daily Active Users
Peak Concurrent Users
Transactions Per Second
Daily OCR Documents
Inventory Ledger Rows
Database Size
Top Tenant Load Share
Slow Query Rate
Connection Pool Usage
CPU / Memory / IOPS
Backup / Restore Requirement
Compliance Requirement
```

---

## 3. 규모별 권장 운영 구조

### 3.1 업체 1~100개

권장 구조:

```text
Supabase Project 1개
PostgreSQL DB 1개
tenant_id 기반 공유 테이블
RLS 기반 업체 격리
공통 Product Dictionary
업체별 Alias / Learning
```

필수 구현:

- `tenant_master`
- `tenant_user`
- 모든 운영 테이블의 `tenant_id`
- RLS
- 복합 Unique
- Tenant 기반 Index
- Audit Log
- Supabase Connection Pooler

보통은 별도 DB 분리가 필요하지 않다.

---

### 3.2 업체 100~1,000개

공유 DB 구조를 유지한다.

추가할 것:

```text
Tenant Usage Monitoring
Query Performance Monitoring
Large Table Partitioning 준비
Read Replica 검토
OCR Storage 분리
Background Job Queue
Rate Limit
Tenant별 사용량 집계
```

필수 개선:

- 모든 주요 인덱스의 첫 번째 컬럼을 `tenant_id`로 설계
- 대량 테이블의 날짜 기반 Partition 준비
- OCR 원본 이미지는 DB가 아니라 Storage에 저장
- DB에는 파일 경로와 메타데이터만 저장
- Dashboard 통계는 실시간 전체 Scan 대신 집계 테이블 사용
- 업체별 사용량 제한 또는 Plan 정책 도입
- Connection Pool 사용

대부분 공유 DB 유지가 가능하다.

---

### 3.3 업체 1,000~10,000개

권장 구조:

```text
Control Plane DB
+ Shared Data Cluster 1..N
+ Dedicated DB 0..N
```

Control Plane:

```text
tenant_master
tenant_routing
tenant_plan
tenant_feature
tenant_usage_summary
tenant_database_registry
```

Shared Data Cluster 예시:

```text
Shared Cluster A
Shared Cluster B
Shared Cluster C
Shared Cluster D
```

Tenant 숫자로 고정 분할하지 않고 실제 부하와 데이터량을 기준으로 균등 배치한다.

10,000개 업체가 되었다고 DB 10,000개를 만드는 것이 아니다.

```text
Control Plane 1개
Shared DB 수 개
Dedicated DB 일부
```

구조가 현실적이다.

---

## 4. 정확한 분리 판단 기준

아래 기준은 Supabase의 고정 한계가 아니라 MEATOS 운영을 위한 내부 Architecture Trigger다.

### 4.1 Dedicated DB 즉시 분리 조건

다음 중 하나라도 해당하면 별도 DB를 우선 검토한다.

- 고객 계약이 물리적 DB 격리를 요구
- 고객이 전용 백업·복구 시점을 요구
- 고객이 전용 암호화 키 또는 네트워크 정책을 요구
- 고객 데이터 보관 지역이 다름
- 한 업체가 전체 DB 데이터의 20% 이상 차지
- 한 업체가 전체 쓰기 트랜잭션의 15% 이상 차지
- 한 업체가 Peak DB CPU의 15% 이상을 지속 소비
- 한 업체 장애가 전체 서비스 SLA에 영향을 줄 가능성이 큼
- 고객별 DB Restore가 반드시 필요
- 수백 점포의 대형 프랜차이즈 본사
- 전용 SLA와 전용 유지보수 계약 체결

### 4.2 Dedicated 후보 경고 기준

- 전체 데이터의 5~20% 차지
- 전체 트랜잭션의 5~15% 차지
- 하루 OCR 문서 10,000건 이상
- 하루 POS/재고 이벤트 100,000건 이상
- 단일 업체 데이터가 100GB 이상 성장 예상
- 특정 업체 쿼리가 Slow Query 상위에 반복 등장
- 업체별 Batch Job이 다른 업체 응답시간에 영향
- 월별 Export·정산 작업이 장시간 Lock 또는 I/O를 발생

30일 평균과 Peak를 함께 보고 분리 여부를 판단한다.

### 4.3 Shared DB 증설 기준

- CPU 평균 60% 이상 지속
- CPU Peak 80% 이상 반복
- Memory Pressure 또는 Swap 발생
- Connection Pool 사용률 70% 이상 지속
- DB Disk IOPS 병목
- p95 API 응답시간 500ms 이상
- 주요 쿼리 p95 200ms 이상
- Autovacuum 지연
- Dead Tuple 급증
- Replication Lag 증가
- Lock Wait 증가
- DB 저장공간 70% 이상 사용

조치 순서:

```text
Query 분석
→ Index 개선
→ N+1 제거
→ Connection Pool 조정
→ Background Job 분리
→ 집계 테이블
→ Compute Scale Up
→ Read Replica
→ Shared Cluster 분리
```

처음부터 Sharding하지 않는다.

---

## 5. MEATOS 데이터 3계층

### 5.1 Global Standard Layer

모든 업체가 공유한다.

```text
product_species
product_category
product_attribute_value
product_dictionary
global_product_alias
government_source_registry
academic_source_registry
```

특징:

- `tenant_id` 없음
- PM 승인으로만 변경
- 국가·기관·학술·공통 유통 표준
- 업체 운영 데이터와 분리

### 5.2 Tenant Knowledge Layer

업체별로 분리한다.

```text
supplier_alias
tenant_product_mapping
tenant_learning_history
tenant_dictionary_override
tenant_confidence_policy
tenant_ocr_template
```

특징:

- 반드시 `tenant_id`
- 업체별 상품명과 학습 결과
- 같은 단어라도 업체마다 다른 연결 허용
- 공통 Dictionary를 덮어쓰지 않음

### 5.3 Tenant Operation Layer

완전히 격리한다.

```text
supplier_master
ocr_document
ocr_line_item
import_batch
product_source_row
review_queue
product_master
inventory_balance
inventory_ledger
purchase_order
inbound_receipt
outbound
pos_sale
user_activity
```

특징:

- 반드시 `tenant_id`
- RLS 필수
- 다른 업체와 공유 금지
- 백업과 Audit 대상

---

## 6. 지금 DB에 즉시 구현할 부분

현재는 데이터가 많지 않으므로 나중에 변경하는 것보다 지금 멀티테넌트 기반을 넣는 것이 안전하다.

### 6.1 신규 테이블

#### tenant_master

```text
id uuid PK
tenant_code text UNIQUE
tenant_name text
business_no text
tenant_type text
plan_code text
status text
data_location text
created_at timestamptz
updated_at timestamptz
```

#### tenant_user

```text
id uuid PK
tenant_id uuid FK
user_id uuid
role_code text
status text
is_default boolean
created_at timestamptz
updated_at timestamptz
UNIQUE(tenant_id, user_id)
```

#### tenant_setting

```text
id uuid PK
tenant_id uuid FK UNIQUE
timezone text
currency text
ocr_provider_code text
auto_apply_threshold numeric
inventory_method text
data_retention_days integer
created_at timestamptz
updated_at timestamptz
```

#### tenant_routing

```text
id uuid PK
tenant_id uuid FK UNIQUE
deployment_type text
cluster_code text
project_ref text nullable
database_region text
routing_status text
migrated_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

`deployment_type`:

```text
SHARED
DEDICATED
MIGRATING
```

#### tenant_usage_daily

```text
id uuid PK
tenant_id uuid FK
usage_date date
active_users integer
api_requests bigint
write_transactions bigint
ocr_documents bigint
storage_bytes bigint
database_rows bigint
error_count bigint
p95_latency_ms numeric
created_at timestamptz
UNIQUE(tenant_id, usage_date)
```

---

## 7. 기존 테이블에 tenant_id 추가

반드시 추가:

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

추가하지 않는 공통 테이블:

```text
product_species
product_category
product_attribute_value
product_dictionary
product_alias
ocr_provider_registry
```

---

## 8. Unique Constraint 변경

기존:

```sql
unique (supplier_code)
unique (product_code)
```

변경:

```sql
unique (tenant_id, supplier_code)
unique (tenant_id, product_code)
```

추가:

```sql
unique (tenant_id, supplier_id, normalized_name)
unique (tenant_id, batch_code)
unique (tenant_id, document_code)
```

Global Dictionary Code는 전역 Unique를 유지한다.

---

## 9. Index 규칙

운영 테이블의 인덱스는 `tenant_id`를 선두에 둔다.

```sql
create index on supplier_master (tenant_id, supplier_name);
create index on product_master (tenant_id, product_name);
create index on supplier_alias (tenant_id, supplier_id, normalized_name);
create index on import_queue (tenant_id, queue_status, created_at);
create index on review_queue (tenant_id, status, created_at);
create index on ocr_document (tenant_id, document_status, created_at);
create index on ocr_line_item (tenant_id, ocr_document_id, line_no);
create index on learning_history (tenant_id, supplier_id, raw_name);
create index on audit_event (tenant_id, entity_type, entity_id, created_at);
```

---

## 10. RLS 설계

```text
auth.users
→ tenant_user
→ tenant_id
→ RLS
```

기본 정책 개념:

```sql
exists (
  select 1
  from tenant_user tu
  where tu.user_id = auth.uid()
    and tu.tenant_id = target_table.tenant_id
    and tu.status = 'ACTIVE'
)
```

역할:

```text
OWNER
ADMIN
MANAGER
OPERATOR
VIEWER
AUDITOR
```

원칙:

- JWT의 tenant_id만 무조건 신뢰하지 않는다.
- DB의 `tenant_user` 멤버십을 검증한다.
- service_role은 브라우저에서 사용하지 않는다.
- RLS Test를 자동화한다.
- Cross-Tenant 접근 테스트를 필수화한다.

---

## 11. 대형 테이블 Partition 계획

처음부터 모든 테이블을 Partition하지 않는다.

다음 테이블이 수천만 행 이상으로 성장할 때 적용한다.

```text
inventory_ledger
ocr_processing_history
audit_event
pos_sale
learning_history
product_source_row
```

권장 방식:

```text
Range Partition by created_at / transaction_date
+ tenant_id Index
```

Tenant Hash Partition은 실제 병목 확인 후 적용한다.

---

## 12. 10,000개 업체 Routing 구조

```text
로그인
→ Tenant 확인
→ tenant_routing 조회
→ Shared 또는 Dedicated 연결
→ 해당 Tenant Context 적용
```

초기:

```text
deployment_type = SHARED
cluster_code = SHARED_KR_01
```

대형 고객:

```text
deployment_type = DEDICATED
cluster_code = CUSTOMER_001
project_ref = 별도 Supabase Project Ref
```

---

## 13. Shared Cluster 분리 전략

```text
SHARED_KR_01
SHARED_KR_02
SHARED_KR_03
...
```

Tenant 배치 기준:

- 데이터량
- 트랜잭션량
- 지역
- 계약 Plan
- OCR 사용량
- POS 사용량
- 장애 영향도

단순 Tenant 번호 순서로만 배치하지 않는다.

---

## 14. Analytics 분리

운영 DB에서 전국 통계를 직접 집계하지 않는다.

```text
Operational DB
→ ETL / Replication
→ Analytics DB / Warehouse
→ 전국 통계와 AI 분석
```

공통 AI 학습 후보 생성 시:

- 업체 식별정보 제거
- 원문 거래명세서 공유 금지
- 집계값 또는 승인된 Alias만 사용
- 데이터 사용 동의 및 계약 정책 반영
- Global Dictionary 반영은 PM 승인

---

## 15. Backup 및 복구

- 모든 운영 테이블 `tenant_id`
- 변경 이력 `audit_event`
- 삭제 대신 Soft Delete
- Tenant별 Export 기능
- Tenant별 재구성 가능한 Ledger
- PITR 사용 검토
- OCR Storage 경로에 tenant_id 포함
- 월별 Tenant Snapshot 또는 Export

대형 고객이 Tenant 단독 시점 복구를 요구하면 Dedicated DB 후보가 된다.

---

## 16. 규모별 실무 판단표

| 단계 | 업체 수 | 권장 구조 | 주요 조치 |
|---|---:|---|---|
| MVP | 1~20 | Shared DB | tenant_id, RLS, Index |
| 초기 상용 | 20~100 | Shared DB | Monitoring, Audit, Pooler |
| 성장 | 100~1,000 | Shared DB 강화 | Compute, Partition 준비, 집계 분리 |
| 확장 | 1,000~5,000 | Shared Cluster 검토 | Control Plane, Routing, Read Replica |
| 대규모 | 5,000~10,000+ | Hybrid | Shared Cluster N개 + Dedicated 일부 |

이 숫자는 하드 한계가 아니라 운영 준비 단계다.

실제 분리는 부하 지표를 우선한다.

---

## 17. Codex 구현 지시

### Phase MT-01 — 현재 즉시 구현

- `tenant_master`
- `tenant_user`
- `tenant_setting`
- `tenant_routing`
- `tenant_usage_daily`
- 운영 테이블 `tenant_id` 추가
- Unique Constraint Tenant 단위 변경
- Tenant 선두 Index 추가
- Default Test Tenant 생성
- 기존 Seed를 Default Tenant에 연결
- Mock → DB Mapping 업데이트
- Migration 작성
- 기존 데이터 보존

### Phase MT-02 — Auth 연결 전 준비

- Tenant Context Service
- Tenant Repository
- Tenant별 Query Helper
- Cross-Tenant 접근 방지 Test
- RLS SQL 초안
- RLS pgTAP Test
- 역할 정책 표

실제 Auth/RLS 적용은 PM 승인 후 수행한다.

### Phase MT-03 — 운영 모니터링

- Tenant Usage Daily 집계
- Top Tenant Load Dashboard
- Tenant별 Row Count
- Tenant별 OCR 건수
- Tenant별 API 오류율
- 분리 후보 경고

### Phase MT-04 — 확장 시 구현

- Control Plane
- Shared Cluster Registry
- Tenant Routing Resolver
- Tenant Migration Tool
- Dedicated Project Provisioning
- Analytics Replication

현재는 구현하지 않고 구조만 보존한다.

---

## 18. Migration 안전 규칙

기존 Migration을 직접 수정하지 않는다.

새 Migration을 추가한다.

권장 파일:

```text
202607120014_tenant_foundation.sql
202607120015_tenant_columns.sql
202607120016_tenant_constraints_indexes.sql
202607120017_tenant_seed_backfill.sql
202607120018_tenant_rls_draft.sql
```

순서:

1. Tenant 테이블 생성
2. Default Tenant 생성
3. 기존 운영 테이블에 nullable tenant_id 추가
4. 기존 Row를 Default Tenant로 Backfill
5. FK 추가
6. tenant_id NOT NULL 변경
7. 기존 Unique 제거 후 Tenant 복합 Unique 생성
8. Index 생성
9. 검증
10. RLS는 별도 PM 승인

Table 삭제·데이터 초기화 금지.

---

## 19. 테스트 완료 기준

- 기존 데이터 100% 보존
- 모든 운영 Row에 tenant_id 존재
- Default Tenant 정상 생성
- Global Table에는 tenant_id 없음
- Tenant별 Unique 정상
- Tenant별 조회 정상
- 다른 Tenant 데이터 조회 차단 테스트 준비
- Build/Lint/Test 통과
- Migration 재실행 안전성 확인
- Git Diff Secret 없음
- Production 배포 없음

---

## 20. 최종 결정

MEATOS는 다음 구조를 공식 채택한다.

```text
Global Standard
+ Shared Multi-Tenant Operation
+ Tenant-Specific Learning
+ Dedicated DB Escape Path
+ Analytics Separation
```

한 문장으로 정리하면:

> 표준 데이터는 공유하고, 업체별 지식과 운영 데이터는 격리하며, 대형 고객만 독립 DB로 분리한다.

이 구조는 업체 100개에서 다시 뜯어고치는 설계가 아니라 10,000개까지 단계적으로 확장할 수 있는 기반이다.

다만 10,000개 운영 가능 여부는 업체 숫자 하나가 아니라 실제 데이터량·트랜잭션·동시접속·Compute·IOPS·쿼리 품질로 판단한다.

---

## 21. 참고 공식 자료

- Supabase Row Level Security
- Supabase Connection Management
- Supabase Compute and Disk
- Supabase Performance Tuning
- Supabase Read Replicas
- Supabase Database Backups
- Supabase Network Restrictions
- Supabase pgTAP RLS Testing
