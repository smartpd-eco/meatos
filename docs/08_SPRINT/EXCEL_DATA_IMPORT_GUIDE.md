# EXCEL_DATA_IMPORT_GUIDE.md
# MEATOS 유통 데이터 온보딩 지침

**Version** : 1.0  
**Target** : Codex  
**Sprint** : 001  
**Status** : Active

---

# 목적

본 문서는 실제 유통업체(정육점/육가공/도매)에서 받은 Excel 데이터를
MEATOS Product Master 구축을 위한 Seed Data로 사용하는 기준이다.

이번 작업의 목적은 데이터를 그대로 DB에 저장하는 것이 아니라
표준상품(Product Master)와 Alias를 구축하는 것이다.

---

# 작업 원칙

❌ 엑셀 데이터를 그대로 Product Master에 저장하지 않는다.

⭕ Product Master + Attribute + Alias 형태로 변환한다.

---

# 처리 순서

1. Excel 분석
2. 컬럼 구조 파악
3. 상품명 추출
4. 중복 제거
5. Attribute 분석
6. 표준상품 매핑
7. Alias 생성
8. 검토 대상 분리
9. Product Master 등록

---

# 반드시 추출할 항목

- 거래처명
- 상품명
- 규격
- 단위
- 원산지
- 브랜드
- 비고

추가 컬럼은 유지하되 Product Master와 직접 연결하지 않는다.

---

# Codex 작업 지침

## 1. 중복 제거

같은 상품은 하나의 표준상품으로 연결한다.

단,

전지 ≠ 미전지

앞다리 ≠ 미박앞다리

같이 다른 상품은 절대 병합하지 않는다.

---

## 2. Attribute 분석

상품명을 먼저 저장하지 말고
다음 속성을 먼저 분석한다.

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

---

## 3. Alias 생성

원본명은 반드시 보존한다.

예)

원본

미전지

↓

Alias

미전지

↓

표준상품

국내산 냉장 미박 앞다리살(확정 시)

※ 확정되지 않은 경우 Review Queue로 이동한다.

---

## 4. Review 대상

자동 판단이 어려운 상품은

- Review
- Manual Check

목록으로 분리한다.

자동 추측하지 않는다.

---

# 결과 산출물

Codex는 아래 결과를 제출한다.

1. Product Master 후보
2. Alias 목록
3. Review 목록
4. 중복 목록
5. 데이터 품질 요약

---

# PM 승인

최종 표준상품 확정은 PM 승인 후 반영한다.

AI는 추천만 수행하며
최종 결정은 사람이 한다.

---

# PM Message

실제 거래 데이터는 MEATOS의 가장 중요한 자산이다.

속도보다 정확도를 우선하며,
한 번 확정한 표준상품은 프로젝트 전체의 기준이 된다.
