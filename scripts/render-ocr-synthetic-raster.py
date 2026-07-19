from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "ai" / "ocr-training" / "generated"
FONT = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 23)
FONT_BOLD = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 24)
TITLE_FONT = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 47)
COLUMNS = [55, 160, 430, 540, 630, 735, 835, 930, 1050, 1260, 1580]
BODY_Y = 292
ROW_HEIGHT = 90
HEADERS = ["축종", "상품명", "원산지", "등급", "상태", "수량", "단위", "단가", "공급가", "이력/수입번호"]


def centered(draw, value, left, right, y, font):
    box = draw.textbbox((0, 0), str(value), font=font)
    draw.text(((left + right - (box[2] - box[0])) / 2, y), str(value), font=font, fill="#172126")


def base_document(truth):
    layout = truth["layoutType"]
    is_carbon = layout == "carbon-copy"
    image = Image.new("RGB", (1640, 1120), "#fff6f2" if is_carbon else "white")
    draw = ImageDraw.Draw(image)
    title = "축산물 거래 및 이력 관리서" if "certificate" in layout or "traceability" in layout else "거 래 명 세 서"
    centered(draw, title, 0, 1640, 62, TITLE_FONT)
    doc = truth["document"]
    draw.text((60, 155), f"공급자: {doc['supplierName']}  |  등록번호: {doc['supplierBusinessNo']}", font=FONT, fill="#172126")
    draw.text((60, 202), "공급받는자: MEATOS 테스트 매장", font=FONT, fill="#172126")
    draw.text((1130, 155), f"거래일자: {doc['invoiceDate']}", font=FONT, fill="#172126")
    draw.text((1130, 202), f"문서번호: {doc['invoiceNo']}", font=FONT, fill="#172126")
    grid = "#be7777" if is_carbon else "#55778c"
    bottom = BODY_Y + ROW_HEIGHT * (len(truth["lineItems"]) + 1)
    for x in COLUMNS:
        draw.line((x, BODY_Y, x, bottom), fill=grid, width=2)
    for row in range(len(truth["lineItems"]) + 2):
        y = BODY_Y + ROW_HEIGHT * row
        draw.line((COLUMNS[0], y, COLUMNS[-1], y), fill=grid, width=2)
    for index, header in enumerate(HEADERS):
        centered(draw, header, COLUMNS[index], COLUMNS[index + 1], BODY_Y + 28, FONT_BOLD)
    for row_index, item in enumerate(truth["lineItems"]):
        values = [item["species"], item["productName"], item["origin"], item["grade"], item["condition"], f"{item['quantity']:.3f}", item["unit"], f"{item['unitPrice']:,}", f"{item['supplyAmount']:,}", item["traceNo"]]
        y = BODY_Y + ROW_HEIGHT * (row_index + 1) + 28
        for cell_index, value in enumerate(values):
            centered(draw, value, COLUMNS[cell_index], COLUMNS[cell_index + 1], y, FONT)
    draw.text((1040, bottom + 68), "합계금액", font=FONT_BOLD, fill="#172126")
    draw.text((1320, bottom + 68), f"{doc['totalAmount']:,} 원", font=FONT_BOLD, fill="#172126")
    draw.text((60, 1030), "MEATOS OCR 통제 평가용 합성 문서 - 실제 거래 자료가 아닙니다.", font=FONT, fill="#53636b")
    return image


def perspective_transform(image):
    source = np.float32([[0, 0], [image.width, 0], [image.width, image.height], [0, image.height]])
    target = np.float32([[35, 28], [image.width - 55, 0], [image.width - 10, image.height - 40], [0, image.height]])
    matrix = cv2.getPerspectiveTransform(source, target)
    array = cv2.warpPerspective(np.array(image), matrix, (image.width, image.height), borderValue=(255, 255, 255))
    return Image.fromarray(array)


def apply_variant(image, variant):
    if variant == "rotated-left":
        return image.rotate(3.2, resample=Image.Resampling.BICUBIC, fillcolor="white")
    if variant == "rotated-right":
        return image.rotate(-3.2, resample=Image.Resampling.BICUBIC, fillcolor="white")
    if variant == "shadow":
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(overlay).polygon([(0, 120), (1640, 50), (1640, 390), (0, 560)], fill=(18, 28, 38, 54))
        return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    if variant == "glare":
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(overlay).ellipse((1050, 90, 1550, 720), fill=(255, 255, 255, 105))
        return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    if variant == "low-contrast":
        return ImageEnhance.Contrast(image).enhance(0.58)
    if variant == "soft-blur":
        return image.filter(ImageFilter.GaussianBlur(1.05))
    if variant == "perspective":
        return perspective_transform(image)
    if variant == "fold":
        draw = ImageDraw.Draw(image)
        draw.line((820, 0, 790, 1120), fill="#c8c8c8", width=8)
        draw.line((828, 0, 798, 1120), fill="#f4f4f4", width=5)
        return image
    if variant == "partial-occlusion":
        ImageDraw.Draw(image).ellipse((715, 455, 1010, 750), fill="#e6d8c6")
    return image


def crop_sheets(image, line_count):
    bottom = BODY_Y + ROW_HEIGHT * (line_count + 1)
    product = image.crop((COLUMNS[1], BODY_Y + ROW_HEIGHT, COLUMNS[2], bottom))
    numeric_columns = [(COLUMNS[5], COLUMNS[6]), (COLUMNS[7], COLUMNS[8]), (COLUMNS[8], COLUMNS[9]), (COLUMNS[9], COLUMNS[10])]
    widths = [right - left - 12 for left, right in numeric_columns]
    sheet = Image.new("RGB", (sum(widths) + 24 * 3, line_count * 92), "white")
    for row_index in range(line_count):
        x = 0
        top = BODY_Y + ROW_HEIGHT * (row_index + 1) + 6
        bottom_row = BODY_Y + ROW_HEIGHT * (row_index + 2) - 6
        for (left, right), width in zip(numeric_columns, widths):
            cell = image.crop((left + 6, top, right - 6, bottom_row))
            sheet.paste(cell, (x, row_index * 92))
            x += width + 24
    return product, sheet


manifest = json.loads((DATASET / "manifest.json").read_text(encoding="utf-8"))
for sample in manifest["samples"]:
    truth = json.loads((DATASET / sample["truth"]).read_text(encoding="utf-8"))
    image = apply_variant(base_document(truth), sample["variant"])
    image.save(DATASET / sample["image"], optimize=True)
    product_crop, numeric_crop = crop_sheets(image, len(truth["lineItems"]))
    product_name = f"{sample['id']}.product.png"
    numeric_name = f"{sample['id']}.numeric-trace.png"
    product_crop.save(DATASET / product_name, optimize=True)
    numeric_crop.save(DATASET / numeric_name, optimize=True)
    sample["rasterImage"] = sample["image"]
    sample["productCrop"] = product_name
    sample["numericTraceCrop"] = numeric_name

(DATASET / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Rendered {len(manifest['samples'])} controlled raster documents and OCR crops.")
