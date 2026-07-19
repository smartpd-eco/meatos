from __future__ import annotations

import os
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .easyocr_provider import EasyOcrProvider


ROOT = Path(__file__).resolve().parents[3]
MODEL_DIR = Path(os.getenv("EASYOCR_MODEL_DIR", ROOT / "ocr-models" / "easyocr"))
provider = EasyOcrProvider(MODEL_DIR)

app = FastAPI(title="MEATOS EasyOCR Compare Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4173", "http://127.0.0.1:4173"],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.on_event("startup")
def warm_easyocr_models() -> None:
    threading.Thread(target=provider.ensure_reader, name="easyocr-warmup", daemon=True).start()


class RecognitionRequest(BaseModel):
    imageDataUrl: str = Field(min_length=32)
    documentId: str = ""
    tenantId: str = ""
    supplierName: str = ""
    qualityScore: float = 0
    regions: list[dict[str, object]] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "providerId": "easyocr-compare",
        "providerName": "EasyOCR Compare",
        "providerVersion": "easyocr@1.7.2",
        "mode": "python-local-service",
        "modelReady": provider.ready,
        "modelDirectory": str(MODEL_DIR),
    }


@app.post("/recognize")
def recognize(payload: RecognitionRequest) -> dict[str, object]:
    try:
        return provider.recognize(payload.imageDataUrl, payload.regions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"EASYOCR_RUNTIME_ERROR: {exc}") from exc
