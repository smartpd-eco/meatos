# MEATOS_KNOWLEDGE_ENGINE.md

# MEATOS Knowledge Engine (MKE)

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Status**: Draft  
**Last Update**: 2026-07-10

## 1. 목적

MKE는 정부 표준, 실제 거래명세서, 사용자 경험, AI 학습 결과를 하나의 지식 체계로 통합하는 핵심 엔진이다.

## 2. 설계 철학

기존 ERP
상품 → 재고 → 판매

MEATOS
Knowledge → Product → Inventory → POS → AI → SCM

우리는 상품을 관리하는 것이 아니라 상품 지식을 관리한다.

## 3. 구성

- Product Dictionary
- Attribute Engine
- Alias Engine
- Memory Engine
- Confidence Engine
- Review Engine
- AI Assist Engine

## 4. 데이터 흐름

거래명세서
→ OCR
→ 정규화
→ Attribute 분석
→ Alias 검색
→ Memory 조회
→ Confidence 계산
→ AI 추천
→ 사용자 확인
→ Inventory 반영
→ Memory 업데이트

## 5. Knowledge 계층

Level1 : 정부 표준
Level2 : MEATOS 표준상품
Level3 : 공급처 Alias
Level4 : 사용자 Alias Memory

## 6. 핵심 원칙

- AI는 추천만 한다.
- 최종 결정은 사용자가 한다.
- 사용자가 수정한 결과가 가장 중요한 데이터이다.
- 잘못된 자동치환보다 확인 요청을 우선한다.

## 7. PM Note #002

2026-07-10

오늘 프로젝트는 'AI가 상품을 찾는다'에서
'MEATOS가 축산 지식을 축적하고 AI는 그 지식을 활용한다'로 방향이 진화했다.

이 결정은 프로젝트의 핵심 설계 철학으로 유지한다.

## 선언

정부 표준 + 실제 거래 데이터 + 사용자 경험으로 성장하는 Knowledge Engine이
MEATOS의 핵심 자산이다.
