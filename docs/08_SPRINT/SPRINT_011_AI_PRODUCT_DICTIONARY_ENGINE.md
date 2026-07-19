# Sprint 011
# AI Product Dictionary Engine
Version 1.0
PM : Peter
Status : READY

---

# 목표

OCR이 읽은 모든 상품명을

AI가

"표준 축산물"

로 자동 변환하는 핵심 엔진을 구축한다.

이번 Sprint부터는
MEATOS의 핵심 경쟁력이 시작된다.

---

# 이번 Sprint 완료 목표

□ OCR 원본 상품명 저장

↓

□ Product Dictionary 검색

↓

□ Alias 검색

↓

□ AI Similarity 계산

↓

□ Confidence 계산

↓

□ 자동 승인 또는 Review Queue

↓

□ Product Master 연결

---

# 처리 Flow

거래명세서

↓

OCR

↓

"한우등심1+"

↓

Dictionary Search

↓

Alias Search

↓

Similarity Engine

↓

Confidence

↓

95 이상
자동 승인

70~94
Review Queue

70 미만
Unknown 등록

---

# 신규 Table

ocr_product_candidate

----------------------------

id

ocr_document_id

raw_name

normalized_name

dictionary_id

confidence

status

approved_by

approved_at

created_at

---

# Dictionary Search 우선순위

1.

완전일치

예)

한우등심

↓

한우등심

100%

----------------------------

2.

Alias

예)

한우등심1+

↓

한우등심

98%

----------------------------

3.

공백 제거

예)

한우 등 심

↓

한우등심

96%

----------------------------

4.

특수문자 제거

예)

한우등심(1+)

↓

한우등심

95%

----------------------------

5.

부분일치

예)

등심

↓

한우등심

87%

----------------------------

6.

AI Similarity

Embedding

Vector Search

LLM

추천

---

# Confidence 기준

95~100

자동 승인

--------------------

80~94

Review 추천

--------------------

60~79

사용자 선택

--------------------

60 미만

Unknown

---

# Unknown 등록

Unknown은

절대 삭제하지 않는다.

모든 Unknown은

AI 학습 데이터이다.

---

# Learning

사용자가

미전지

↓

앞다리살

승인

↓

Dictionary Learning

↓

Alias 자동 생성

↓

다음부터 자동 처리

---

# Dashboard 추가

오늘 OCR

자동 승인

Review

Unknown

Dictionary 증가

AI 정확도

평균 Confidence

---

# KPI

자동 승인율

95%

Review

5%

Unknown

3% 이하

Dictionary

10만건 대응

---

# 이번 Sprint 완료 조건

□ OCR → Dictionary 연결 완료

□ Confidence 계산 완료

□ Unknown 등록 완료

□ Review Queue 연결 완료

□ Product Master 연결 완료

□ Dashboard KPI 반영

---

# PM 의견

이번 Sprint는

MEATOS의 시작이다.

OCR은 읽기만 한다.

Dictionary는 생각한다.

AI는 학습한다.

이 세 개가 연결되는 순간

MEATOS는 단순 ERP가 아니라

국내 최초

축산물 AI 표준화 플랫폼으로 진화한다.