
# TASK_ORDER_011_FEEDBACK_PM_REVIEW.md

# PM Review - Secret / OCR UX Sprint

저장 위치:
C:\MEATOS\docs\08_SPRINT\TASK_ORDER_011_FEEDBACK_PM_REVIEW.md

---

## PM 총평

이번 작업은 방향이 매우 좋습니다.

특히 다음 항목은 운영 관점에서도 높은 평가를 받을 수 있습니다.

- Secret → Real Provider → Mock Fallback 구조
- OCR Provider Health Card
- Confidence HeatMap
- Failure Learning Log
- Secret을 브라우저에 노출하지 않는 구조

이 부분은 그대로 유지합니다.

---

# 개선 요청

## 1. Provider 상태를 더 직관적으로

현재

Secret 연결
Provider 상태
평균 응답시간
실패횟수

정도인데 운영자는 한눈에 보고 싶습니다.

다음 KPI Card 추가

- Provider : CLOVA / MOCK
- Secret : Connected / Missing
- Success Rate (24h)
- Average OCR Time
- Today's OCR Count
- Review Rate
- Failure Rate

---

## 2. Confidence HeatMap 개선

색만 표시하지 말고

95~100
→ 자동 승인 후보

80~94
→ 확인 권장

80 미만
→ Review 필수

로 표현합니다.

---

## 3. OCR 처리 단계 표시

사용자는 AI보다 진행상태를 알고 싶습니다.

권장 Flow

업로드
→ 품질 검사
→ OCR
→ 상품 분석
→ Dictionary
→ Review
→ 완료

현재 단계는 Highlight.

---

## 4. Failure Learning 시각화

추가 KPI

- 오늘 실패
- 가장 많이 실패한 공급사
- 가장 많이 수정된 품목
- 최근 학습된 Alias

---

## 5. Provider 비교 준비

현재는 CLOVA만 사용.

Provider 추상화는 유지합니다.

향후

- Azure
- Google
- Upstage
- Naver Template OCR

를 꽂을 수 있도록 인터페이스 변경 금지.

---

## 6. Secret 관리

추가 확인

- Secret Rotation 대응
- Secret 변경 감지
- Health Check 자동 재시도
- Secret 누락 시 관리자 경고

---

## 7. 운영 로그

OCR 호출마다 저장

- Provider
- Version
- Duration
- Confidence
- Cost(예정)
- Retry Count

---

# 다음 Sprint

1. 실제 CLOVA Secret 등록
2. 실거래명세서 100장 테스트
3. OCR 정확도 리포트
4. 공급사 Template 자동 학습
5. OCR Failure Dashboard

---

## PM 최종 의견

이제부터는 '기능 추가'보다
'실제 정육점 직원이 하루 수백 장의 거래명세서를 얼마나 편하게 처리하는가'를 기준으로 판단합니다.

MEATOS의 경쟁력은 OCR 자체가 아니라

'실패를 기억하고,
공급사별로 학습하며,
점점 사람보다 빠르고 정확해지는 운영 플랫폼'

이라는 점을 항상 유지하며 개발을 진행합니다.
