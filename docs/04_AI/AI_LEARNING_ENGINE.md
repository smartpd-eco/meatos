# AI_LEARNING_ENGINE.md
# MEATOS AI Learning Engine

**Version**: 1.0
**Status**: Active
**Sprint**: 002 Preparation
**Last Update**: 2026-07-11

---

# 목적

MEATOS의 AI는 단순 OCR 시스템이 아니다.

사람이 최종 확정한 상품 정보를 기억하고,
다음부터 자동으로 추천하는 Learning Engine을 구축한다.

원본 데이터는 절대 수정하지 않는다.

---

# 개발 철학

- 원본은 자산이다.
- AI는 사람이 확정한 결과만 학습한다.
- AI는 추측하지 않는다.
- 확신이 없는 경우 반드시 Review Queue로 보낸다.

---

# 처리 흐름

거래명세서
↓
OCR
↓
원본 상품명
↓
AI 추천
↓
사용자 확인
↓
표준상품 확정
↓
Learning DB 저장
↓
다음부터 자동 추천

---

# Learning 단계

## Level 1
- 신규 상품
- Review Queue

## Level 2
- 동일 결과 3회
- 추천 시작

## Level 3
- 동일 결과 10회
- 자동 추천

## Level 4
- 동일 결과 30회 이상
- 높은 신뢰도

## Level 5
- 다수 거래처 동일
- 전국 표준 Alias 후보

---

# 거래처별 Learning

같은 상품명이라도 거래처마다 의미가 다를 수 있다.

예)

좋은축산
미전지 → 미박앞다리

A축산
미전지 → 전지(미박)

거래처별 학습과
전체 학습은 분리하여 관리한다.

---

# Learning Table

- learning_id
- supplier_id
- original_name
- product_master_id
- confidence
- learning_count
- auto_apply
- last_used_at
- created_at

---

# Confidence 정책

- 0~60 : Review
- 61~89 : 추천
- 90~100 : 자동 적용(사용자 설정 가능)

---

# 절대 원칙

- 원본 데이터 수정 금지
- 사람이 확정한 결과만 학습
- Product Master 자동 생성 금지
- Review Queue 유지
- 변경 이력 100% 저장

---

# Sprint 002 구현 범위

- Learning Table
- Learning Service
- Learning History

AI 모델 고도화는 다음 Sprint에서 진행한다.

---

# PM Message

우리는 AI가 사람을 대신 판단하는 시스템이 아니라,
사람의 경험을 기억하여 반복 작업을 줄여주는 시스템을 만든다.

시간이 지날수록 Learning Database가
MEATOS의 핵심 경쟁력이 된다.

---

# PM Note

2026-07-11

Learning Engine은 OCR보다 중요한 핵심 자산이다.

OCR는 입력,
Learning은 성장이다.
