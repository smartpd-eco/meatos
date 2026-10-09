/* 정육비서 약관·정책 공통 사업자 정보
   ─────────────────────────────────────────────────────────────
   이 파일 한 곳만 채우면 이용약관(terms.html)·개인정보처리방침(privacy.html)·
   계정 삭제(account-delete.html) 화면에 모두 자동 반영됩니다.
   비어 있는 값은 화면에 노란색 "[○○ 입력 필요]"로 표시됩니다.
   Google Play 등록 전에 반드시 모든 값을 채워 주세요.
   ───────────────────────────────────────────────────────────── */
window.MEATOS_LEGAL = Object.freeze({
  serviceName: "정육비서(MEATOS)",
  operatorName: "",          // 운영사 상호 (사업자등록증 기준, 예: 주식회사 ○○)
  ceoName: "",               // 대표자 성명
  businessNumber: "",        // 사업자등록번호 (예: 123-45-67890)
  mailOrderNumber: "",       // 통신판매업 신고번호 (유료 판매 시작 전 신고)
  address: "",               // 사업장 소재지
  supportEmail: "",          // 고객 문의·계정 삭제 요청 이메일
  supportPhone: "",          // 고객센터 전화번호
  privacyOfficerName: "",    // 개인정보 보호책임자 성명
  privacyOfficerTitle: "",   // 개인정보 보호책임자 직책
  privacyOfficerContact: "", // 개인정보 보호책임자 연락처(이메일 또는 전화)
  effectiveDate: "2026-10-08" // 약관·방침 시행일
});

(function () {
  var LABELS = {
    serviceName: "서비스명",
    operatorName: "운영사 상호",
    ceoName: "대표자",
    businessNumber: "사업자등록번호",
    mailOrderNumber: "통신판매업 신고번호",
    address: "사업장 소재지",
    supportEmail: "고객 문의 이메일",
    supportPhone: "고객센터 전화번호",
    privacyOfficerName: "개인정보 보호책임자 성명",
    privacyOfficerTitle: "개인정보 보호책임자 직책",
    privacyOfficerContact: "개인정보 보호책임자 연락처",
    effectiveDate: "시행일"
  };

  function fill() {
    var info = window.MEATOS_LEGAL || {};
    var nodes = document.querySelectorAll("[data-legal]");
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var key = el.getAttribute("data-legal");
      var value = String(info[key] || "").trim();
      if (value) {
        el.textContent = value;
        el.classList.remove("legal-missing");
        if (el.tagName === "A" && key === "supportEmail") el.setAttribute("href", "mailto:" + value);
        if (el.tagName === "A" && key === "supportPhone") el.setAttribute("href", "tel:" + value.replace(/[^0-9+]/g, ""));
      } else {
        el.textContent = "[" + (LABELS[key] || key) + " 입력 필요]";
        el.classList.add("legal-missing");
        if (el.tagName === "A") el.removeAttribute("href");
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
  else fill();
})();
