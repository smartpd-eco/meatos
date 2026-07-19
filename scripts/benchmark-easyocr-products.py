from __future__ import annotations

import json
import time
from pathlib import Path

import cv2
import easyocr


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "ai" / "ocr-training" / "generated"
OUTPUT = ROOT / "outputs" / "ocr-benchmark" / "easyocr-products.json"
MODEL_DIR = ROOT / "ocr-models" / "easyocr"


def normalize(value: str) -> str:
    return "".join(char.lower() for char in value if char.isalnum())


def distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for index, left_char in enumerate(left, start=1):
        current = [index]
        for right_index, right_char in enumerate(right, start=1):
            current.append(min(current[-1] + 1, previous[right_index] + 1, previous[right_index - 1] + (left_char != right_char)))
        previous = current
    return previous[-1]


manifest = json.loads((DATASET / "manifest.json").read_text(encoding="utf-8"))
reader = easyocr.Reader(
    ["ko", "en"],
    gpu=False,
    model_storage_directory=str(MODEL_DIR),
    user_network_directory=str(MODEL_DIR),
    download_enabled=False,
    verbose=False,
)
samples = []
for sample in manifest["samples"]:
    truth = json.loads((DATASET / sample["truth"]).read_text(encoding="utf-8"))
    expected = "".join(item["productName"] for item in truth["lineItems"])
    image = cv2.imread(str(DATASET / sample["productCrop"]), cv2.IMREAD_COLOR)
    started = time.perf_counter()
    results = reader.readtext(image, detail=1, paragraph=False, decoder="greedy", batch_size=1, workers=0, canvas_size=1280, mag_ratio=1.0)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    actual = "".join(str(item[1]) for item in sorted(results, key=lambda item: min(point[1] for point in item[0])))
    expected_normalized = normalize(expected)
    actual_normalized = normalize(actual)
    cer = distance(expected_normalized, actual_normalized) / max(1, len(expected_normalized))
    samples.append({"id": sample["id"], "durationMs": elapsed_ms, "expected": expected, "actual": actual, "characterAccuracy": round(max(0, 1 - cer) * 100, 2)})

summary = {
    "provider": "EasyOCR",
    "scope": "product-name selective cells",
    "sampleCount": len(samples),
    "averageDurationMs": round(sum(item["durationMs"] for item in samples) / len(samples)),
    "p95DurationMs": sorted(item["durationMs"] for item in samples)[max(0, round(len(samples) * 0.95) - 1)],
    "productCharacterAccuracy": round(sum(item["characterAccuracy"] for item in samples) / len(samples), 2),
    "samples": samples,
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in summary.items() if key != "samples"}, ensure_ascii=False, indent=2))
