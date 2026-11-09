from fastapi import APIRouter

from app.schemas.bmr import BMRRequest, BMRResponse

router = APIRouter(prefix="/calculations", tags=["calculations"])


@router.post("/bmr", response_model=BMRResponse)
def calculate_bmr(payload: BMRRequest) -> BMRResponse:
    """Calculate basal metabolic rate using the Mifflin-St Jeor equation."""
    weight_kg = payload.weight_lbs * 0.45359237
    height_cm = (payload.height_feet * 12 + payload.height_inches) * 2.54

    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * payload.age
    bmr += 5 if payload.gender == "male" else -161
    rounded_bmr = round(bmr)

    return BMRResponse(
        bmr=rounded_bmr,
        calories_per_day=rounded_bmr,
    )

