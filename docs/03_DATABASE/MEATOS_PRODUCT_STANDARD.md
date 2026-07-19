# MEATOS_PRODUCT_STANDARD.md
# MEATOS Product Standard

**Version**: 1.0
**Author**: SmartPD / Peter
**Status**: Active
**Last Update**: 2026-07-10

## 1. 목적
MEATOS에서 사용하는 모든 축산물 상품의 표준 기준을 정의한다.
모든 OCR, POS, 재고, 발주, AI는 Product Master를 기준으로 동작한다.

## 2. 표준 계층
Level 1 : 정부/공공 표준(KAPE, 농림축산식품부, 식약처, 축산물이력제)
Level 2 : MEATOS 표준상품
Level 3 : 공급처 Alias
Level 4 : 사용자 Alias Memory

## 3. 표준상품 속성
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

## 4. 핵심 원칙
- 상품명이 아니라 표준상품을 관리한다.
- 비슷한 이름이라도 다른 상품은 병합하지 않는다.
- Alias는 동일 상품의 다른 표현만 연결한다.

예)
전지 ≠ 미전지
앞다리살 ≠ 미박 앞다리살
냉장 ≠ 냉동

## 5. Alias Memory
OCR
→ 자동 치환
→ 사용자 수정
→ Alias Memory 저장
→ 다음부터 자동 치환

## 6. 공급처별 Alias
같은 명칭이라도 공급처마다 별도 관리한다.

좋은축산 : 미전지 → 사용자 확정
돈윤 : 미전지 → 사용자 확정

## 7. Confidence
95~100 자동확정
90~94 자동확정(표시)
70~89 사용자확인
70 미만 미매칭

## 8. Review Queue
Pending
Approved
Rejected
Changed

## 9. Product Master 필드
Product ID
Standard Name
Species
Part
Processing Type
Skin Type
Bone Type
Storage Type
Origin
Grade
Brand
Unit
Active

## 10. 데이터 출처
1. 축산물품질평가원
2. 농림축산식품부
3. 식품의약품안전처
4. 축산물이력제
5. 실제 거래명세서
6. 사용자 Alias Memory

## 11. 장기 목표
- KAPE API 연계
- 축산물이력 자동조회
- AI 상품 추천
- AI 발주 추천
- 전국 Alias 공유(옵션)

> 표준상품(Product Master)과 Alias Memory는 MEATOS의 핵심 자산이다.
