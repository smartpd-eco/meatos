# CODEX_ORDER_001.md
# MEATOS Codex Development Order

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Target**: OpenAI Codex  
**Status**: Active  
**Last Update**: 2026-07-10  

---

# 1. 목적

이 문서는 Codex가 MEATOS 프로젝트에서 개발을 시작하기 전에 반드시 따라야 할 작업 순서와 사고방식을 정의한다.

Codex는 단순히 코드를 작성하는 도구가 아니다.  
MEATOS의 문서, 구조, 개발 원칙을 이해하고 그 기준에 맞춰 개발하는 실행 담당자다.

---

# 2. 최우선 원칙

Codex는 개발 전에 반드시 아래 문서를 먼저 확인한다.

```text
docs/00_FOUNDATION/01_MEATOS_CONSTITUTION.md
docs/00_FOUNDATION/02_PROJECT_VISION.md
docs/00_FOUNDATION/03_PROJECT_RULES.md
docs/00_FOUNDATION/04_DEVELOPMENT_STANDARD.md
docs/00_FOUNDATION/05_CODING_STANDARD.md
docs/00_FOUNDATION/06_NAMING_STANDARD.md
docs/00_FOUNDATION/07_DOCUMENT_STANDARD.md
docs/00_FOUNDATION/08_DOCUMENTATION_STANDARD.md
```

위 문서는 MEATOS의 최상위 기준이다.

---

# 3. Codex의 사고방식

Codex는 기능을 바로 만들지 않는다.

먼저 다음을 판단한다.

1. 이 기능은 Core Engine인가?
2. Plugin인가?
3. Inventory Engine을 통과하는가?
4. Event Log가 필요한가?
5. 기존 문서와 충돌하지 않는가?
6. 기존 구조를 재사용할 수 있는가?
7. 사용자 업무를 줄이는 기능인가?

이 질문에 답한 후 개발한다.

---

# 4. 개발 우선순위

현재 MEATOS의 개발 우선순위는 다음과 같다.

```text
1. Product Engine
2. Product Alias Engine
3. Supplier Master
4. Inventory Engine
5. Inventory Ledger
6. Inventory History
7. AI 거래명세서 OCR
8. POS Adapter
9. AI 발주 추천
10. Mobile / Dashboard
```

POS Adapter는 중요하지만 Core가 아니다.  
POS는 Plugin이며, Inventory Engine이 먼저 완성되어야 한다.

---

# 5. 작업 절차

Codex는 작업할 때 아래 순서를 따른다.

```text
1. 관련 Foundation 문서 확인
2. 현재 프로젝트 구조 확인
3. 관련 파일 읽기
4. 필요한 MD 또는 PRD 보완
5. 구현 계획 작성
6. 코드 작성
7. 테스트
8. 빌드 확인
9. 변경 내용 요약
10. Git 상태 확인
```

---

# 6. 금지 사항

Codex는 다음 작업을 사용자 확인 없이 하지 않는다.

- git commit
- git push
- 배포
- DB 삭제
- DB 초기화
- 환경변수 변경
- 인증/Auth 구조 변경
- 권한 정책 변경
- 대량 삭제
- 기존 Core Engine 구조 파괴

---

# 7. 자체 진행 가능한 작업

아래 작업은 확인 없이 진행 가능하다.

- 파일 읽기
- 문서 생성
- 문서 수정
- 일반 코드 생성
- 일반 코드 수정
- 폴더 생성
- UI 페이지 생성
- Mock 데이터 생성
- Service 생성
- Adapter 초안 생성
- Build 오류 수정
- 단순 리팩터링

---

# 8. 코드 작성 기준

Codex는 아래 원칙을 따른다.

- 하드코딩을 피한다.
- 중복 코드를 만들지 않는다.
- 이름은 명확하게 작성한다.
- Engine과 Plugin을 혼합하지 않는다.
- UI에 비즈니스 로직을 몰아넣지 않는다.
- 재고 변경은 Inventory Engine을 통해 처리한다.
- 중요한 작업은 Event Log를 남긴다.

---

# 9. 폴더 기준

Codex는 아래 구조를 기준으로 작업한다.

```text
docs/           문서
apps/           실행 앱
services/       비즈니스 로직
packages/       공통 모듈
adapters/       POS/OCR/API 연결
ai/             AI 기능
scripts/        자동화 스크립트
```

새 폴더가 필요하면 기존 역할과 충돌하지 않도록 생성한다.

---

# 10. 완료 보고 형식

작업 완료 후 Codex는 반드시 아래 형식으로 보고한다.

```md
## 작업 요약

## 읽은 문서

## 수정한 파일

## 새로 생성한 파일

## 구현 내용

## 검증 결과

## 남은 문제

## 다음 추천 작업
```

실패하거나 미완성인 부분은 숨기지 않는다.

---

# 11. 현재 첫 개발 오더

Codex의 다음 목표는 POS Adapter가 아니다.

첫 목표는 다음이다.

```text
TASK-001
MEATOS Product Engine + Alias Engine 기초 구축
```

## 범위

- Product Master 구조 생성
- Product Alias 구조 생성
- Supplier Master 구조 생성
- Mock Data 생성
- 기본 CRUD 화면 또는 Service 초안 생성
- 문서와 코드 구조 연결

## 완료 기준

- 표준 상품을 등록할 수 있다.
- 거래처별 Alias를 등록할 수 있다.
- Alias가 표준 상품과 연결된다.
- 이후 AI OCR 결과가 이 구조에 연결될 수 있다.

---

# 12. Codex에게 주는 최종 지시

Codex는 빠르게 많이 만들기보다  
오랫동안 유지될 수 있는 구조를 먼저 만든다.

MEATOS는 단순 프로그램이 아니다.

정육점, 식당, 축산물 유통업체의 업무를 줄이는  
AI 기반 축산 유통 Operating System이다.

따라서 모든 개발은 다음 원칙을 따른다.

> 한 번에 완벽하게 만들지 않는다.  
> 하나씩, 꾸준히, 완성해 나간다.
