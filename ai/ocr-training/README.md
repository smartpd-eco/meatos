# MEATOS OCR Training Data

범용 거래명세서 OCR의 정확도와 처리시간을 개선하기 위한 자체 데이터 계층이다.

## 데이터 등급

- `research_only`: 공개 검색 결과. 구조 조사만 허용하고 학습·재배포 금지.
- `approved_real`: 제공자 동의와 사용권이 확인된 실문서. 원본과 정답을 분리 보관.
- `synthetic_owned`: MEATOS가 자체 생성한 문서와 훼손 변형. 학습·평가 가능.

## 실행

```bash
node scripts/generate-ocr-synthetic-dataset.mjs
node scripts/validate-ocr-training-dataset.mjs
```

## 품질 원칙

1. 사업자번호, 전화번호, 주소 등 개인정보가 포함된 인터넷 이미지는 다운로드하지 않는다.
2. 검색 자료는 열 구성과 레이아웃 패턴만 기록한다.
3. 학습 가능한 데이터는 권리 상태가 `APPROVED`인 자료만 사용한다.
4. 숫자 정답은 문자열과 숫자형을 함께 보존한다.
5. 원본, 변형본, 정답 JSON은 서로 덮어쓰지 않는다.
6. 신규 양식 평가는 학습에 사용하지 않은 `unseen_layout` 세트에서 수행한다.

## 평가 지표

- 상품명 CER
- 숫자 Exact Match
- 이력번호 Exact Match
- 행·열 복원율
- 산술 검산 성공률
- 잘못된 자동확정 건수
- 전체 처리시간과 Provider별 처리시간

