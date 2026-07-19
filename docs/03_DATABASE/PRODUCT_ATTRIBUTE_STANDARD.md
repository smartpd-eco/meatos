
# PRODUCT_ATTRIBUTE_STANDARD.md
# MEATOS Product Attribute Standard

Version: 1.0
Status: Active
Sprint: 001
Last Update: 2026-07-10

---

# 목적

Product Master는 상품명이 아니라
상품의 속성(Attribute)을 관리하는 것을 원칙으로 한다.

Alias, OCR, POS는 모두 Attribute를 찾기 위한 도구이다.

---

# Attribute 우선순위

1. 축종 (Species)

- 돼지
- 한우
- 육우
- 수입소
- 닭
- 오리

↓

2. 대분류(Category)

- 원육
- 부산물
- 가공육

↓

3. 부위(Part)

예)

- 삼겹
- 목심
- 앞다리
- 갈비
- 안심
- 등심

↓

4. 가공형태

- 원육
- 슬라이스
- 덩어리
- 정형
- 세절

↓

5. 미박/무박

- 미박
- 무박

↓

6. Bone

- 유골
- 무골

↓

7. 보관

- 냉장
- 냉동

↓

8. 원산지

- 국내산
- 한우
- 미국
- 캐나다
- 스페인
- 기타

↓

9. 등급

예)

1++
1+
1
2

↓

10. 단위

kg
EA
Box
Pack

---

# Product 생성 원칙

표준상품은

Attribute 조합으로 생성한다.

예)

국내산
+
돼지
+
앞다리
+
미박
+
냉장

↓

국내산 냉장 미박 앞다리살

---

# Alias 처리

예)

원본

- 미전지
- 앞다리미박
- 미박앞다리

↓

Attribute 분석

↓

표준상품 연결

원본 문자열은 저장하고
표준상품은 변경하지 않는다.

---

# 구현 원칙

- 상품명보다 Attribute를 우선한다.
- Attribute는 Enum 형태로 관리한다.
- 하드코딩을 최소화한다.
- 신규 Attribute는 확장 가능해야 한다.

---

# Codex Action

Sprint001에서는

- Attribute Table 생성
- Attribute CRUD
- Product 연결
- 검색 지원

까지만 구현한다.

AI 추천 기능은 구현하지 않는다.

---

# PM Note

2026-07-10

오늘 Product Engine의 핵심 기준을 확정하였다.

상품명은 바뀔 수 있지만
상품의 속성(Attribute)은 표준화할 수 있다.

MEATOS는 상품명이 아니라
Attribute를 중심으로 성장한다.

> 좋은 Product Engine은 이름이 아니라 속성을 이해한다.
