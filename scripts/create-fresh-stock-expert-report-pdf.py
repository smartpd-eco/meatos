from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "MEATOS_Fresh_Stock_전문가_운영보고서.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("MalgunBold", r"C:\Windows\Fonts\malgunbd.ttf"))

RED, RED_DARK = HexColor("#C51624"), HexColor("#94101A")
INK, SUB, LINE, PAPER = HexColor("#17191D"), HexColor("#59616D"), HexColor("#E1E5EA"), HexColor("#F6F7F9")
BLUE, GREEN, ORANGE = HexColor("#2463D4"), HexColor("#0F7A3B"), HexColor("#D97706")

MENU_SECTIONS = [
    ("안전재고관리", "운영 목적", "상품별 현재고와 판매속도를 기준으로 안전재고, 재주문점, 목표재고를 산출한다. 입력은 재고 이동, 최근 56일 판매량, 임박재고, 정책값이다. 출력 상태는 발주 필요, 적정, 감축 우선, 확인 필요의 네 단계다. 소비기한 내 판매 가능한 수량을 목표재고 상한으로 적용해 과잉발주를 억제하며, 계산 근거를 함께 보여 관리자 판단을 지원한다."),
    ("자동발주관리", "의사결정 지원", "안전재고 결과를 공급 포장단위와 최소발주량에 맞춰 주문 후보로 변환한다. 현재고, 목표재고, 추천 발주량, 신뢰도, 상태, 설명을 제공한다. 추천 승인은 의사결정 이력만 저장하며 공급처로 주문서를 전송하지 않는다. 초기 운영은 Shadow Mode로 제한하고, 충분한 데이터 품질과 현장 검증을 확보한 뒤 승인형 또는 조건부 자동화로 단계적으로 전환한다."),
    ("Fresh Stock 기준관리", "관리자 기준정보", "상품 정책 F1-F5, 목표 충족률, 검토주기, 리드타임, 판매 가능일, 포장단위, 최소발주량을 관리한다. 수율 학습은 투입중량, 판매가능 산출중량, 부산물, 확인 손실을 입력받아 자동 계산한다. 질량수지 잔차 5% 초과는 검토하고 10% 초과는 학습에서 제외한다. 초기값은 사전범위이며 실제 배치가 누적될수록 사업장 실측값의 비중을 높인다."),
]

FILE_SECTIONS = [
    ("safety-stock.html", "활성 메뉴 화면", "안전재고관리의 문서 구조를 정의한다. 상단 KPI, 검색과 상태 필터, 상품별 안전재고 표, 기준관리 이동 버튼으로 구성된다. 실제 계산은 별도 엔진에 위임하고 화면은 결과 표현에 집중한다. 모바일에서는 KPI가 2열로 전환되고 표는 가로 스크롤을 허용해 작은 화면에서도 수치를 유지한다."),
    ("auto-order.html", "활성 메뉴 화면", "자동발주 추천 목록과 승인 인터페이스를 제공한다. 추천 발주량, 신뢰도, 정책, 판단 근거를 표시하며 Shadow Mode 안내를 고정 노출한다. 승인 버튼은 기업 로그인 사용자에게만 활성화되고, 현재 단계에서는 공급처 전송이 아닌 추천 이력 저장만 수행한다. 이를 통해 운영 중 기존 구매 프로세스를 손상하지 않고 추천 정확도를 검증한다."),
    ("fresh-stock-settings.html", "관리자 메뉴 화면", "안전재고 정책과 수율 측정값을 입력하는 관리자 화면이다. 정책 영역과 수율 학습 영역을 분리해 기준 설정과 실제 작업 기록이 섞이지 않게 했다. 자동화 안전장치 표를 함께 제공하여 관찰, 설명, 추천, 조건부 자동의 단계 차이를 명확히 한다. 기업 로그인 전에는 조회만 가능하고 운영 데이터 저장은 차단된다."),
    ("fresh-stock-engine.js", "비노출 계산 엔진", "Fresh Stock의 결정론적 계산 모듈이다. 상품 정책 자동분류, 최근 수요 통계, 계층형 수율 보정, 동적 안전재고, 재주문점, 소비기한 상한, 포장단위 반올림, 자동화 게이트를 담당한다. LLM에 숫자 결정을 맡기지 않아 같은 입력에는 같은 결과가 나온다. 설명 문구와 계산값을 분리해 감사와 재현성을 확보한다."),
    ("fresh-stock-page.js", "비노출 데이터 연결", "재고 이동과 판매 기록을 조회하고 표준 품목 치환 결과로 상품을 통합한다. 최근 56일의 일별 판매량, 현재고, 3일 이내 임박재고, 정책과 수율 프로필을 계산 엔진에 전달한다. 결과를 안전재고 또는 자동발주 화면 형식으로 렌더링하며, 추천 승인 시 운영 DB에 모델 버전과 사유코드를 포함한 감사 이력을 남긴다."),
    ("fresh-stock-settings.js", "비노출 저장·학습", "관리자 화면의 품목 목록과 권장 정책을 초기화하고 기준값을 운영 DB에 저장한다. 작업 중량 입력 즉시 실측 수율, 로스율, 질량수지 잔차를 미리 계산한다. 확정 시 전용 RPC를 호출해 이벤트 원본을 보존하고 유효 자료만 수율 프로필에 반영한다. 로그인·사업장 조건을 검사해 게스트나 미승인 사용자의 쓰기를 차단한다."),
    ("fresh-stock.css", "비노출 UI 규격", "세 화면이 동일한 카드, KPI, 표, 상태 배지, 입력폼을 사용하도록 시각 규격을 통합한다. 50대 이상 사용자의 가독성을 고려해 충분한 글자 크기, 명확한 대비, 큰 입력영역을 사용한다. 760px 이하에서는 KPI와 입력폼을 2열로 재배치하고 검색도구를 세로로 전환한다. 기능 로직과 분리되어 UI 수정이 계산 결과에 영향을 주지 않는다."),
    ("202608030061_fresh_stock_engine.sql", "비노출 DB 기반", "정책, 수율 프로필, 수율 이벤트, 발주추천 감사 테이블과 수율 관측 RPC를 추가하는 비파괴 마이그레이션이다. 기존 매입·매출·재고 원장을 변경하지 않는다. 회사 소속 확인 기반 RLS를 적용하고, 수율 이벤트의 질량수지 상태를 ACCEPTED, WARNING, REVIEW, EXCLUDED로 저장한다. 자동 주문 전송 기능은 포함하지 않는다."),
    ("test-fresh-stock-engine.mjs", "비노출 품질검사", "정책 분류, 포장단위 반올림, 임박재고 감축 판단, 30건 수율 학습 승격, 질량수지 오류 제외를 자동 검증한다. 기존 전체 회귀 테스트에도 연결되어 품목 치환, 재고, 판매, 위생, 인증 기능과 함께 실행된다. 계산 규칙이 변경될 때 예상 결과가 달라지면 배포 전에 실패하도록 하여 기존 프로세스 손상을 방지한다."),
]

for title, _, text in MENU_SECTIONS + FILE_SECTIONS:
    assert len(text) <= 500, f"{title} exceeds 500 characters: {len(text)}"

class NumberedDocTemplate(BaseDocTemplate):
    pass

doc = NumberedDocTemplate(
    str(OUTPUT), pagesize=A4, leftMargin=17*mm, rightMargin=17*mm,
    topMargin=17*mm, bottomMargin=16*mm,
    title="MEATOS Fresh Stock Engine 전문가 운영보고서", author="MEATOS"
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")

def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.line(17*mm, 13*mm, 193*mm, 13*mm)
    canvas.setFont("Malgun", 8); canvas.setFillColor(SUB)
    canvas.drawString(17*mm, 8.5*mm, "MEATOS Fresh Stock Engine | 전문가 운영보고서")
    canvas.drawRightString(193*mm, 8.5*mm, f"{document.page}")
    canvas.restoreState()

doc.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=footer))

styles = {
    "cover": ParagraphStyle("cover", fontName="MalgunBold", fontSize=29, leading=38, textColor=INK, spaceAfter=6*mm),
    "cover_sub": ParagraphStyle("cover_sub", fontName="Malgun", fontSize=14, leading=23, textColor=SUB),
    "h1": ParagraphStyle("h1", fontName="MalgunBold", fontSize=23, leading=30, textColor=INK, spaceAfter=6*mm),
    "h2": ParagraphStyle("h2", fontName="MalgunBold", fontSize=16, leading=22, textColor=RED, spaceAfter=2*mm),
    "body": ParagraphStyle("body", fontName="Malgun", fontSize=10.5, leading=17, textColor=INK),
    "small": ParagraphStyle("small", fontName="Malgun", fontSize=9, leading=14, textColor=SUB),
    "tag": ParagraphStyle("tag", fontName="MalgunBold", fontSize=8.5, leading=12, textColor=BLUE),
    "center": ParagraphStyle("center", fontName="MalgunBold", fontSize=10.5, leading=16, textColor=INK, alignment=TA_CENTER),
}

def card(title, tag, text, accent=RED):
    block = Table([
        [Paragraph(tag, styles["tag"])],
        [Paragraph(title, styles["h2"])],
        [Paragraph(text, styles["body"])],
    ], colWidths=[doc.width-10*mm])
    block.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.white),
        ("BOX", (0,0), (-1,-1), 0.7, LINE),
        ("LINEBEFORE", (0,0), (0,-1), 4, accent),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    return KeepTogether([block, Spacer(1, 4*mm)])

story = [
    Spacer(1, 20*mm),
    Paragraph("MEATOS<br/>Fresh Stock Engine", styles["cover"]),
    Paragraph("안전재고관리·자동발주시스템<br/>전문가 운영보고서", ParagraphStyle("cs", parent=styles["cover"], fontSize=21, leading=29, textColor=RED_DARK)),
    Spacer(1, 12*mm),
]
cover_box = Table([
    [Paragraph("보고 목적", styles["h2"]), Paragraph("메뉴 역할, 수치 산정, 비노출 파일, 데이터 통제 및 운영 전환 조건을 발표용 형식으로 정리", styles["body"])],
    [Paragraph("운영 단계", styles["h2"]), Paragraph("Observe → Explain → Recommend → Approve-to-Execute → Conditional Auto", styles["body"])],
    [Paragraph("핵심 원칙", styles["h2"]), Paragraph("소비기한 상한, 질량수지 검증, 사업장별 수율학습, 신뢰도 기반 자동화 게이트", styles["body"])],
], colWidths=[35*mm, 125*mm])
cover_box.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),HexColor("#FFF7F7")),("GRID",(0,0),(-1,-1),0.6,HexColor("#F2B8BE")),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10)]))
story += [cover_box, Spacer(1, 15*mm), Paragraph("2026.08 | Production baseline: FRESH-STOCK-MVP-1", styles["small"]), PageBreak()]

story += [Paragraph("01. 경영진 요약", styles["h1"])]
summary_data = [
    ["의사결정 단위", "사업장 + 표준품목 + LOT·소비기한 + 수요 + 리드타임 + 수율"],
    ["계산 책임", "규칙·통계 엔진이 수치를 계산하고 AI는 근거 설명에만 사용"],
    ["초기 운영", "추천과 승인 이력만 수집하는 Shadow Mode"],
    ["자동화 조건", "신뢰도 90% 이상, 수요 56일 이상, 실사 정확도 95% 이상, 납기 20건 이상"],
    ["손실 통제", "품절손실과 폐기손실을 동시에 고려하고 소비기한 내 판매량으로 목표재고 제한"],
]
t = Table([[Paragraph(a, styles["center"]), Paragraph(b, styles["body"])] for a,b in summary_data], colWidths=[42*mm, 122*mm])
t.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.6,LINE),("BACKGROUND",(0,0),(0,-1),PAPER),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
story += [t, Spacer(1, 8*mm), Paragraph("데이터가 부족한 초기에는 표준 범위를 사용하되, 실제 작업배치가 누적되면 사업장·공급처·작업조건에 맞춰 부분 풀링 방식으로 보정한다. 고정 수율을 정답으로 취급하지 않는 것이 핵심 통제 원칙이다.", styles["body"]), PageBreak()]

story += [Paragraph("02. 메뉴 역할과 사용법", styles["h1"])]
for title, tag, text in MENU_SECTIONS:
    story.append(card(title, tag, text))
story.append(PageBreak())

story += [Paragraph("03. 처리 구조", styles["h1"])]
flow = [
    ("재고·판매 원장", "현재고·56일 수요·임박재고"),
    ("표준품목 치환", "공급처·POS 원문을 동일 품목으로 통합"),
    ("Fresh Stock Engine", "정책분류·수요통계·수율·안전재고"),
    ("소비기한·포장 제약", "판매 상한·MOQ·팩 단위 적용"),
    ("추천·감사 이력", "추천 수량·신뢰도·사유코드·승인"),
]
flow_table = Table([[Paragraph(a, styles["center"]), Paragraph("→", styles["center"]), Paragraph(b, styles["body"])] for a,b in flow], colWidths=[46*mm,12*mm,106*mm])
flow_table.setStyle(TableStyle([("BOX",(0,0),(-1,-1),0.8,LINE),("INNERGRID",(0,0),(-1,-1),0.4,LINE),("BACKGROUND",(0,0),(0,-1),HexColor("#EFF6FF")),("TEXTCOLOR",(1,0),(1,-1),BLUE),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10)]))
story += [flow_table, Spacer(1, 9*mm)]
metric_rows = [
    ["가용재고", "장부재고 - 예약 - 보류 - 예상폐기"],
    ["재주문점", "리드타임 평균수요 + 동적 안전재고"],
    ["목표재고", "검토기간 수요 + 리드타임 수요 + 안전재고, 단 소비기한 상한 이하"],
    ["추천 발주량", "목표재고 - 가용재고 - 입고예정, 이후 수율·MOQ·포장단위 적용"],
    ["수율", "판매가능 산출중량 ÷ 투입중량"],
    ["질량수지", "투입 = 판매품 + 부산물 + 손실 + 잔차"],
]
mt = Table([[Paragraph(a, styles["center"]), Paragraph(b, styles["body"])] for a,b in metric_rows], colWidths=[40*mm,124*mm])
mt.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.5,LINE),("BACKGROUND",(0,0),(0,-1),PAPER),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story += [mt, PageBreak()]

story += [Paragraph("04. 파일 책임 - 화면 및 엔진", styles["h1"])]
for title, tag, text in FILE_SECTIONS[:4]:
    story.append(card(title, tag, text, BLUE if "비노출" in tag else RED))
story += [
    PageBreak(),
    Paragraph("04. 파일 책임 - 화면 및 엔진 (계속)", styles["h1"]),
    card(*FILE_SECTIONS[4], BLUE),
]
page_contract = [
    ("입력 경계", "재고 이동·판매 원장·표준품목·정책·수율 프로필을 읽기 전용으로 취합"),
    ("출력 경계", "안전재고 KPI, 상태별 상품 목록, 자동발주 추천량과 판단 근거를 화면에 전달"),
    ("감사 경계", "추천 승인 시 회사·사용자·모델 버전·사유코드·입력 스냅샷을 운영 DB에 기록"),
]
pct = Table([[Paragraph(a, styles["center"]), Paragraph(b, styles["body"])] for a, b in page_contract], colWidths=[34*mm,130*mm])
pct.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.5,LINE),("BACKGROUND",(0,0),(0,-1),PAPER),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story += [Spacer(1, 9*mm), Paragraph("화면 데이터 연결의 통제 경계", styles["h2"]), pct, PageBreak()]

story += [Paragraph("05. 파일 책임 - 학습·DB·검증", styles["h1"])]
for title, tag, text in FILE_SECTIONS[5:]:
    story.append(card(title, tag, text, GREEN if "학습" in text or "DB" in tag else ORANGE))
story.append(PageBreak())

story += [Paragraph("06. 운영 통제와 발표 결론", styles["h1"])]
controls = [
    ["데이터 품질", "표준품목 매핑, LOT·소비기한, 재고 실사, 납기 표본을 자동화 선행조건으로 관리"],
    ["수율 품질", "잔차 2% 이하 정상, 2-5% 경고 후 학습, 5-10% 검토, 10% 초과 제외"],
    ["추천 통제", "임박재고가 있으면 부족처럼 보여도 발주보다 소진·감축 판단을 우선"],
    ["자동화 통제", "신규·고가 간헐품과 데이터 부족 품목은 자동발주 금지"],
    ["감사 가능성", "추천 당시 모델 버전, 신뢰도, 사유코드, 승인 결과를 별도 원장에 보존"],
    ["기존 보호", "기존 매입·매출·재고 원장은 읽기만 하며 Fresh Stock 테이블은 별도 추가"],
]
ct = Table([[Paragraph(a, styles["center"]), Paragraph(b, styles["body"])] for a,b in controls], colWidths=[38*mm,126*mm])
ct.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.6,LINE),("BACKGROUND",(0,0),(0,-1),HexColor("#FFF7ED")),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
story += [ct, Spacer(1, 10*mm), card("발표 결론", "EXECUTIVE MESSAGE", "MEATOS Fresh Stock Engine의 경쟁력은 단순한 평균판매량 계산이 아니라 표준품목 치환, 사업장 수율, 소비기한 상한, 포장·납기 제약과 신뢰도 게이트를 하나의 의사결정 과정으로 연결하는 데 있다. 현재 배포판은 추천·검증 단계이며 실제 승인 결과가 축적될수록 정육점별 정책 정확도를 높일 수 있는 폐루프 기반을 갖췄다.", RED_DARK)]

doc.build(story)
print(OUTPUT)
print({"menus": {title: len(text) for title, _, text in MENU_SECTIONS}, "files": {title: len(text) for title, _, text in FILE_SECTIONS}})
