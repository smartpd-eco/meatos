# MEATOS 구현 전략 및 개발 원칙

Version 1.0

---

## 프로젝트 비전

MEATOS는 단순한 정육점 프로그램이 아니다.

우리가 만드는 것은 대한민국 최초의 **AI 기반 축산물 Universal SCM Platform**이다.

정부 데이터를 활용하고, 민간이 실제 사용하는 운영 플랫폼을 구축한다.

---

## 개발 철학

기능을 만드는 것이 아니라 Core Engine을 만든다.

모든 기능은 Core Engine 위에서 동작한다.

```text
AI
POS
OCR
발주
모바일
ERP
        |
        v
Universal Inventory Engine
```

Engine이 먼저이고, 기능은 나중이다.

---

## 핵심 아키텍처

MEATOS는 4개의 Core Engine을 중심으로 개발한다.

```text
Product Engine
Inventory Engine
Event Engine
AI Engine
```

그 위에 POS, OCR, SCM, Dashboard, Mobile을 Plugin 또는 Application Layer로 연결한다.

---

## Core Engine 1. Product Engine

역할은 상품의 표준을 만드는 것이다.

관리 대상:

- 상품분류
- 표준상품
- 상품 Alias
- 단위
- 거래처별 상품명
- 이력번호 기준

Product Engine은 프로젝트의 가장 큰 자산이다.

---

## Core Engine 2. Universal Inventory Engine

MEATOS의 심장이다.

모든 데이터는 Inventory Engine을 통과한다.

```text
입고
현재고
출고
재고조정
Ledger
History
```

POS 판매도 Inventory Engine을 통해 출고 이벤트로 처리한다.

---

## Core Engine 3. Event Engine

모든 작업은 이벤트다.

예시:

- 거래명세서 업로드
- OCR 완료
- Alias 확정
- 입고 완료
- 재고 증가
- POS 판매
- 재고 감소
- 발주 추천 생성
- 알림톡 발송
- 이벤트 저장

이벤트 구조를 사용하면 기능이 추가되어도 기존 코드를 크게 수정하지 않는다.

---

## Core Engine 4. AI Engine

AI는 업무를 대신하지 않는다. 추천한다.

AI 역할:

- OCR
- 상품 치환
- 이상 판매 감지
- 발주 추천
- 가격 예측
- 재고 예측
- 소비패턴 분석

최종 승인자는 사용자이다.

---

## 개발 우선순위

### Sprint 1. Universal Product Engine

구현:

- Category
- Standard Product
- Alias
- Supplier
- CRUD
- Mock Data

완료 기준:

- 상품을 등록할 수 있다.
- Alias를 관리할 수 있다.

### Sprint 2. Universal Inventory Engine

구현:

- 입고
- 출고
- 현재고
- Ledger
- History

완료 기준:

- 재고 흐름이 정상 동작한다.

### Sprint 3. AI 거래명세서

구현:

- OCR
- 공급업체 분석
- 상품 추출
- Alias 추천

완료 기준:

- 거래명세서를 입고로 전환한다.

### Sprint 4. Dashboard

구현:

- KPI
- 재고현황
- 입출고
- TOP 상품
- TOP 거래처

### Sprint 5. Universal POS Adapter

지원 순서:

1. API
2. DB
3. CSV
4. Folder Watch
5. Manual
6. Lite POS

완료 기준:

- 판매 데이터가 Inventory Engine으로 들어온다.

### Sprint 6. AI Purchase

구현:

- 안전재고
- 판매패턴
- 공급사
- 리드타임
- MOQ
- AI 발주 추천

---

## Universal POS Adapter 원칙

POS는 Core가 아니다. Plugin이다.

```text
POS
  -> Adapter
  -> Inventory Engine
```

이 구조를 절대 변경하지 않는다.

---

## POS 없는 정육점

MEATOS는 POS가 없어도 사용 가능해야 한다.

지원:

- Manual Sales
- Barcode Scanner
- Lite POS

이것이 시장 확장의 핵심이다.

---

## 개발 원칙

- Core Engine 먼저 개발한다.
- UI보다 Engine을 먼저 만든다.
- CRUD보다 Ledger를 먼저 만든다.
- Event를 먼저 저장한다.
- AI는 추천만 한다.
- POS는 Plugin으로 개발한다.
- 모든 데이터는 Inventory Engine을 통과한다.
- 모든 작업은 Event Log를 남긴다.
- 정부 API는 활용하지만 종속되지 않는다.
- 고객의 업무 흐름을 기준으로 설계한다.

---

## 프로젝트 목표

우리는 정육점 ERP를 만드는 것이 아니다.

POS를 만드는 것도 아니다.

OCR 프로그램을 만드는 것도 아니다.

우리는 **축산물 유통의 운영체제(Operating System)** 를 만든다.

---

## 최종 비전

```text
거래명세서
  -> AI OCR
  -> Alias Engine
  -> Inventory Engine
  -> POS Adapter
  -> AI Purchase
  -> Supplier
  -> 도축증명서
  -> 이력번호
  -> AI SCM Platform
```

---

## Codex / Claude Code 개발 원칙

앞으로 모든 개발은 이 문서를 기준으로 진행한다.

기능 추가 시 다음 질문을 먼저 한다.

```text
이 기능이 Core Engine에 속하는가?
```

- YES: Core 구현
- NO: Plugin 구현

Engine과 Plugin을 절대 혼합하지 않는다.

---

## Version 2.0 계획

향후 추가:

- Mobile App
- Multi Tenant
- Franchise
- B2B Marketplace
- AI 가격 예측
- AI 소비 예측
- 정부 API 자동 연동
- 전국 축산물 데이터 분석
