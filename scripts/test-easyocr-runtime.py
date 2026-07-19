from __future__ import annotations

import base64
import json
import mimetypes
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "test-assets" / "good-meat-invoice.jpg"
mime_type = mimetypes.guess_type(image_path.name)[0] or "image/jpeg"
image_data_url = f"data:{mime_type};base64,{base64.b64encode(image_path.read_bytes()).decode('ascii')}"
selective = "--selective" in sys.argv
regions = []
if selective:
    with Image.open(image_path) as image:
        width, height = image.size
    table_top = round(height * 0.44)
    table_bottom = round(height * 0.84)
    row_height = max(1, round((table_bottom - table_top) / 7))
    regions = [
        {
            "regionId": f"test-row-{index + 1}",
            "sourceRowNo": index + 1,
            "text": "",
            "confidence": 60,
            "bounds": {
                "minX": 0,
                "minY": table_top + (row_height * index),
                "maxX": round(width * 0.82),
                "maxY": min(table_bottom, table_top + (row_height * (index + 1))),
            },
            "fieldRegions": [
                {
                    "columnKey": key,
                    "fieldType": field_type,
                    "bounds": {
                        "minX": round(width * start_ratio),
                        "maxX": round(width * end_ratio),
                        "minY": table_top + (row_height * index),
                        "maxY": min(table_bottom, table_top + (row_height * (index + 1))),
                    },
                }
                for key, field_type, start_ratio, end_ratio in [
                    ("productName", "description", 0.00, 0.30),
                ]
            ],
        }
        for index in range(4)
    ]
payload = json.dumps({"imageDataUrl": image_data_url, "supplierName": "좋은축산", "regions": regions}).encode("utf-8")
request = urllib.request.Request(
    f"{os.getenv('EASYOCR_SERVICE_URL', 'http://127.0.0.1:8765').rstrip('/')}/recognize",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.loads(response.read().decode("utf-8"))
except urllib.error.HTTPError as error:
    detail = error.read().decode("utf-8", errors="replace")
    raise RuntimeError(f"EasyOCR HTTP {error.code}: {detail}") from error

output_path = ROOT / "test-assets" / ("easyocr-selective-result.json" if selective else "easyocr-runtime-result.json")
output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "provider": result.get("providerName"),
    "confidence": result.get("providerConfidence"),
    "processingMs": result.get("processingMs"),
    "itemCount": len(result.get("items", [])),
    "lineCount": len(result.get("lines", [])),
    "regionCount": len(result.get("regionResults", [])),
    "selective": bool(result.get("selective")),
    "sampleLines": [line.get("text", "") for line in result.get("lines", [])[:12]],
    "output": str(output_path),
}, ensure_ascii=False, indent=2))
