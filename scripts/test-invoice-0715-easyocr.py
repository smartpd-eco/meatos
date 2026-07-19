import json
import sys
import time
import unicodedata
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "ocr-service"))

from app.easyocr_provider import EasyOcrProvider


def compact(value: object) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).upper()
    return "".join(character for character in normalized if character.isalnum())


image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("C:/Users/admin/Downloads/거래명세서0715.jpg")
output_path = ROOT / "outputs" / "ocr-benchmark" / "invoice-0715-easyocr.json"
truth = {
    "supplierName": "(주)좋은축산유통",
    "invoiceDate": "2026-05-29",
    "totalAmount": "1673720",
    "rows": [
        {"productName": "냉장 항정(장터)", "quantity": "3.90", "unitPrice": "42000", "supplyAmount": "163800", "traceNo": "L12605276054001"},
        {"productName": "냉장 목살(장터)", "quantity": "23.90", "unitPrice": "18500", "supplyAmount": "442150", "traceNo": "L12605256054001"},
        {"productName": "냉장 목살(장터)", "quantity": "11.10", "unitPrice": "18500", "supplyAmount": "205350", "traceNo": "L12605256054004"},
        {"productName": "냉장 삼겹(장터)", "quantity": "37.70", "unitPrice": "21000", "supplyAmount": "791700", "traceNo": "L12605256054004"},
        {"productName": "냉동 우삼겹(엑셀)", "quantity": "5.44", "unitPrice": "13000", "supplyAmount": "70720", "traceNo": "803042102984"},
    ],
}

provider = EasyOcrProvider(ROOT / "ocr-models" / "easyocr")
started_at = time.perf_counter()
image_data_url = "data:image/jpeg;base64," + base64.b64encode(image_path.read_bytes()).decode("ascii")
result = provider.recognize(image_data_url)
duration_ms = round((time.perf_counter() - started_at) * 1000)
raw_text = "\n".join(str(line.get("text", "")) for line in result.get("lines", []))
normalized_text = compact(raw_text)
fields = [
    {"field": "supplierName", "expected": truth["supplierName"]},
    {"field": "invoiceDate", "expected": truth["invoiceDate"]},
    {"field": "totalAmount", "expected": truth["totalAmount"]},
]
for index, row in enumerate(truth["rows"], start=1):
    fields.extend([
        {"field": f"rows.{index}.productName", "expected": row["productName"]},
        {"field": f"rows.{index}.quantity", "expected": row["quantity"]},
        {"field": f"rows.{index}.unitPrice", "expected": row["unitPrice"]},
        {"field": f"rows.{index}.supplyAmount", "expected": row["supplyAmount"]},
        {"field": f"rows.{index}.traceNo", "expected": row["traceNo"]},
    ])
for field in fields:
    field["matched"] = compact(field["expected"]) in normalized_text

matched_count = sum(1 for field in fields if field["matched"])
report = {
    "imagePath": str(image_path),
    "provider": "EasyOCR 1.7.2",
    "role": "full-document diagnostic; production role remains product-cell selective comparison",
    "durationMs": duration_ms,
    "confidence": result.get("providerConfidence", 0),
    "matchedFields": matched_count,
    "totalFields": len(fields),
    "exactPresenceRate": round(matched_count / len(fields) * 100, 2),
    "fields": fields,
    "rawText": raw_text,
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "provider": report["provider"],
    "durationMs": report["durationMs"],
    "confidence": report["confidence"],
    "matchedFields": report["matchedFields"],
    "totalFields": report["totalFields"],
    "exactPresenceRate": report["exactPresenceRate"],
    "failedFields": [field for field in fields if not field["matched"]],
}, ensure_ascii=False, indent=2))
