# MEATOS 복구 상태·계획 점검

작성: 2026-09-01 · 작성자: Claude (Cowork) 세션 기록 · 대상: `C:\MEATOS`, GitHub `smartpd-eco/meatos`, Vercel `meatos.vercel.app`, Google Drive 백업

---

## 0. 한 줄 요약

Google Drive 백업 과정에서 `.html`/`.md` 등이 `.docx`로 변환돼 로컬 작업본이 깨졌고, 이를 복구하려 실행한 `git restore .`가 **커밋되지 않은 최신 작업 일부를 옛 git 버전으로 되돌렸다.** 원본은 소실되지 않았으며(Drive + 라이브 사이트 + 세션 보관분), 우선순위 **Live → GitHub → Drive** 로 파일별 회수해 최신 상태로 재구성한다. **POS 규격외 수집 수정분을 먼저 안전하게 반영**(설치본 재빌드→매장 재설치)한 뒤 나머지를 복구한다.

---

## 1. 각 소스 상태

| 소스 | 상태 | 비고 |
|---|---|---|
| **라이브(Vercel, meatos.vercel.app)** | 정상 운영 중 | 배포된 파일의 **기준(1순위)**. 페이지 15종만 존재(아래 미배포 페이지는 404). `/downloads/POS-Setup.exe`도 404 = 설치본 미배포 |
| **GitHub(smartpd-eco/meatos, main=f09171f)** | 손상 아님, 그러나 **뒤처짐** | 2026-08-02 이후 커밋 이력 사실상 없음. 일부 파일이 라이브/작업본과 불일치 |
| **Google Drive 백업** | `.js`/`.json`/`.sql`/`.cs`는 원본 보존, `.html`/`.md`/`.log`는 `.docx`(렌더 텍스트만) | 커밋 안 된 최신 작업의 유일 사본. **지우거나 재동기화(재변환) 금지** |
| **로컬(C:\MEATOS)** | `git restore .`로 다수 파일이 옛 git 버전으로 되돌아간 혼재 상태 | 작업 기준으로 삼지 말 것 |

핵심: 세 소스가 **서로 다른 시점의 스냅샷**이라 어느 하나가 전부 최신이 아니다. 예) `styles.css` 라이브≈Drive≠git, `header.js` 라이브≈git≠Drive.

---

## 2. 지침 문서 검수 결과 (중요)

- **`MEATOS_LLM_OCR_HANDOFF_2026-08-06`**: *"2026-08-02 이후 변경을 구분할 git 커밋 이력이 없다. `git reset`·`git checkout --`·대량삭제 복구는 다른 변경까지 손실시키므로 금지."* → git이 최신 기준이 아니며, 이번에 실행한 `git restore .`가 바로 이 금지 작업이었다(원인).
- **배포 제외 규칙(문서화됨)**: `invoice-result-stabilizer.js` 및 레거시 OCR 런타임(PaddleOCR/Tesseract/EasyOCR)은 **Production 빌드에서 의도적으로 제외**. → 되돌려진 옛 `build-vercel-static.mjs`(레거시 OCR 포함, `downloads/` 미복사)는 **틀렸고**, 제외를 구현한 최신본이 맞다.
- **POS 현장 설치본 = "현장 검증(shadow) 모드" 고정**(`FIELD_SALES_TEST_RUNBOOK`): 매출·재고 미변경, 관찰만. → 이번 POS 규격외 수집 수정이 이 지침과 정확히 일치.
- **진행 상황**: 매입(거래명세서 OCR, Gemini flash-lite) = 완료·운영 중. 매출(POS) = 현장 검증 단계. POS 데이터가 안 올라오던 문제를 계속 수정 중이었음.
- **AGENTS.md §4·§16**: Claude/Codex는 이 프로젝트에서 `git add/commit/push`·실제 배포를 **직접 실행하지 않고 명령어만 제공**. 실제 실행은 사용자가 수행.

---

## 3. `git restore .`로 되돌려진 파일 (회수 필요 목록)

수정시각 기준(되돌려진 파일 = 방금 시각). 로직 대부분(app.js, 대부분의 src/data, supabase 함수, agent .cs)은 **온전(NEW)**.

**루트**: 15개 `.html`(+trace_print_preview) · 6개 `.md` · `header.js` · `runtime-config.js` · `styles.css` · `sw.js` · `package.json` · `vercel.json` · `.vercelignore`
**scripts/**: `build-vercel-static.mjs` · `apply-supabase-migrations.mjs` · `validate-static.mjs`
**src/data/**: `ocr-image-pipeline.js` · `ocr-image-preprocessor.js` · `ocr-intake-policy.js` · `tenant-repository-helper.js`

세션 보관 최신본(즉시 복원 가능): `package.json`, `build-vercel-static.mjs`, `apply-supabase-migrations.mjs`, `vercel.json`, `.vercelignore`.

**미배포 WIP 페이지**(git·라이브에 없음, `.docx`에 텍스트만): `delivery-sales`, `delivery-connect`, `account-link`, `settlement`, `safety-stock`, `auto-order`, `fresh-stock-settings` → 매출/POS 진행 중 작업. HTML 구조 재작성 필요(별도 항목).

---

## 4. POS 규격외 수집 수정 — 현재 상태

- ✅ **DB 함수 `capture_pos_sale_observation_agent` 교체** — Supabase(pkrsiqjzllyiafwpskll)에 SQL Editor로 적용 완료(라이브). 규격외 코드 원본 수집 + 매핑 스캔 항상 OBSERVED.
- ✅ **`agent/windows/MeatosPosAgent.cs` 필터 완화** — 커밋됨(현재 디스크 20,900B = 수정본). 서버 규격(`^[0-9A-Za-z._-]{6,64}$`)에 맞춰 규격외 코드도 전송.
- ⏳ **설치본 재빌드 → 매장 재설치** — 남음. 설치본은 사이트가 아니라 로컬 빌드로 매장 PC에 설치(현재 라이브에 설치본 미배포). `npm run pos:build` 필요(=`package.json`의 `pos:build` 스크립트, 이번에 복원).

---

## 5. 복구 절차 (우선순위: Live → GitHub → Drive)

1. **[우선] POS 수정분 반영**: `package.json` 복원(완료) → 사용자 `npm run pos:build` → `downloads\MEATOS-POS-Setup.exe` 생성 → 매장 PC 재설치 → 현장 검증 스캔으로 확인.
2. **배포 파일 = 라이브 기준 회수**: 실제 서빙되는 15개 페이지 + `header.js`·`styles.css`·`runtime-config.js`·`sw.js`·`manifest`·배포된 `src/data/*` 를 라이브 원본으로 확정(읽기 전용, 안전).
3. **미배포 파일**: 되돌려진 소수는 세션 보관 최신본/Drive로 복원.
4. **미배포 WIP 페이지**: `.docx` 텍스트 참고해 구조 재작성(진행 중 작업 이어서).
5. **git 정합화**: 위 결과를 사용자가 직접 커밋/푸시(Claude는 명령어만 제공). 이후 정기 커밋, **저장소를 Drive 동기화 폴더 밖으로 이전** 권장.

---

## 6. 재발 방지

- 작업 저장소를 **Google Drive 동기화 폴더에 두지 않는다**(HTML/MD가 .docx로 변환됨).
- 커밋을 자주 한다(미커밋 작업이 유일본이 되지 않게).
- 복구 시 `git restore .`/`git checkout -- .`/`git reset` **전면 실행 금지**(지침 명시). 파일 단위로만.
