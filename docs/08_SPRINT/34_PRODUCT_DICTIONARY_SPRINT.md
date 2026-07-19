
# 34_PRODUCT_DICTIONARY_SPRINT.md
# MEATOS Sprint 002.5
## Product Dictionary Construction

Version: 1.0
Status: Approved
Date: 2026-07-11

---

# Sprint 목적

이번 Sprint의 핵심은 기능 추가가 아니다.

MEATOS의 핵심 자산인 Product Dictionary를 구축할 수 있는
기반을 완성하는 것이다.

---

# 역할

## PM (영덕)

- 실제 거래처 데이터 확보
- 거래명세서 검증
- 현장 용어 확인
- 최종 Review 승인

---

## Peter

- 국가 표준 조사
- 공공기관 기준 정리
- Product Dictionary 기준 유지
- Sprint 범위 관리

---

## Codex

- Dictionary DB
- Dictionary CRUD
- Dictionary Search
- Dictionary Review 연결
- Alias 연결

새로운 기능 추가 금지

---

# Product Dictionary 구성

필수 항목

- Standard Product ID
- 표준상품명
- 축종
- 대분류
- 소분류
- 부위
- 가공형태
- 원산지
- 보관방법
- 단위
- Alias 개수
- Confidence
- Source Count

---

# 완료 기준

□ Dictionary 생성 가능

□ 검색 가능

□ Alias 연결

□ Review 연결

□ Product Master 연결

---

# 구현 제외

- OCR 고도화
- POS Adapter
- 발주 추천
- AI 자동 발주
- Dashboard

---

# Sprint 종료 산출물

1. Dictionary Table
2. CRUD 화면
3. 검색
4. Review 연동
5. 테스트 결과
6. 다음 Sprint 제안

---

# PM Message

Product Dictionary는
MEATOS의 백과사전이다.

기능은 나중에도 만들 수 있지만
좋은 Dictionary는 시간이 쌓여야 만들어진다.

이번 Sprint는
가장 중요한 자산을 만드는 단계이다.

---

# PM Note

오늘부터 Product Dictionary 구축을
독립 Sprint로 관리한다.

앞으로 모든 기능은
Dictionary를 중심으로 연결된다.
