"""Check the user session before forwarding photos to the food recognition service."""

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
    label: str
    display: str
    confidence: float


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
    """Send the photo to the model and return its food suggestions."""
    # Read the uploaded bytes and forward them to the local ML service.
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

    # Pass through any validation or server error message from the ML service.
    if response.status_code != 200:
        try:
            detail = response.json().get("detail", "Food recognition failed.")
        except Exception:
            detail = "Food recognition failed."
        raise HTTPException(status_code=response.status_code, detail=detail)

    return AnalyzeResponse(**response.json())
