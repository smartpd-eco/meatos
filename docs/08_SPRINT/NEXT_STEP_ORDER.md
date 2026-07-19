# NEXT_STEP_ORDER.md
# MEATOS Sprint Command
Version: 1.0
Date: 2026-07-11

---

# 1. Codex 작업 지시

## Sprint 목표

"Product Master가 실제 데이터를 이해하도록 만든다."

이번 Sprint에서는 기능을 늘리지 않는다.

---

## 작업 1

GOOD_CHUKSAN 1,615건 기준

- Product Source 저장
- Review Queue 유지
- 원본 데이터 수정 금지

완료조건
- 원본 100% 보존

---

## 작업 2

Product Attribute 구현

필수 Attribute

- Species
- Category
- Part
- Processing
- Skin
- Bone
- Storage
- Origin
- Grade
- Unit

완료조건

Product는 Attribute 기반으로 생성된다.

---

## 작업 3

Alias Engine

- Alias CRUD
- 검색
- Review 연결

자동 추측 금지

---

## 작업 4

Learning Table

AI_LEARNING_ENGINE.md 기준

Table만 구현

Learning Logic은 최소 구현

---

## 작업 5

Inventory 연결 준비

Product Master

↓

Inventory Item

↓

입고

↓

재고

↓

출고

아직 OCR/POS는 연결하지 않는다.

---

## Sprint 종료 보고

- 변경 파일
- DB 변경
- 화면
- 테스트 결과
- 남은 이슈

---

# 2. Peter(PM) 해야 할 일

개발보다 데이터 품질을 높인다.

## Step 1

거래처 데이터 계속 확보

목표

10개 업체

---

## Step 2

정부 기준 수집

- 축산물품질평가원
- 식약처
- 농림축산식품부

표준 기준 업데이트

---

## Step 3

Product Dictionary 검증

같은 부위

다른 이름

전부 정리

---

## Step 4

Review 승인

Codex가 만든 Review Queue를

사람이 승인한다.

---

## Step 5

PM Note 작성

매 Sprint 종료 시

- 배운 점
- 수정 사항
- 다음 목표

3줄만 기록한다.

---

# 이번 Sprint 성공 기준

1.
원본 데이터는 절대 손상되지 않는다.

2.
Product Master가 만들어진다.

3.
Alias가 누적된다.

4.
Review Queue가 동작한다.

5.
다음 Sprint에서 Inventory를 연결할 수 있다.

---

# PM Message

지금은 AI를 만드는 단계가 아니다.

좋은 데이터를 만드는 단계이다.

데이터 품질이 높아질수록
MEATOS의 AI도 함께 성장한다.
