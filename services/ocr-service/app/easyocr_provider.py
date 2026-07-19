from __future__ import annotations

import base64
import threading
import time
from pathlib import Path
from typing import Any

import cv2
import easyocr
import numpy as np


class EasyOcrProvider:
    """Lazy EasyOCR runtime used only for uncertain PaddleOCR results."""

    def __init__(self, model_directory: Path, languages: list[str] | None = None) -> None:
        self.model_directory = model_directory
        self.languages = languages or ["ko", "en"]
        self._reader: easyocr.Reader | None = None
        self._lock = threading.Lock()
        self._inference_lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._reader is not None

    def ensure_reader(self) -> easyocr.Reader:
        if self._reader is not None:
            return self._reader
        with self._lock:
            if self._reader is None:
                self.model_directory.mkdir(parents=True, exist_ok=True)
                self._reader = easyocr.Reader(
                    self.languages,
                    gpu=False,
                    model_storage_directory=str(self.model_directory),
                    user_network_directory=str(self.model_directory),
                    download_enabled=False,
                    verbose=False,
                )
        return self._reader

    def recognize(self, image_data_url: str, regions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        started_at = time.perf_counter()
        image = decode_image_data_url(image_data_url)
        prepared, region_bands = prepare_ocr_input(image, regions or [])
        reader = self.ensure_reader()
        with self._inference_lock:
            if region_bands:
                detections = reader.recognize(
                    prepared,
                    horizontal_list=[
                        [0, prepared.shape[1], band["minY"], band["maxY"]]
                        for band in region_bands
                    ],
                    free_list=[],
                    detail=1,
                    paragraph=False,
                    decoder="greedy",
                    batch_size=min(4, len(region_bands)),
                    workers=0,
                    contrast_ths=0.08,
                    adjust_contrast=0.7,
                    reformat=False,
                )
            else:
                detections = reader.readtext(
                    prepared,
                    detail=1,
                    paragraph=False,
                    decoder="greedy",
                    batch_size=1,
                    workers=0,
                    contrast_ths=0.08,
                    adjust_contrast=0.7,
                    text_threshold=0.55,
                    low_text=0.3,
                    link_threshold=0.35,
                    canvas_size=1920,
                    mag_ratio=1.1,
                )

        items = [normalize_detection(item, index) for index, item in enumerate(detections)]
        items.sort(key=lambda item: (item["bounds"]["centerY"], item["bounds"]["minX"]))
        lines = group_into_lines(items)
        region_results = map_lines_to_regions(lines, region_bands)
        output_text = "\n".join(result["text"] for result in region_results) if region_results else "\n".join(line["text"] for line in lines)
        confidences = [item["confidence"] for item in items if item["confidence"] > 0]
        mean_confidence = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

        return {
            "providerId": "easyocr-compare",
            "providerName": "EasyOCR Compare",
            "providerVersion": "easyocr@1.7.2",
            "providerConfidence": mean_confidence,
            "rawText": output_text,
            "items": items,
            "lines": lines,
            "regionResults": region_results,
            "selective": bool(region_bands),
            "processingMs": round((time.perf_counter() - started_at) * 1000),
            "image": {
                "width": int(prepared.shape[1]),
                "height": int(prepared.shape[0]),
                "preprocessing": ["selective_crop_sheet" if region_bands else "full_document", "grayscale", "clahe", "unsharp_mask"],
            },
        }


def decode_image_data_url(value: str) -> np.ndarray:
    encoded = value.split(",", 1)[1] if "," in value else value
    try:
        payload = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise ValueError("INVALID_IMAGE_DATA") from exc
    image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("IMAGE_DECODE_FAILED")
    return image


def prepare_invoice_image(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest_edge = max(height, width)
    if longest_edge > 1800:
        scale = 1800 / longest_edge
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    return enhance_invoice_image(image)


def enhance_invoice_image(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(clahe, (0, 0), 1.0)
    sharpened = cv2.addWeighted(clahe, 1.55, blurred, -0.55, 0)
    return sharpened


def prepare_ocr_input(image: np.ndarray, regions: list[dict[str, Any]]) -> tuple[np.ndarray, list[dict[str, Any]]]:
    if not regions:
        return prepare_invoice_image(image), []

    height, width = image.shape[:2]
    target_height = 72
    gap = 8
    prepared_regions: list[tuple[dict[str, Any], np.ndarray]] = []
    max_width = 1

    for index, region in enumerate(regions[:10]):
        bounds = region.get("bounds", {}) if isinstance(region, dict) else {}
        min_x = max(0, min(width - 1, int(float(bounds.get("minX", 0)))))
        min_y = max(0, min(height - 1, int(float(bounds.get("minY", 0)))))
        max_x = max(min_x + 1, min(width, int(float(bounds.get("maxX", width)))))
        max_y = max(min_y + 1, min(height, int(float(bounds.get("maxY", height)))))
        crop = image[min_y:max_y, min_x:max_x]
        if crop.size == 0:
            continue
        template_fields = region.get("fieldRegions", []) if isinstance(region, dict) else []
        fields = build_field_crops(image, crop, template_fields, min_x, min_y)
        if not fields:
            fields = build_legacy_field_crops(crop)
        for field_order, (field_type, column_key, cell) in enumerate(fields):
            scale = target_height / max(1, cell.shape[0])
            resized_width = min(900, max(80, round(cell.shape[1] * scale)))
            resized = cv2.resize(cell, (resized_width, target_height), interpolation=cv2.INTER_CUBIC)
            prepared_regions.append(({
                "regionId": str(region.get("regionId", f"region-{index + 1}")),
                "sourceRowNo": int(region.get("sourceRowNo", index + 1)),
                "sourceText": str(region.get("text", "")),
                "sourceConfidence": float(region.get("confidence", 0)),
                "fieldType": field_type,
                "columnKey": column_key,
                "fieldOrder": field_order,
            }, resized))
            max_width = max(max_width, resized.shape[1])

    if not prepared_regions:
        return prepare_invoice_image(image), []

    sheet_height = (target_height + gap) * len(prepared_regions) - gap
    sheet = np.full((sheet_height, max_width, 3), 255, dtype=np.uint8)
    bands = []
    offset_y = 0
    for metadata, crop in prepared_regions:
        sheet[offset_y:offset_y + target_height, 0:crop.shape[1]] = crop
        bands.append({**metadata, "minY": offset_y, "maxY": offset_y + target_height})
        offset_y += target_height + gap

    return enhance_invoice_image(sheet), bands


def build_field_crops(
    image: np.ndarray,
    row_crop: np.ndarray,
    fields: list[dict[str, Any]],
    row_min_x: int,
    row_min_y: int,
) -> list[tuple[str, str, np.ndarray]]:
    height, width = image.shape[:2]
    output: list[tuple[str, str, np.ndarray]] = []
    for field in fields:
        bounds = field.get("bounds", {}) if isinstance(field, dict) else {}
        min_x = max(0, min(width - 1, int(float(bounds.get("minX", row_min_x)))))
        min_y = max(0, min(height - 1, int(float(bounds.get("minY", row_min_y)))))
        max_x = max(min_x + 1, min(width, int(float(bounds.get("maxX", min_x + 1)))))
        max_y = max(min_y + 1, min(height, int(float(bounds.get("maxY", min_y + row_crop.shape[0])))))
        cell = image[min_y:max_y, min_x:max_x]
        if cell.size:
            output.append((str(field.get("fieldType", "unknown")), str(field.get("columnKey", "")), cell))
    return output


def build_legacy_field_crops(crop: np.ndarray) -> list[tuple[str, str, np.ndarray]]:
    output: list[tuple[str, str, np.ndarray]] = []
    for field_type, start_ratio, end_ratio in [
        ("description", 0.00, 0.54),
        ("quantityAndPrice", 0.52, 0.84),
        ("amount", 0.81, 1.00),
    ]:
        min_x = min(crop.shape[1] - 1, max(0, round(crop.shape[1] * start_ratio)))
        max_x = min(crop.shape[1], max(min_x + 1, round(crop.shape[1] * end_ratio)))
        output.append((field_type, "", crop[:, min_x:max_x]))
    return output


def map_lines_to_regions(lines: list[dict[str, Any]], bands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    field_results = []
    for band in bands:
        matched = [
            line for line in lines
            if band["minY"] - 8 <= line["bounds"]["centerY"] <= band["maxY"] + 8
        ]
        field_results.append({
            **band,
            "text": " ".join(line["text"] for line in matched).strip(),
            "confidence": round(sum(line["confidence"] for line in matched) / len(matched), 2) if matched else 0,
            "lines": matched,
        })
    grouped: dict[str, list[dict[str, Any]]] = {}
    for result in field_results:
        grouped.setdefault(result["regionId"], []).append(result)

    results = []
    for region_id, fields in grouped.items():
        ordered = sorted(fields, key=lambda field: field.get("fieldOrder", 0))
        confidences = [field["confidence"] for field in ordered if field["confidence"] > 0]
        results.append({
            "regionId": region_id,
            "sourceRowNo": ordered[0]["sourceRowNo"],
            "sourceText": ordered[0]["sourceText"],
            "sourceConfidence": ordered[0]["sourceConfidence"],
            "text": " ".join(field["text"] for field in ordered if field["text"]).strip(),
            "confidence": round(sum(confidences) / len(confidences), 2) if confidences else 0,
            "fields": ordered,
        })
    return sorted(results, key=lambda result: result["sourceRowNo"])


def normalize_detection(detection: Any, index: int) -> dict[str, Any]:
    points, text, confidence = detection
    poly = [[round(float(point[0]), 2), round(float(point[1]), 2)] for point in points]
    xs = [point[0] for point in poly]
    ys = [point[1] for point in poly]
    bounds = {
        "minX": min(xs),
        "minY": min(ys),
        "maxX": max(xs),
        "maxY": max(ys),
        "width": max(xs) - min(xs),
        "height": max(ys) - min(ys),
        "centerY": (min(ys) + max(ys)) / 2,
    }
    return {
        "index": index,
        "text": str(text).strip(),
        "confidence": round(float(confidence) * 100, 2),
        "poly": poly,
        "bounds": bounds,
    }


def group_into_lines(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[list[dict[str, Any]]] = []
    for item in items:
        tolerance = max(12.0, item["bounds"]["height"] * 0.7)
        row = next(
            (
                candidate
                for candidate in rows
                if abs(average_center_y(candidate) - item["bounds"]["centerY"]) <= tolerance
            ),
            None,
        )
        if row is None:
            rows.append([item])
        else:
            row.append(item)

    normalized = []
    for row_no, row in enumerate(sorted(rows, key=average_center_y), start=1):
        ordered = sorted(row, key=lambda item: item["bounds"]["minX"])
        normalized.append(
            {
                "rowNo": row_no,
                "text": " ".join(item["text"] for item in ordered).strip(),
                "confidence": round(sum(item["confidence"] for item in ordered) / len(ordered), 2),
                "items": ordered,
                "bounds": merge_bounds(ordered),
            }
        )
    return normalized


def average_center_y(row: list[dict[str, Any]]) -> float:
    return sum(item["bounds"]["centerY"] for item in row) / len(row)


def merge_bounds(items: list[dict[str, Any]]) -> dict[str, float]:
    min_x = min(item["bounds"]["minX"] for item in items)
    min_y = min(item["bounds"]["minY"] for item in items)
    max_x = max(item["bounds"]["maxX"] for item in items)
    max_y = max(item["bounds"]["maxY"] for item in items)
    return {
        "minX": min_x,
        "minY": min_y,
        "maxX": max_x,
        "maxY": max_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
        "centerY": (min_y + max_y) / 2,
    }
