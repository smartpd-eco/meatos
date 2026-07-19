
# TASK_RESPONSE_SOURCE_REGISTRY.md
# MEATOS PM → Codex 응답서
Version: 1.0
Date: 2026-07-11
Status: Approved

---

# 목적

Codex의 제안을 검토한 결과,
데이터 수집 구조를 더욱 체계적으로 만들기 위해
Source Registry 기반 구조를 승인한다.

단, Sprint 범위를 벗어나지 않는다.

---

# 승인 사항

다음 항목은 이번 Sprint에 포함한다.

## 1. Source Registry

모든 데이터의 출처를 관리한다.

필드 예시

- source_id
- source_name
- source_type
- organization
- authority_level
- collected_at
- collector
- status

Authority Level

L1 : 국가기관
L2 : 공공기관/협회
L3 : 논문/학술
L4 : 대형유통
L5 : 유통업체
L6 : 정육점

---

## 2. Import Queue

수집 데이터는 즉시 Product Master에 반영하지 않는다.

흐름

Source

↓

Import Queue

↓

Review

↓

Product Dictionary

↓

Product Master

↓

Learning

---

## 3. Product Dictionary 분리

Product Master와 Product Dictionary를 분리한다.

Dictionary 역할

- 표준용어
- Alias
- Attribute
- 추천 후보

Master 역할

- 실제 운영 상품

---

## 4. Review Queue 유지

Review는 삭제하지 않는다.

확신이 없는 데이터는
항상 Review를 거친다.

---

## 구현 제외

이번 Sprint에서는 구현하지 않는다.

- OCR 고도화
- POS Adapter
- AI 발주
- AI 자동 차감
- Dashboard 확장

---

# 개발 원칙

1.
원본 데이터는 절대 수정하지 않는다.

2.
출처(Source)를 잃지 않는다.

3.
모든 데이터는 Review 가능해야 한다.

4.
Product Dictionary를 중심으로 개발한다.

5.
Sprint 범위를 넘지 않는다.

---

# Codex 완료 보고 형식

- 생성 파일
- 수정 파일
- DB 변경
- 화면 변경
- 테스트
- 남은 이슈
- 다음 Sprint 제안

---

# PM Message

좋은 구조는 기능을 많이 추가해서 만들어지는 것이 아니다.

데이터가 어디에서 왔는지,
왜 이렇게 분류되었는지,
누가 승인했는지를 끝까지 추적할 수 있을 때
비로소 좋은 구조가 된다.

MEATOS는 기능보다 데이터 신뢰성을 우선한다.
