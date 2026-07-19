# TASK_ORDER_009_OCR_REAL_WORLD_PIPELINE.md

Version: 1.0

## 목적
실제 거래명세서 사진으로 OCR→AI보정→Dictionary→Review→Learning 전체 파이프라인을 최초 검증한다.

## 구현 순서
1. 사진 업로드
2. 이미지 품질 분석
3. AI 전처리
 - 회전 보정
 - 원근 보정
 - 대비 향상
 - 노이즈 제거
 - 그림자 완화
4. OCR 수행
5. 원본/OCR JSON 저장
6. Dictionary 매칭
7. Confidence 계산
8. 자동승인 또는 Review Queue
9. Learning 저장

## 중요한 원칙
- 원본 이미지는 절대 수정하지 않는다.
- AI 보정 이미지는 별도로 생성한다.
- 원본, 보정본, OCR 결과를 모두 저장한다.
- 사용자 수정은 업체별 Learning으로 저장한다.
- 동일 패턴 반복 시 추천 점수를 높인다.
- Global Dictionary 반영은 PM 승인 후 진행한다.

## 테스트 대상
- 정상 거래명세서
- 기울어진 문서
- 그림자 문서
- 일부 훼손 문서
- 저해상도 문서
- 손가락 가림
- 공급사별 다양한 양식

## KPI
- OCR 정확도
- 상품명 매칭률
- 자동 승인율
- Review 비율
- Unknown 비율
- 평균 처리시간
- AI 보정 성공률

## 금지
- 원본 덮어쓰기
- Dictionary 자동 변경
- Review 없이 Global 변경

## 완료조건
- OCR 동작
- AI 보정 동작
- Dictionary 연결
- Review Queue 생성
- Learning 저장
- KPI 표시

## PM 메모
이번 Sprint는 정확도보다 재현 가능한 파이프라인 구축이 목표다.
실패 사례도 모두 학습 데이터로 축적한다.
