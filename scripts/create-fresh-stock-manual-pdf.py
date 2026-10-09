from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "정육비서_Fresh_Stock_쉬운_사용설명서.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

font_path = Path(r"C:\Windows\Fonts\malgun.ttf")
bold_path = Path(r"C:\Windows\Fonts\malgunbd.ttf")
pdfmetrics.registerFont(TTFont("Malgun", str(font_path)))
pdfmetrics.registerFont(TTFont("MalgunBold", str(bold_path)))

doc = SimpleDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=18*mm, rightMargin=18*mm, topMargin=17*mm, bottomMargin=15*mm,
    title="정육비서 Fresh Stock 쉬운 사용설명서",
    author="MEATOS"
)

title = ParagraphStyle("title", fontName="MalgunBold", fontSize=22, leading=29, textColor=HexColor("#17191D"), spaceAfter=5*mm)
lead = ParagraphStyle("lead", fontName="Malgun", fontSize=11.5, leading=18, textColor=HexColor("#50555D"), spaceAfter=5*mm)
head = ParagraphStyle("head", fontName="MalgunBold", fontSize=15, leading=21, textColor=HexColor("#C51624"), spaceAfter=2*mm)
body = ParagraphStyle("body", fontName="Malgun", fontSize=12.2, leading=20, textColor=HexColor("#25282D"), alignment=TA_LEFT)
small = ParagraphStyle("small", fontName="Malgun", fontSize=10.5, leading=17, textColor=HexColor("#50555D"))

story = [
    Paragraph("정육비서 Fresh Stock<br/>쉬운 사용설명서", title),
]

sections = [
    ("1. 안전재고관리", "현재고, 하루 평균 판매량, 안전재고, 재주문점을 봅니다. <b>발주 필요</b>는 부족, <b>적정</b>은 충분, <b>감축 우선</b>은 임박·과잉, <b>확인 필요</b>는 자료 부족입니다."),
    ("2. 자동발주관리", "추천 수량과 신뢰도를 확인하고 <b>추천 승인</b>을 누릅니다. 지금은 공급처로 자동 전송되지 않습니다."),
    ("3. Fresh Stock 기준관리", "품목별 납기, 판매 가능일, 포장단위, 최소발주량을 입력합니다. 수율은 투입중량·판매가능 산출중량·부산물·손실만 재면 자동 계산됩니다. 잔차 5% 초과는 확인, 10% 초과는 학습 제외입니다. 30건 전에는 기본값과 실측값을 함께 쓰며 이후 매장값 비중이 커집니다."),
]
for heading, content in sections:
    story += [Paragraph(heading, head), Paragraph(content, body), Spacer(1, 4*mm)]

note = Table([[Paragraph("숫자는 이렇게 보세요", head), Paragraph("목표 충족률 90%는 주문 10번 중 약 9번 재고를 맞추려는 기준입니다. 신뢰도 90% 전에는 자동발주하지 않습니다.", body)]], colWidths=[47*mm, 115*mm])
note.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), HexColor("#FFF2F3")),
    ("BOX", (0,0), (-1,-1), 0.8, HexColor("#F2B8BE")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
]))
story += [note, Spacer(1, 5*mm), Paragraph("파일 역할", head), Paragraph("safety-stock.html 안전재고, auto-order.html 발주, fresh-stock-settings.html 기준 입력, fresh-stock-engine.js 계산, fresh-stock-page.js 데이터 연결, fresh-stock-settings.js 저장·학습, fresh-stock.css 화면 모양, 마이그레이션 61 DB, test-fresh-stock-engine.mjs 계산 검사입니다.", small)]

doc.build(story)
print(OUTPUT)
