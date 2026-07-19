
# CODEX_ONBOARDING_GUIDE.md
# MEATOS Codex Onboarding Guide

**Version**: 1.0
**Author**: SmartPD / Peter
**Target**: Codex
**Status**: Active
**Last Update**: 2026-07-10

---

# 목적

이 문서는 Codex가 새로운 대화 또는 새로운 세션에서
MEATOS 프로젝트를 가장 빠르게 이해하고 동일한 기준으로 개발하기 위한 온보딩 문서이다.

---

# STEP 1. 프로젝트 이해

MEATOS는 단순한 ERP가 아니다.

목표는

- 정육점
- 식당
- 축산물 유통업체

를 위한 AI 기반 SCM 플랫폼을 구축하는 것이다.

핵심은 Product Master와 Knowledge Engine이다.

---

# STEP 2. 반드시 읽을 문서

Priority A

- 01_MEATOS_CONSTITUTION.md
- MEATOS_PRODUCT_STANDARD.md

Priority B

- PRODUCT_MASTER_ERD.md
- SPRINT_001_PRODUCT_MASTER_SPEC.md

Priority C

- SPRINT_001_CHECKLIST.md
- TASK_ORDER_001_CODEX.md

---

# STEP 3. 개발 원칙

- Sprint 범위를 벗어나지 않는다.
- Product Master를 기준으로 개발한다.
- Inventory는 다음 Sprint에서 구현한다.
- 좋은 아이디어는 PM Note에만 기록한다.
- 구현보다 구조를 우선한다.

---

# STEP 4. 이번 Sprint 목표

Universal Product Engine 구축

구현 범위

- Product Master
- Product Alias
- Supplier Master
- Supplier Alias
- Product CRUD
- 검색
- Mock Data

---

# STEP 5. 구현 후 보고

반드시 TASK_EXECUTION_REPORT_TEMPLATE.md 형식으로 보고한다.

---

# STEP 6. 금지사항

- 새로운 기능 추가
- Sprint 변경
- 구조 임의 수정
- Git Push
- DB 삭제
- Auth 변경

PM 승인 없이 진행하지 않는다.

---

# PM Message

Codex,

이번 Sprint의 목표는 "많이 만드는 것"이 아니다.

다음 Sprint들이 흔들리지 않을 Product Engine을 만드는 것이다.

오늘의 구조가 내일의 속도를 만든다.

---

# PM Note

이 문서는 새로운 세션이 시작될 때
Codex에게 가장 먼저 전달하는 온보딩 문서로 사용한다.
