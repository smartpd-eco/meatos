
# TASK_ORDER_001_CODEX.md
# MEATOS Official Development Order #001

**Version**: 1.0
**Author**: SmartPD / Peter
**Target**: Codex
**Status**: Approved
**Sprint**: Sprint 001 - Universal Product Engine
**Last Update**: 2026-07-10

---

# 목적

본 문서는 Codex에게 전달하는 첫 번째 공식 개발 지시서이다.

이번 작업의 목표는 많은 기능을 만드는 것이 아니라
MEATOS의 Product Engine 기반을 안정적으로 구축하는 것이다.

---

# 작업 전 확인

구현 전에 반드시 아래 문서를 읽는다.

- 01_MEATOS_CONSTITUTION.md
- 04_DEVELOPMENT_STANDARD.md
- 05_CODING_STANDARD.md
- MEATOS_PRODUCT_STANDARD.md
- MEATOS_KNOWLEDGE_ENGINE.md
- PRODUCT_MASTER_ERD.md
- SPRINT_001_PRODUCT_MASTER_SPEC.md
- SPRINT_001_CHECKLIST.md

읽지 않은 상태에서 개발하지 않는다.

---

# 이번 작업 범위

## 구현

- Product Master
- Product Category
- Product Attribute
- Product Alias
- Supplier Master
- Supplier Alias
- Product 검색
- Product CRUD
- Mock Data

## 구현 제외

- OCR
- POS
- Inventory
- 발주
- AI 자동치환
- AI 추천
- Dashboard

제외 기능은 임의로 추가하지 않는다.

---

# 핵심 개발 원칙

1. 표준상품(Product Master)이 기준이다.
2. Alias는 같은 상품의 다른 표현만 연결한다.
3. 전지와 미전지는 자동 병합하지 않는다.
4. 상품명보다 상품 속성을 우선한다.
5. DB는 확장 가능하게 단순 설계한다.

---

# 개발 절차

1. ERD 확인
2. DB 생성
3. Service 작성
4. CRUD API
5. UI 연결
6. Mock Data
7. 테스트
8. 결과 보고

---

# 완료 보고

반드시 아래 형식으로 보고한다.

- 완료 항목
- 생성 파일
- 수정 파일
- 테스트 결과
- 미구현 항목
- 위험 요소
- Sprint 완료 여부

---

# 승인 정책

Codex는 아래 작업을 사용자 승인 없이 수행할 수 있다.

- 일반 코드 작성
- UI 생성
- Service 생성
- Mock Data 생성
- Build 오류 수정
- 리팩터링
- 문서 수정

아래 작업은 반드시 승인받는다.

- Git Commit
- Git Push
- 배포
- DB 삭제/초기화
- Auth 변경
- 환경변수 변경
- 권한 정책 변경

---

# PM Message

Codex,

이번 Sprint는 기능 수가 아니라 구조가 성공 기준이다.

앞으로 모든 OCR, POS, AI, Inventory는
이번에 만드는 Product Master를 기반으로 동작하게 된다.

속도를 위해 구조를 희생하지 말고,
구조를 위해 불필요한 기능을 추가하지도 마라.

Sprint 범위를 지키는 것이 최고의 개발이다.

---

# PM Note (History)

2026-07-10

오늘 프로젝트는 "문서를 위한 문서" 단계에서
"문서가 개발을 이끄는 단계"로 전환되었다.

앞으로 새로운 아이디어는 즉시 구현하지 않는다.

PM Note에 기록하고,
Sprint 종료 후 채택 여부를 결정한다.

이 원칙은 MEATOS 프로젝트의 공식 개발 문화로 유지한다.
