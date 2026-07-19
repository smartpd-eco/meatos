
# TEMPORARY_IMPLEMENTATION_AUTHORITY.md
# MEATOS 임시 생성 권한 및 실행 지침

**Version**: 1.0  
**Status**: Active - One Sprint Only  
**Target**: Codex / Claude Code  
**Owner**: SmartPD  
**Scope**: Supabase DEV DB 뼈대 생성 및 GitHub 백업  
**Valid Until**: 본 Sprint 완료 보고 및 PM 승인 시점까지  
**Date**: 2026-07-11  

---

# 1. 목적

현재 MEATOS 프로젝트는 문서와 Mock 중심 구조에서
Supabase DEV 데이터베이스 기반 구조로 전환하는 단계다.

초기에는 생성해야 할 Migration, Table, Constraint, Seed, Adapter 파일이 많으므로
이번 Sprint에 한하여 제한된 실행 권한을 부여한다.

본 권한은 속도를 높이기 위한 임시 권한이며,
운영 데이터와 Production 환경에 대한 상시 권한이 아니다.

---

# 2. 적용 환경

본 권한은 아래 환경에만 적용한다.

```text
Project: MEATOS
Environment: DEV
Supabase Project: 현재 생성한 MEATOS 프로젝트
GitHub Repository: smartpd-eco/meatos
Local Path: C:\MEATOS
```

다음 환경에는 적용하지 않는다.

```text
Production
실사용 고객 데이터
결제 환경
운영 POS
운영 OCR API
다른 Supabase Project
다른 GitHub Repository
```

---

# 3. 이번 Sprint에서 허용하는 작업

## 3.1 코드 및 파일

아래 작업은 별도 질문 없이 진행할 수 있다.

- Supabase Migration SQL 생성
- Migration SQL 수정
- Seed SQL 생성
- 테스트용 Seed 수정
- DB Adapter 생성
- Supabase Read Adapter 생성
- 제한된 CRUD Adapter 생성
- `.env.example` 생성 또는 보완
- Supabase 설정 가이드 문서 생성
- Mock → DB 매핑 파일 생성
- ERD 문서 생성
- 테스트 스크립트 생성
- 빌드 오류 수정
- Lint 오류 수정
- 테스트 오류 수정
- 기존 Mock 흐름 보존을 위한 Adapter 수정
- `scripts/build.js` 파일 목록 추가
- Supabase 연결 상태 UI 추가

---

## 3.2 Supabase DEV 생성 권한

아래 작업은 현재 MEATOS DEV 프로젝트에서 실행할 수 있다.

- 신규 Table 생성
- 신규 Column 생성
- Primary Key 생성
- Foreign Key 생성
- Unique Constraint 생성
- Check Constraint 생성
- Index 생성
- Trigger 생성
- View 생성
- Function 생성
- Test Seed 입력
- Migration 실행
- Migration 실행 결과 검증
- Table Editor 구조 확인
- Read 테스트
- 제한된 CRUD 테스트
- 오류 발생 시 동일 Migration 내 비파괴적 수정

---

## 3.3 Git 권한

이번 Sprint 완료 후 아래 작업을 수행할 수 있다.

- `git status`
- `git diff`
- `git add`
- `git commit`
- `git push origin main`

단, Commit과 Push는 아래 조건을 모두 만족할 때만 허용한다.

```text
Build 성공
Lint 성공
Test 성공
Migration 검증 완료
Secret 노출 없음
PM 완료 보고 작성
```

---

# 4. 생성 가능한 DB 범위

이번 권한으로 생성 가능한 테이블은 아래 범위로 제한한다.

```text
source_registry
supplier_master
product_species
product_category
product_attribute_value
product_dictionary
product_master
product_alias
supplier_alias
import_batch
product_source_row
import_queue
review_queue
learning_history
ocr_provider_registry
ocr_document
ocr_line_item
ocr_processing_history
audit_event
```

필요한 공통 Function, Trigger, Index, View는 추가할 수 있다.

목록에 없는 신규 업무 영역은 생성하지 않는다.

예:

```text
inventory
purchase_order
payment
auth
role
permission
pos_sales
production
shipping
```

위 영역은 이번 권한에서 제외한다.

---

# 5. Test Seed 권한

허용:

- Authority Level L1~L6
- 축종 기준정보
- 카테고리 기준정보
- Attribute Sample
- Unit Sample
- OCR Provider Mock
- 좋은축산 Supplier 1건
- Source Registry 1건
- Product Dictionary 10~30건
- Alias 20~50건
- 검증용 Review / OCR Mock

금지:

- 좋은축산 1,615건 전체 Import
- 실제 거래처 대량 데이터
- 실제 고객 개인정보
- 운영 매출 데이터
- 실제 재고 데이터
- 실제 OCR 이미지 대량 저장

전체 데이터 Import는 별도 PM 승인 후 진행한다.

---

# 6. 절대 금지 작업

아래 작업은 본 권한으로도 실행할 수 없다.

- Production DB 변경
- DB Table 삭제
- DB Column 삭제
- DB 데이터 전체 삭제
- `truncate`
- 파괴적 `alter`
- 기존 데이터 초기화
- `drop table`
- `drop schema`
- Supabase Project 삭제
- Auth 구조 변경
- RLS 정책 변경
- 사용자 권한 정책 변경
- service_role Key 브라우저 사용
- Secret Key 커밋
- Database Password 커밋
- JWT Secret 사용 또는 변경
- `.env.local` 커밋
- 실제 OCR API Key 등록
- 실제 외부 API 발송
- Force Push
- `git reset --hard`
- 대량 파일 삭제
- 다른 Repository Push
- 다른 Supabase Project 변경
- Production 배포

위 작업이 필요하면 반드시 멈추고 PM 승인을 요청한다.

---

# 7. 환경변수 규칙

허용 파일:

```text
.env.example
.env.local
```

## `.env.example`

Key 이름만 기록한다.

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

## `.env.local`

실제 값은 로컬에만 저장한다.

Git 상태에서 추적되지 않는지 반드시 확인한다.

```bash
git status
git check-ignore .env.local
```

Secret Key, service_role, JWT Secret, Database Password는
브라우저용 설정 파일에 넣지 않는다.

---

# 8. Migration 실행 규칙

Migration은 아래 순서로 실행한다.

```text
001_extensions
002_common_functions
003_source_registry
004_supplier_master
005_product_reference
006_product_dictionary
007_product_master
008_alias
009_import_pipeline
010_review_learning
011_ocr_pipeline
012_audit_indexes
013_seed_reference
```

규칙:

1. 한 번에 전체 Migration을 실행하지 않는다.
2. 각 단계 실행 후 오류를 확인한다.
3. FK와 Constraint를 확인한다.
4. 오류가 발생하면 다음 Migration으로 넘어가지 않는다.
5. 원인을 기록하고 비파괴적으로 수정한다.
6. 이미 성공한 Migration은 임의로 재작성하지 않는다.
7. 변경이 필요한 경우 새 Migration 파일을 추가한다.

---

# 9. 검증 의무

모든 작업 종료 전 아래를 실행한다.

```bash
node --check <수정한 모든 JS 파일>
npm run build
npm run lint
npm test
git diff --check
```

Supabase 검증:

```text
Table 존재 확인
PK 확인
FK 확인
Unique 확인
Check 확인
Index 확인
Seed 확인
Read 확인
제한된 CRUD 확인
브라우저 Console 오류 확인
```

---

# 10. Commit 규칙

Commit 전 확인:

```text
Secret 없음
.env.local 제외
Migration 순서 정상
Build 성공
Lint 성공
Test 성공
문서 업데이트
완료 보고 작성
```

권장 Commit Message:

```text
feat(db): initialize MEATOS Supabase schema and adapters
```

Commit은 이번 Sprint 변경만 포함한다.

다른 프로젝트 파일이나 무관한 수정은 포함하지 않는다.

---

# 11. Push 규칙

Push 전 반드시 확인한다.

```bash
git status
git diff --cached
git log -1 --oneline
```

허용:

```bash
git push origin main
```

금지:

```bash
git push --force
git push --all
git push 다른원격저장소
```

Push 성공 후 원격 Repository에서 변경 파일이 정상 반영되었는지 확인한다.

---

# 12. 완료 후 권한 종료

아래 조건을 충족하면 본 임시 권한은 자동 종료한다.

```text
Migration 완료
Seed 완료
Read 테스트 완료
제한 CRUD 완료
Build/Lint/Test 완료
Commit 완료
Push 완료
PM 완료 보고 제출
```

완료 후 수행:

- 임시 Secret 삭제
- 불필요한 Local Token 삭제
- Supabase CLI Login Session 정리
- 임시 Access Token 폐기
- 연결한 임시 통합 권한 제거
- `.env.local` Git 제외 재확인
- 다음 Sprint부터 기존 승인 정책으로 복귀

---

# 13. 실패 시 처리

실행 중 오류가 발생하면 다음 순서로 처리한다.

1. 즉시 추가 실행을 멈춘다.
2. 오류 메시지를 보존한다.
3. 마지막 성공 Migration을 기록한다.
4. 데이터 손상 여부를 확인한다.
5. 비파괴적 수정안을 작성한다.
6. 해결 불가 시 PM에게 보고한다.

성공하지 않았는데 성공했다고 보고하지 않는다.

---

# 14. 완료 보고 형식

```md
## Sprint 완료 요약

## 실행한 Migration

## 생성된 Table / View / Function

## Seed 결과

## Supabase 연결 결과

## Read 테스트 결과

## CRUD 테스트 결과

## 생성 및 수정 파일

## Build / Lint / Test 결과

## Commit 정보

## Push 결과

## Secret 및 권한 정리 결과

## 남은 문제

## 다음 Sprint 제안
```

---

# 15. PM 최종 지시

Codex는 이번 Sprint에서 MEATOS의 DB 뼈대를 생성할 수 있다.

그러나 이 권한은 무제한 권한이 아니다.

```text
생성은 허용한다.
삭제는 금지한다.

검증은 허용한다.
운영 변경은 금지한다.

Commit과 Push는 허용한다.
Force Push는 금지한다.

DEV는 허용한다.
Production은 금지한다.
```

범위를 벗어나는 순간 작업을 멈추고 PM 승인을 요청한다.

이번 Sprint 종료 후 본 권한은 폐기하고
기존 `AGENTS.md` 및 `CLAUDE.md` 승인 정책으로 복귀한다.
