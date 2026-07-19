
# DATA_COLLECTION_MASTER_PLAN.md
# MEATOS 데이터 수집 마스터 플랜

Version: 1.0
Date: 2026-07-11
Status: Active

---

# 목적

MEATOS Product Dictionary와 AI Learning의 품질을 높이기 위해
데이터를 권위와 신뢰도 순으로 수집한다.

원칙은 "많이 모으는 것"이 아니라
"출처가 명확한 데이터를 표준화하는 것"이다.

---

# 데이터 우선순위

## LEVEL 1 (최우선 - 국가 기준)

수집 대상

- 농림축산식품부
- 축산물품질평가원(KAPE)
- 식품의약품안전처
- 축산물이력제

수집 내용

- 부위명
- 축종
- 등급
- 원산지
- 이력 기준
- 품목 분류

활용

→ Product Master 표준 기준

---

## LEVEL 2 (공공기관 / 협회)

- 농협경제지주
- 축산관련 협회
- 한돈자조금
- 한우자조금
- 축산물 유통 관련 기관

수집 내용

- 업계 표준 용어
- 유통 용어
- 품목 코드
- 권장 분류

활용

→ Product Dictionary 검증

---

## LEVEL 3 (논문 / 학술자료)

- KCI 논문
- RISS
- 농촌진흥청 보고서
- 정부 연구용역
- 학회지

수집 내용

- 부위 분류
- 용어 정의
- 유통 구조
- AI/OCR 연구

활용

→ AI 규칙 설계

---

## LEVEL 4 (대형 유통사)

조사 대상

- 쿠팡
- SSG
- 이마트
- GS
- 홈플러스
- 롯데마트
- 네이버쇼핑
- 컬리

수집 내용

- 상품명
- 판매명
- 규격
- 옵션
- 카테고리

활용

→ 소비자 표현 Dictionary

---

## LEVEL 5 (실제 유통업체)

- 육가공업체
- 도매상
- 공급사

수집 내용

- 거래명세서
- 상품명
- 규격
- 약어
- 현장 용어

활용

→ Supplier Alias

---

## LEVEL 6 (정육점)

- POS 상품명
- 판매 상품명
- 진열명
- 지역 용어

활용

→ Alias 확장

---

# 역할 분담

## Peter

- 국가 표준 조사
- 공공기관 자료 정리
- 논문 및 문헌 조사
- 표준 기준 검증

## 영덕(PM)

- 실제 거래처 확보
- 거래명세서 수집
- 유통 용어 확보
- 현장 검증

## Codex

- 수집 데이터 Import
- Product Dictionary 구축
- Alias 생성
- Review Queue 관리

---

# 최종 데이터 흐름

국가 표준
↓
협회
↓
논문
↓
대형 유통
↓
실제 거래처
↓
정육점
↓
MEATOS Product Dictionary
↓
AI Learning Database

---

# PM Message

정부는 표준을 만든다.

현장은 언어를 만든다.

MEATOS는 표준과 현장의 언어를 연결하는 플랫폼을 목표로 한다.

데이터가 많아질수록 중요한 것은 양이 아니라
출처와 품질이다.

---

# PM Note

오늘부터 데이터 수집은 무작위가 아니라
권위 순서(Level 1~6)로 진행한다.

이 구조를 유지하면 Product Dictionary의 신뢰성과
AI Learning 품질을 함께 높일 수 있다.
