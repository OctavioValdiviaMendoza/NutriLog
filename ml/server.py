"""Serve food predictions for photo uploads forwarded by the NutriLog backend."""

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
    # Reuse one loaded model for all requests.
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
    label: str
    display: str
    confidence: float


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
    """Check the upload, then identify supported foods."""
    if _classifier is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is still initializing. Please retry in a moment.",
        )

    # 1. Check the file type and size before reading it into Pillow.
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

    # 2. Decode the image now so a broken file returns a clear 422 error.
    try:
        with Image.open(io.BytesIO(data)) as uploaded:
            image = uploaded.convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not decode image. Upload a valid JPEG, PNG, or WebP file.",
        )

    # 3. Run the model and return the matching foods with model info.
    with image:
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
