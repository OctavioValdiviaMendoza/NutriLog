from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.meal import Meal
from app.models.user import User
from app.schemas.meal import FoodSearchResponse, MealCreate, MealResponse
from app.services.fdc import FdcConfigurationError, FdcUnavailableError, get_food, search_foods

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("/foods/search", response_model=FoodSearchResponse)
def search_food_database(
    q: str = Query(min_length=2, max_length=120),
    branded_only: bool = False,
    _: User = Depends(get_current_user),
):
    try:
        foods, total_hits = search_foods(q, branded_only)
    except FdcConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FdcUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return FoodSearchResponse(foods=foods, total_hits=total_hits)


@router.get("/foods/{fdc_id}")
def get_food_details(fdc_id: int, _: User = Depends(get_current_user)):
    try:
        return get_food(fdc_id)
    except FdcConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FdcUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
def create_meal(
    payload: MealCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.source_type.startswith("fdc_") and payload.fdc_id is None:
        raise HTTPException(status_code=422, detail="USDA meals must include an fdc_id.")

    values = payload.model_dump()
    per_serving = {
        "calories": payload.calories,
        "protein_g": payload.protein_g,
        "carbs_g": payload.carbs_g,
        "fat_g": payload.fat_g,
    }
    for nutrient in per_serving:
        values[nutrient] = per_serving[nutrient] * payload.quantity

    meal = Meal(
        **values,
        user_id=current_user.id,
        nutrition_snapshot={
            "per_serving": per_serving,
            "quantity": payload.quantity,
            "source_type": payload.source_type,
            "fdc_id": payload.fdc_id,
        },
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.get("", response_model=list[MealResponse])
def list_meals(
    logged_date: date | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Meal).where(Meal.user_id == current_user.id).order_by(Meal.created_at.desc())
    if logged_date:
        query = query.where(Meal.logged_date == logged_date)
    return list(db.scalars(query).all())
