# GOOD_CHUKSAN_EXCEL_DATA_SPEC.md
# 좋은축산 실데이터 DB 반영 기준서

**Version**: 1.0  
**Author**: SmartPD / Peter  
**Target**: Codex / QA·Data Agent  
**Status**: Ready  
**Source File**: `축산분류(1).xlsx`  
**Source Sheet**: `Sheet1`  
**Source Printed Date**: `2026-07-07`  
**Last Update**: `2026-07-10`

---

# 1. 목적

좋은축산에서 제공한 실제 상품 스프레드시트 1,615건을 MEATOS의 첫 번째 실데이터 Seed로 적재한다.

이번 단계의 목표는 원본 데이터를 곧바로 표준상품으로 확정하는 것이 아니다.

```text
원본 보존
→ DB 적재
→ 속성 후보 추출
→ 중복·오류 점검
→ 사람 검토
→ Product Master / Alias 확정
```

표준상품과 Alias는 검토 후 생성한다.

---

# 2. 원본 데이터 현황

## 기본 규모

- 실제 상품 행: **1,615건**
- 상품코드 중복: **0건**
- 동일 상품명 중복 그룹: **17개**
- 원본 컬럼: **20개**
- 단위1: 전체 `Box`
- 원본 분류 출력일자: `2026-07-07`

## 단위2 기준 구성

| 구분 | 건수 |
|---|---:|
| 국내산돈육 | 1,314 |
| 국내산우육 | 155 |
| 수입산우육 | 92 |
| 수입산돈육 | 42 |
| 기타 | 12 |

## 상품명 기준 보관상태

| 구분 | 건수 |
|---|---:|
| 냉장 | 989 |
| 냉동 | 556 |
| 미표기 | 70 |

## 1차 축종 후보

| 구분 | 건수 |
|---|---:|
| 돼지 | 1,357 |
| 소 | 247 |
| 닭 | 1 |
| 기타/미분류 | 10 |

위 축종 수치는 `단위2 + 상품명 키워드`를 이용한 1차 후보이며, 표준 확정값이 아니다.

---

# 3. Excel 원본 컬럼

| Excel | 원본명 | DB 컬럼 | 처리 |
|---|---|---|---|
| A | 상품코드 | `source_product_code` | 원본 고유코드 |
| B | 상품명 | `source_product_name` | 반드시 원문 보존 |
| C | 원산지 | `origin_raw` | 정규화 전 원문 |
| D | 등급 | `grade_raw` | 정규화 전 원문 |
| E | 단위1 | `unit1_raw` | 현재 전부 Box |
| F | 단위2 | `unit2_raw` | 축종·국내/수입 후보 |
| G | 매입단가 | `purchase_price` | 숫자형 |
| H | 매출단가 | `sales_price` | 숫자형 |
| I | 대분류 | `major_category_code` | 전 행 공란 |
| J | 분류명 | `major_category_name` | 전 행 공란 |
| K | 중분류 | `middle_category_code` | 전 행 공란 |
| L | 분류명 | `middle_category_name` | 전 행 공란 |
| M | 소분류 | `minor_category_code` | 전 행 공란 |
| N | 분류명 | `minor_category_name` | 전 행 공란 |
| O | 상품분류 | `product_class_code` | 대부분 공란 |
| P | 상품분류명 | `product_class_name` | 대부분 공란 |
| Q | 부위 | `cut_code` | 267건 공란 |
| R | 부위명 | `cut_name` | 1,592건 공란 |
| S | 수입구분 | `import_type_code` | 전 행 존재 |
| T | 수입구분명 | `import_type_name` | 전 행 공란 |

---

# 4. 수입구분 코드 해석

원본 데이터의 `수입구분(S)`과 `단위2(F)`의 분포를 기준으로 다음처럼 관리한다.

| 코드 | 원본 단위2 | 건수 |
|---|---|---:|
| 1 | 국내산우육 | 155 |
| 2 | 국내산돈육 | 1,314 |
| 3 | 수입산우육 | 92 |
| 4 | 수입산돈육 | 42 |
| 5 | 기타 | 12 |

이 매핑은 좋은축산 원본 기준이다. 다른 공급처 파일에 그대로 적용하지 않는다.

---

# 5. 데이터 품질 이슈

## 원산지 표기 불일치

예시:

- `미국산` / `미국`
- `호주산` / `호주`
- `칠레산` / `칠레` / `칠래산`
- `국내산` / `국내산'`
- `국내산(냉동)`

원본값은 보존하고, 별도 정규화 값으로 관리한다.

## 등급 표기 불일치

예시:

- `1+`
- `+1`
- `1++`
- `1`
- `1급`
- `CH` / `ch`
- `PR`, `CAB`, `S`, `GF`, `SBA`, `AAA`

등급은 축종·수입 브랜드 체계별 의미가 다를 수 있으므로 일괄 병합하지 않는다.

## 상품명 중복

동일 상품명이 서로 다른 상품코드로 존재하는 사례가 있다.

예시:

- `냉동 꼬리(한우/거세)` 3건
- `냉동 차돌(육우/거세)` 3건
- `냉장 양지(한우/거세)` 2건
- `냉장 미박삼겹(드림)` 2건

상품명 중복만으로 삭제하거나 병합하지 않는다. 가격·상품코드·속성 차이를 검토한다.

## 비상품 행

상품 목록 후반에 아래 항목이 포함되어 있다.

- 작업비
- 운송비
- 부가세

이는 재고상품이 아니라 비용/서비스 항목이므로 Product Master 생성 시 별도 분류가 필요하다.

---

# 6. DB 구성

제공 SQL 파일:

```text
GOOD_CHUKSAN_SEED_DB.sql
```

구성 테이블:

1. `suppliers`
2. `product_import_batches`
3. `product_source_rows`
4. `product_master`
5. `product_alias`
6. `product_mapping_review`

## 핵심 원칙

- Excel 1,615건은 우선 `product_source_rows`에 원본 그대로 적재한다.
- `product_master`는 자동 생성하지 않는다.
- `product_alias`도 자동 확정하지 않는다.
- 애매한 항목은 `product_mapping_review`로 보낸다.
- 원본 상품명과 원본 상품코드는 절대 변경하지 않는다.

---

# 7. 1차 자동 분석 범위

자동으로 생성 가능한 값:

- `normalized_name`
- `inferred_species`
- `inferred_storage_type`
- 공급처
- 원본 파일·행 번호
- 검토 상태

자동으로 확정하면 안 되는 값:

- 표준상품
- 부위
- 미박/무박
- 유골/무골
- 가공단계
- 브랜드
- 등급 통합값
- Alias

예:

```text
전지 ≠ 미전지
앞다리살 ≠ 미박 앞다리살
냉장 ≠ 냉동
```

---

# 8. Codex 실행 지시

## 1단계

`GOOD_CHUKSAN_SEED_DB.sql`의 스키마와 Seed 구조를 현재 프로젝트 DB 기술스택에 맞게 검토한다.

## 2단계

원본 Excel을 수정하지 않고 1,615행을 `product_source_rows`에 적재한다.

## 3단계

Product Master 관리 UI에서 다음을 제공한다.

- 원본 상품 조회
- 상품명 검색
- 단위2 필터
- 원산지 필터
- 냉장/냉동 필터
- 매핑 상태 필터
- 표준상품 후보 선택
- Review 처리

## 4단계

다음 항목은 구현하지 않는다.

- AI 자동 확정
- Alias Memory 자동 학습
- OCR 연동
- 재고 반영
- POS 연동

---

# 9. 완료 기준

- 1,615건 원본 적재 확인
- 상품코드 누락 0건
- 원본 상품명 보존
- 공급처 `좋은축산` 연결
- 검색 및 필터 가능
- 표준상품 미확정 건은 `pending_review`
- 중복 상품명 목록 확인 가능
- 작업비·운송비·부가세를 별도 검토 가능
- DB 삭제·초기화 없이 검증 완료

Git Commit / Push 및 실제 Supabase 적용은 사용자 승인 후 진행한다.

---

# 10. 파일 위치

```text
C:\MEATOS\docs\03_DATABASE\GOOD_CHUKSAN_EXCEL_DATA_SPEC.md
C:\MEATOS\database\GOOD_CHUKSAN_SEED_DB.sql
```

---

# PM Note

이번 데이터는 MEATOS의 첫 번째 실제 유통 Seed Data다.

많이 자동화하는 것보다 원본을 안전하게 보존하고,
사람이 확인한 표준상품을 하나씩 축적하는 것을 우선한다.
