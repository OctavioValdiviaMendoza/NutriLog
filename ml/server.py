"""
ml/server.py
------------
Lightweight FastAPI inference server for NutriLog's multi-label EfficientNet-B0
food classifier (port 8001).

The main NutriLog backend proxies authenticated POST /ml/analyze requests here.

Start with:
    cd ml
    uvicorn server:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

import io
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from predict import FoodClassifier

_classifier: FoodClassifier | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _classifier
    print("[ml] Initializing EfficientNet-B0 food classifier...")
    t0 = time.perf_counter()
    _classifier = FoodClassifier()
    print(f"[ml] Classifier initialized in {time.perf_counter() - t0:.2f}s (ready={_classifier.model_ready})")
    yield


app = FastAPI(title="NutriLog ML Inference", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class SupportedCategoryOut(BaseModel):
    label: str
    display: str


class FoodPredictionOut(BaseModel):
    label: str        # canonical label, e.g. "poultry"
    display: str      # human-readable label, e.g. "Poultry"
    confidence: float # independent sigmoid score, 0.0 - 1.0


class AnalyzeResponse(BaseModel):
    predictions: list[FoodPredictionOut]
    model_ready: bool
    model_version: str
    supported_categories: list[SupportedCategoryOut]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": _classifier is not None,
        "model_ready": _classifier.model_ready if _classifier else False,
        "model_version": _classifier.model_version if _classifier else None,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(..., description="Meal photo (JPEG, PNG, or WebP)"),
) -> AnalyzeResponse:
    """Accept an image upload and return thresholded multi-label food predictions."""
    if _classifier is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is still initializing. Please retry in a moment.",
        )

    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image type '{file.content_type}'. Use JPEG, PNG, or WebP.",
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image must be smaller than 20 MB.",
        )

    try:
        image = Image.open(io.BytesIO(data))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not decode image. Upload a valid JPEG, PNG, or WebP file.",
        )

    raw = _classifier.predict(image)

    return AnalyzeResponse(
        predictions=[
            FoodPredictionOut(label=p.label, display=p.display, confidence=p.confidence)
            for p in raw
        ],
        model_ready=_classifier.model_ready,
        model_version=_classifier.model_version,
        supported_categories=[
            SupportedCategoryOut(label=c.label, display=c.display)
            for c in _classifier.supported_categories
        ],
    )
