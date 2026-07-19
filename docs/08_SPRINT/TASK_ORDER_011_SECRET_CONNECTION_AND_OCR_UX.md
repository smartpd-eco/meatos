# TASK_ORDER_011_SECRET_CONNECTION_AND_OCR_UX.md

# MEATOS Sprint 11
## Secret 연결 + OCR UX 개선

**저장 위치**
`C:\MEATOS\docs\08_SPRINT\TASK_ORDER_011_SECRET_CONNECTION_AND_OCR_UX.md`

---

# 목표

이번 Sprint의 목적은 기능을 추가하는 것이 아니라 **실제 운영 품질**을 만드는 것이다.

핵심 과제

1. CLOVA Secret 연결 완료
2. Edge Function 운영 연결
3. OCR Confidence UI 구현
4. 자연스러운 UX 구성
5. Mock → Real 자동 전환 검증

---

# 1. Secret 연결

## 완료 조건

Frontend
→ Supabase Edge Function
→ Supabase Secret
→ CLOVA OCR
→ JSON
→ Parser
→ Dictionary
→ Review

### 규칙

- Secret은 브라우저에 절대 노출 금지
- Git Commit 금지
- console.log 출력 금지
- Edge Function에서만 사용

---

# 2. OCR 상태 카드

사용자가 AI를 의식하지 않도록 단순하게 표현한다.

상태 예시

🟢 문서 품질 우수

🟡 일부 확인 필요

🔴 검토 필요

---

# 3. Confidence HeatMap

필드별 신뢰도를 색상으로 표시

95~100 : 녹색

80~94 : 노랑

79 이하 : 빨강

예시

공급사명   🟢 98%

품목명     🟡 87%

수량       🟢 100%

단가       🟢 99%

금액       🟢 98%

합계       🟢 100%

---

# 4. 자연스러운 UX

금지

"AI가 추정했습니다."

권장

"확인이 필요한 항목"

"자동 인식 완료"

"검토 권장"

사용자는 AI보다 업무에 집중하도록 설계한다.

---

# 5. Secret Health Check

대시보드

- Secret 연결
- OCR Provider 상태
- 평균 응답시간
- 마지막 호출시간
- 실패 횟수

---

# 6. Mock 자동 전환

Secret 미존재

→ Mock Provider

Secret 존재

→ CLOVA Provider

UI는 동일하게 유지한다.

---

# 7. 테스트

- Secret 정상
- Secret 누락
- API Timeout
- 401/403 처리
- 이미지 업로드
- OCR 결과 저장
- Failure Learning 연결
- Review Queue 연결

---

# PM 피드백

현재 DB와 파이프라인은 충분히 안정적이다.

이번 Sprint부터는 '개발자 관점'이 아니라
'현장 정육점 직원이 사용하기 쉬운 제품'을 만드는 데 집중한다.

형태보다 경험(UX)을 우선하며,
AI는 뒤에서 조용히 동작하고 사용자는 자연스럽게 결과만 활용하는 것이 목표이다.
