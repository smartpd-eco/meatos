#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent()
; =====================================================================
; MEATOS POS scan agent template.
; Use connect.html to download a store-bound copy containing AGENT_KEY.
; The agent never logs the key and only records scan/result diagnostics.
; =====================================================================

global RPC_URL := "https://pkrsiqjzllyiafwpskll.supabase.co/rest/v1/rpc/process_pos_sale_event"
global ANON_KEY := "sb_publishable_BuLdLube8Tfkf7hEhFESWg_6tSLGBLh"
global AGENT_KEY := "DOWNLOAD_FROM_CONNECT_PAGE"
global DEVICE := "POS01"
global DEBOUNCE_MS := 2000
global MAX_SCAN_MS := 1200
global lastCode := "", lastTick := 0, logCount := 0, scanStartTick := 0
global LOG_DIR := A_AppData "\MEATOS\logs"
global LOG_FILE := LOG_DIR "\pos-agent.log"

DirCreate(LOG_DIR)
Log("AGENT_STARTED device=" DEVICE)
TrayTip("MEATOS 스캔 에이전트 실행 중", "계산대 스캔을 감지합니다", 1)
A_IconTip := "MEATOS 스캔 에이전트 (실행 중)"

Loop {
    scanStartTick := 0
    ih := InputHook("V", "{Enter}{Tab}")
    ih.OnChar := ScanChar
    ih.Start()
    ih.Wait()
    ProcessScan(ih.Input, ih.EndKey)
}

ScanChar(ih, char) {
    global scanStartTick
    if (scanStartTick = 0)
        scanStartTick := A_TickCount
}

ProcessScan(code, endKey) {
    global lastCode, lastTick, DEBOUNCE_MS, MAX_SCAN_MS, scanStartTick
    code := Trim(code)
    elapsed := scanStartTick ? A_TickCount - scanStartTick : 999999
    if !RegExMatch(code, "^[0-9A-Za-z._-]{6,64}$") || elapsed > MAX_SCAN_MS
        return
    now := A_TickCount
    if (code = lastCode && (now - lastTick) < DEBOUNCE_MS)
        return
    lastCode := code, lastTick := now
    Log("BARCODE_DETECTED code=" code " endKey=" endKey " elapsedMs=" elapsed)
    SendToServer(code)
}

SendToServer(code) {
    global RPC_URL, ANON_KEY, AGENT_KEY, DEVICE, logCount
    if (AGENT_KEY = "DOWNLOAD_FROM_CONNECT_PAGE") {
        Log("SEND_FAILED code=" code " status=CONFIG_ERROR reason=AGENT_KEY_REQUIRED")
        TrayTip("연동 설정 필요", "정육비서 자동 판매연동에서 다시 다운로드하세요", 3)
        return
    }

    soldAt := FormatTime(A_NowUTC, "yyyy-MM-ddTHH:mm:ssZ")
    txId := DEVICE "-" FormatTime(A_NowUTC, "yyyyMMddHHmmss") "-" A_TickCount "-" code
    body := "{""p_agent_token"":""" . AGENT_KEY . """,""p_barcode"":""" . code . """,""p_quantity"":null,""p_sale_amount"":null,""p_sold_at"":""" . soldAt . """,""p_external_transaction_id"":""" . txId . """,""p_device"":""" . DEVICE . """}"
    try {
        Log("SEND_STARTED code=" code " transaction=" txId)
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("POST", RPC_URL, false)
        req.SetTimeouts(5000, 5000, 10000, 15000)
        req.SetRequestHeader("apikey", ANON_KEY)
        req.SetRequestHeader("Authorization", "Bearer " ANON_KEY)
        req.SetRequestHeader("Content-Type", "application/json")
        req.Send(body)
        status := req.Status
        response := req.ResponseText
        if (status >= 200 && status < 300 && InStr(response, """ok"":true")) {
            logCount += 1
            A_IconTip := "MEATOS 스캔 에이전트 · 오늘 " logCount "건"
            Log("SEND_SUCCEEDED code=" code " status=" status " transaction=" txId)
            TrayTip("판매 반영 완료", code, 1)
        } else {
            reason := FailureReason(response)
            Log("SEND_FAILED code=" code " status=" status " reason=" reason " transaction=" txId)
            TrayTip("판매 반영 실패", reason, 3)
        }
    } catch as e {
        Log("SEND_FAILED code=" code " status=NETWORK_ERROR reason=" e.Message)
        TrayTip("전송 실패(네트워크)", code, 3)
    }
}

FailureReason(response) {
    if InStr(response, "AGENT_NOT_AUTHENTICATED")
        return "연동 인증 오류"
    if InStr(response, "STORE_NOT_FOUND")
        return "매장 연결 오류"
    if InStr(response, "BARCODE_NOT_MAPPED")
        return "미등록 바코드"
    if InStr(response, "INSUFFICIENT_STOCK")
        return "재고 부족"
    if InStr(response, "DUPLICATE_EVENT")
        return "중복 거래"
    if InStr(response, "SALE_VALUE_REQUIRED")
        return "판매값 확인 필요"
    return "서버 오류"
}

Log(message) {
    global LOG_FILE
    try FileAppend(FormatTime(, "yyyy-MM-dd HH:mm:ss") " " message "`n", LOG_FILE, "UTF-8")
}

A_TrayMenu.Delete()
A_TrayMenu.Add("MEATOS 스캔 에이전트", (*) => TrayTip("실행 중", "계산대 스캔 감지 중", 1))
A_TrayMenu.Add("로그 폴더 열기", (*) => Run(LOG_DIR))
A_TrayMenu.Add()
A_TrayMenu.Add("종료", (*) => ExitApp())
