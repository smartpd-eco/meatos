# SPRINT_001_PRODUCT_MASTER_SPEC.md
# Sprint 001 - Universal Product Engine

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Target**: Codex  
**Status**: Ready  
**Last Update**: 2026-07-10

---

# 1. Sprint 목표

MEATOS의 모든 기능이 사용하는 Product Master의 기반을 구축한다.

이번 Sprint에서는 AI를 만드는 것이 아니다.

AI가 사용할 수 있는 정확한 Product Master를 만드는 것이 목표이다.

---

# 2. 반드시 먼저 읽을 문서

Codex는 구현 전 아래 문서를 모두 확인한다.

- 01_MEATOS_CONSTITUTION.md
- 02_PROJECT_VISION.md
- 03_PROJECT_RULES.md
- 04_DEVELOPMENT_STANDARD.md
- 05_CODING_STANDARD.md
- 06_NAMING_STANDARD.md
- 07_DOCUMENT_STANDARD.md
- 08_DOCUMENTATION_STANDARD.md
- MEATOS_PRODUCT_STANDARD.md
- MEATOS_KNOWLEDGE_ENGINE.md

---

# 3. 이번 Sprint 범위

## 구현 대상

- Product Master
- Product Category
- Product Attribute
- Supplier Master(기본)
- Product Alias(기본)
- 검색
- CRUD
- Mock Data

## 제외 대상

- OCR
- POS
- AI 자동 추천
- 발주
- 재고 차감

보류 기능은 PM Note에만 기록한다.

---

# 4. Product Master 필드

필수 항목

- Product ID
- 표준상품명
- 축종
- 부위
- 가공단계
- 미박/무박
- 유골/무골
- 냉장/냉동
- 원산지
- 등급
- 브랜드
- 단위
- 사용여부

주의:
'전지'와 '미전지'는 자동 병합하지 않는다.
유사한 이름이라도 속성이 다르면 다른 상품으로 관리한다.

---

# 5. 검색 화면

지원 기능

- 상품명
- 분류
- 축종
- 부위
- 사용여부

검색은 빠르고 단순해야 한다.

---

# 6. Alias

이번 Sprint에서는 저장 구조만 구현한다.

자동 학습 기능은 구현하지 않는다.

---

# 7. 완료 기준 (DoD)

- Product Master CRUD 완료
- 검색 완료
- Mock Data 입력 가능
- Alias 연결 가능
- 빌드 오류 없음
- 변경 파일 보고 완료

Git Commit / Push는 사용자 승인 후 진행한다.

---

# 8. Codex 대화 규칙

- 구현 전 문서를 먼저 읽는다.
- 모르면 추측하지 않는다.
- 애매한 사항은 보고한다.
- 새로운 기능을 임의로 추가하지 않는다.
- 좋은 아이디어는 PM Note로 제안만 한다.
- Sprint 범위를 벗어나지 않는다.

---

# 9. PM 메시지

Codex,

이번 Sprint의 성공 기준은 기능 개수가 아니다.

Product Master를 흔들리지 않는 구조로 만드는 것이다.

급하게 많은 기능을 만들지 말고,
다음 Sprint에서 확장하기 쉽도록 설계하라.

> 한 번에 완벽하게 만들지 않는다.
> 하나씩, 꾸준히, 완성해 나간다.
