#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent()
; =====================================================================
; MEATOS 스캔 캡처 에이전트 (AutoHotkey v2)
; 원리: 계산대 바코드 스캐너는 '키보드'처럼 입력된다. 이 입력을 (가로채지 않고)
;       읽어서, 매장 내부 바코드(13자리, '2' 시작)만 골라 MEATOS 서버로 전송.
;       서버가 자동으로 품목 매칭 → 재고 OUT + 매출 기록.
; 특징: POS 입력을 '차단하지 않음(V 옵션)' → POS 계산은 100% 정상 동작(무침습).
; 설치: AutoHotkey v2 설치 후 이 파일 실행. (또는 .exe 로 컴파일해 시작프로그램 등록)
; =====================================================================

; ---------- 설정 (매장별로 수정) ----------
global SUPA_URL := "https://pkrsiqjzllyiafwpskll.supabase.co/rest/v1/scan_event"
global ANON_KEY := "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh"
global TENANT_ID := "881f6cc1-b552-468c-b9b4-152edb464e61"
global DEVICE := "POS01"
global DEBOUNCE_MS := 2000            ; 같은 바코드 재전송 방지(ms)
; ------------------------------------------

global lastCode := "", lastTick := 0
global logCount := 0

TrayTip("MEATOS 스캔 에이전트 실행 중", "계산대 스캔을 감지합니다", 1)
A_IconTip := "MEATOS 스캔 에이전트 (실행 중)"

; 바코드 = 빠르게 입력되고 Enter 로 끝나는 문자열.
; InputHook("V") : Visible = 입력을 가로채지 않고 통과시킨다(POS 정상).
Loop {
    ih := InputHook("V", "{Enter}{Return}`n`r")   ; Enter 계열에서 종료
    ih.Start()
    ih.Wait()
    code := ih.Input
    ProcessScan(code)
}

ProcessScan(code) {
    global lastCode, lastTick, DEBOUNCE_MS
    code := Trim(code)
    ; 매장 내부 바코드만: 13자리 숫자, '2' 시작 (예: 2090120232502)
    if !RegExMatch(code, "^2\d{12}$")
        return
    now := A_TickCount
    if (code = lastCode && (now - lastTick) < DEBOUNCE_MS)
        return
    lastCode := code, lastTick := now
    SendToServer(code)
}

SendToServer(code) {
    global SUPA_URL, ANON_KEY, TENANT_ID, DEVICE, logCount
    body := '{"tenant_id":"' TENANT_ID '","barcode":"' code '","device":"' DEVICE '"}'
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("POST", SUPA_URL, false)             ; 동기 전송(간단·안정)
        req.SetRequestHeader("apikey", ANON_KEY)
        req.SetRequestHeader("Authorization", "Bearer " ANON_KEY)
        req.SetRequestHeader("Content-Type", "application/json")
        req.SetRequestHeader("Prefer", "return=minimal")
        req.Option[6] := false                         ; 리다이렉트 비활성
        req.Send(body)
        logCount += 1
        A_IconTip := "MEATOS 스캔 에이전트 · 오늘 전송 " logCount "건"
        TrayTip("스캔 전송", code, 1)
    } catch as e {
        TrayTip("전송 실패(네트워크)", code, 3)
    }
}

; 트레이 우클릭 메뉴
A_TrayMenu.Delete()
A_TrayMenu.Add("MEATOS 스캔 에이전트", (*) => TrayTip("실행 중", "계산대 스캔 감지 중", 1))
A_TrayMenu.Add()
A_TrayMenu.Add("종료", (*) => ExitApp())
