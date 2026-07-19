
# TASK_ORDER_007_DATABASE_MIGRATION_EXECUTION.md
# MEATOS Official Development Order #007
## Database Migration Validation & First Connection

**Version**: 1.0  
**Status**: PM Approved  
**Priority**: Critical  
**Target**: Codex  
**Date**: 2026-07-11  

---

# 1. 목적

현재 작성된 Supabase Migration SQL을 실제 프로젝트에 안전하게 적용하고,
웹 애플리케이션과의 최초 연결을 검증한다.

이번 Sprint에서는 새로운 기능을 추가하지 않는다.

핵심 목표는 아래 두 가지다.

1. DB 구조가 문서와 동일하게 생성되는지 확인
2. 웹에서 실제 Supabase 데이터를 읽을 수 있는지 확인

---

# 2. Sprint 목표

- Migration SQL 순차 적용
- Table / PK / FK / Unique / Check / Index 검증
- 테스트 Seed 적용
- Supabase Read Adapter 연결
- 웹 조회 테스트
- 제한된 CRUD 테스트
- 기존 Mock 흐름 유지
- 오류 및 차이점 보고

---

# 3. Migration 적용 순서

다음 순서를 반드시 지킨다.

```text
001_extensions
↓
002_common_functions
↓
003_source_registry
↓
004_supplier_master
↓
005_product_reference
↓
006_product_dictionary
↓
007_product_master
↓
008_alias
↓
009_import_pipeline
↓
010_review_learning
↓
011_ocr_pipeline
↓
012_audit_indexes
↓
013_seed_reference
```

Migration은 한 번에 전체 실행하지 않는다.

각 파일 실행 후 결과를 확인하고 다음 단계로 진행한다.

---

# 4. Migration별 검증 항목

각 Migration 실행 후 아래 항목을 확인한다.

- Table 생성 여부
- Primary Key
- Foreign Key
- Unique Constraint
- Check Constraint
- Default Value
- Index
- Updated At Trigger
- Nullable 정책
- Enum 또는 상태값 정책
- FK 삭제 정책

문서와 실제 DB 구조가 다르면 즉시 PM에게 보고한다.

임의 수정 금지.

---

# 5. ERD 검증

Supabase Table Editor 또는 Schema Visualizer에서 관계를 확인한다.

검증 대상:

```text
Source Registry
→ Supplier
→ Import Batch
→ Product Source Row
→ Import Queue
→ Review Queue
→ Product Dictionary
→ Product Alias
→ Supplier Alias
→ Product Master
→ Learning History
→ OCR Document
→ OCR Line Item
→ OCR Processing History
→ Audit Event
```

확인 사항:

- FK 방향
- 순환 참조 여부
- Optional 관계
- 1:N 관계
- Dictionary와 Master 분리
- Supplier Alias와 Product Alias 분리
- Source Row 원본 보존 구조

---

# 6. Seed 적용

이번 Sprint에서는 테스트 Seed만 적용한다.

포함:

- Authority Level L1~L6
- 축종
- 카테고리
- 기본 Attribute
- 기본 Unit
- OCR Provider Mock
- 좋은축산 Supplier 1건
- Source Registry 1건
- Product Dictionary Sample
- Alias Sample

제외:

- 좋은축산 전체 1,615건
- 실제 OCR 원본
- 실제 거래처 대량 데이터
- 운영 데이터

---

# 7. Supabase 연결 정보

웹 연결은 다음 환경변수를 사용한다.

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

또는 현재 프레임워크에 맞는 명칭을 사용한다.

예:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

현재 MEATOS 프로젝트가 순수 HTML/JavaScript라면
환경변수 주입 방식과 빌드 구조를 먼저 확인한다.

하드코딩 금지.

---

# 8. Supabase Adapter

기존 Mock 구조를 제거하지 않는다.

다음 구조로 전환한다.

```text
Mock Adapter
Supabase Adapter
```

필수 원칙:

- Adapter 인터페이스 공통화
- 실패 시 Mock 또는 오류 화면
- Supabase 연결 여부 표시
- Read Only Mode 지원
- 네트워크 오류 처리
- API 응답 매핑 계층 분리

---

# 9. 1차 Read 테스트

다음 순서로 읽기 테스트를 진행한다.

1. Source Registry
2. Supplier
3. Product Dictionary
4. Product Alias
5. Supplier Alias
6. Product Master
7. Review Queue
8. Learning History
9. OCR Provider Registry
10. OCR Document Queue

각 화면에서 다음을 확인한다.

- 목록 표시
- 검색
- 필터
- 빈 데이터
- API 오류
- 로딩 상태
- 한국어 인코딩
- Pagination 준비 여부

---

# 10. 제한된 CRUD 테스트

RLS/Auth 적용 전이므로 운영 수준 CRUD를 구현하지 않는다.

테스트 범위:

## Supplier

- 생성
- 조회
- 수정
- 비활성

## Product Dictionary

- Draft 생성
- 조회
- 수정
- 비활성

## Review Queue

- Pending 생성
- 조회
- 승인 상태 테스트
- 반려 상태 테스트

## Learning History

- 추가 기록
- 조회

삭제는 테스트하지 않는다.

Hard Delete 금지.

---

# 11. 보안 원칙

- Secret Key 사용 금지
- service_role 브라우저 노출 금지
- JWT Secret 사용 금지
- Database Password 코드 저장 금지
- GitHub에 실제 Key 업로드 금지
- `.env.local` 또는 로컬 비밀 저장소 사용
- `.env.example`에는 값 없이 Key 이름만 기록

RLS/Auth는 이번 Sprint에서 변경하지 않는다.

---

# 12. 이번 Sprint에서 하지 않는 것

- 실제 OCR API 연결
- Production 배포
- 전체 1,615건 Import
- POS 연동
- Inventory Ledger
- 입고/출고 Posting
- Purchase Order
- AI 자동 승인
- Auth 구조 변경
- RLS 정책 변경
- Git Commit
- Git Push

---

# 13. 테스트 기준

필수 명령:

```bash
node --check <수정한 모든 JS 파일>
npm run build
npm run lint
npm test
```

실제 브라우저 테스트:

- Supabase 연결 성공
- 목록 조회
- 빈 데이터 화면
- API 실패 화면
- Seed 데이터 표시
- CRUD 테스트
- 새로고침 후 데이터 유지
- 콘솔 오류 없음

---

# 14. 완료 조건

- Migration 13개 적용 완료
- Table 생성 확인
- FK 확인
- Index 확인
- Test Seed 적용
- Supabase Read 연결
- 제한된 CRUD 성공
- Build 성공
- Lint 성공
- Test 성공
- 오류 목록 작성
- DB 구조와 문서 차이 보고
- Production 미적용
- Git Push 미실행

---

# 15. 완료 보고 형식

```md
## 구현 완료 요약

## 적용한 Migration

## 생성된 Table

## FK / Constraint / Index 검증

## Seed 적용 결과

## Supabase 연결 결과

## Read 테스트

## CRUD 테스트

## 수정한 파일

## 오류 및 해결

## 남은 문제

## PM 승인 필요 항목

## 다음 Sprint 제안
```

---

# 16. 다음 단계

이번 Sprint가 완료되면 다음 단계는 아래다.

## TASK_ORDER_008

```text
좋은축산 1,615건
→ Import Batch
→ Product Source Row
→ Import Queue
→ Review Queue
→ Product Dictionary Candidate
→ 정확도 평가
```

목표:

- 실제 1,615건 전체 Import
- 중복률 측정
- Dictionary 매칭률 측정
- Review 필요 비율 측정
- Supplier Alias 후보 생성
- MEATOS Data Quality Score 산출

---

# PM Message

이번 Sprint는 기능 개발 Sprint가 아니다.

지금까지 만든 구조가 실제 Supabase에서도
같은 방식으로 동작하는지 증명하는 Sprint다.

문서, Mock, DB, Web이 하나의 구조로 연결되어야 한다.

기능보다 증명,
속도보다 재현성,
편의보다 데이터 신뢰성을 우선한다.
