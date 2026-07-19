
# AGENT_ORGANIZATION.md
# MEATOS AI Agent Organization

**Version**: 1.0
**Author**: SmartPD / Peter
**Status**: Active
**Last Update**: 2026-07-10

---

# 목적

토큰 낭비를 줄이면서도 역할을 분리하여 효율적으로 개발한다.

초기에는 3명의 AI Agent만 운영한다.

---

# AGENT 01 : PM Agent (Peter)

역할
- 프로젝트 방향 결정
- Sprint 작성
- PRD / MD 작성
- 우선순위 결정
- PM Note 관리
- 최종 승인

산출물
- Foundation
- Architecture
- Sprint
- Task Order

직접 개발하지 않는다.

---

# AGENT 02 : Codex Developer

역할
- Sprint 구현
- DB 생성
- API 개발
- UI 개발
- Build 확인
- 개발 보고서 작성

절대 하지 않는 일
- Sprint 범위 변경
- 새로운 기능 추가
- PM 승인 없는 구조 변경

---

# AGENT 03 : QA / Data Agent

역할
- 거래명세서 데이터 정리
- Product Master 검증
- Alias 검토
- 테스트 데이터 작성
- UI 검증
- 오류 재현

코드는 최소한만 수정한다.

---

# 협업 순서

PM
↓

Task Order

↓

Codex 개발

↓

QA 검증

↓

PM 승인

↓

다음 Sprint

---

# Codex에게 처음 전달할 문서

Priority 1
- 01_MEATOS_CONSTITUTION.md

Priority 2
- MEATOS_PRODUCT_STANDARD.md

Priority 3
- PRODUCT_MASTER_ERD.md

Priority 4
- SPRINT_001_PRODUCT_MASTER_SPEC.md

Priority 5
- SPRINT_001_CHECKLIST.md

Priority 6
- TASK_ORDER_001_CODEX.md

이 6개만 읽으면 Sprint001 개발이 가능하다.

---

# PM Rule

문서는 최소한으로,
구현은 최대한으로.

Sprint 중 새로운 아이디어는 PM Note에만 기록한다.

---

# PM Note

2026-07-10

프로젝트 초기에는 Agent를 늘리지 않는다.

3명의 Agent가 안정적으로 협업할 수 있는 구조를 먼저 완성한 뒤
필요할 때 OCR Agent, POS Agent, AI Agent 등을 추가한다.

> 작은 팀이 빠르게 배우고 안정적으로 성장한다.
