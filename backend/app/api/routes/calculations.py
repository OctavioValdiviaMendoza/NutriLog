from fastapi import APIRouter
from app.services.energy import ACTIVITY_MULTIPLIERS, basal_calories, daily_calories
from app.schemas.recommendations import RecommendationRequest, RecommendationResponse
from app.services.recommendations import recommend_targets

from app.schemas.bmr import (
    BMRRequest,
    BMRResponse,
    TDEERequest,
    TDEEResponse,
)

router = APIRouter(prefix="/calculations", tags=["calculations"])


@router.post("/recommendations", response_model=RecommendationResponse)
def calculate_recommendations(payload: RecommendationRequest) -> RecommendationResponse:
    return recommend_targets(payload)


@router.post("/bmr", response_model=BMRResponse)
def calculate_bmr(payload: BMRRequest) -> BMRResponse:
    """Calculate basal metabolic rate using the Mifflin-St Jeor equation."""
    rounded_bmr = basal_calories(payload)

    return BMRResponse(
        bmr=rounded_bmr,
        calories_per_day=rounded_bmr,
    )


@router.post("/tdee", response_model=TDEEResponse)
def calculate_tdee(payload: TDEERequest) -> TDEEResponse:
    """Estimate daily energy expenditure from BMR and activity."""

    bmr_result = calculate_bmr(payload)

    multiplier = ACTIVITY_MULTIPLIERS[payload.activity_level]
    tdee = daily_calories(payload)

    return TDEEResponse(
        bmr=bmr_result.bmr,
        activity_multiplier=multiplier,
        tdee=tdee,
    )
