"""
backend/app/api/routes/ml.py
----------------------------
Proxy route: authenticated clients POST a meal photo here, and this route
forwards it to the ML inference service (ml/server.py on port 8001).

Keeping the ML call behind the main backend means:
  - Auth is enforced in one place (session cookie check).
  - The phone never talks directly to the ML service.
  - CORS stays simple — the ML service only accepts requests from localhost.
"""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import settings
from app.models.user import User

router = APIRouter(prefix="/ml", tags=["ml"])


class SupportedCategory(BaseModel):
    label: str
    display: str


class FoodPrediction(BaseModel):
    label: str        # e.g. "poultry"
    display: str      # e.g. "Poultry"
    confidence: float # independent sigmoid score, 0.0 - 1.0


class AnalyzeResponse(BaseModel):
    predictions: list[FoodPrediction]
    model_ready: bool
    model_version: str
    supported_categories: list[SupportedCategory]


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_meal_photo(
    file: UploadFile = File(..., description="Meal photo (JPEG, PNG, or WebP)"),
    _current_user: User = Depends(get_current_user),
) -> AnalyzeResponse:
    """
    Forward an authenticated photo upload to the ML inference service and
    return thresholded multi-label food predictions with confidence scores.
    """
    ml_url = f"{settings.ml_service_url}/analyze"
    image_bytes = await file.read()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                ml_url,
                files={"file": (file.filename or "photo.jpg", image_bytes, file.content_type)},
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The food recognition service is not running. "
                "Start it with: cd ml && uvicorn server:app --port 8001"
            ),
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="The food recognition service took too long to respond. Please try again.",
        )

    if response.status_code != 200:
        try:
            detail = response.json().get("detail", "Food recognition failed.")
        except Exception:
            detail = "Food recognition failed."
        raise HTTPException(status_code=response.status_code, detail=detail)

    return AnalyzeResponse(**response.json())
