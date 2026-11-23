from datetime import date
from math import isfinite

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.meal import Meal
from app.models.user import User
from app.schemas.meal import (
    FoodSearchResponse,
    FoodLogRequest,
    MealCreate,
    MealResponse,
    MealUpdate,
)
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
    return _save_meal(payload, current_user, db)


def _save_meal(payload: MealCreate, current_user: User, db: Session, usda_description: str | None = None):
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
            **({"usda_description": usda_description or payload.food_name} if payload.source_type.startswith("fdc_") else {}),
        },
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.post("/foods/log", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
def log_usda_food(payload: FoodLogRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        food = get_food(payload.fdc_id)
    except (FdcConfigurationError, FdcUnavailableError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    nutrients = {key: getattr(food, key) for key in ("calories", "protein_g", "carbs_g", "fat_g")}
    if any(value is None or not isfinite(value) or value < 0 for value in nutrients.values()):
        raise HTTPException(status_code=422, detail="This USDA record has incomplete nutrition. Choose another result or enter nutrition manually.")
    if payload.unit == "serving":
        if food.nutrition_basis != "serving":
            raise HTTPException(status_code=422, detail="Choose grams or a USDA portion for this food.")
        factor = 1.0
        label = food.household_serving_full_text or f"{food.serving_size} {food.serving_size_unit}"
    else:
        if payload.unit == "portion":
            portion = next((item for item in food.portions if item.id == payload.portion_id), None)
            if portion is None:
                raise HTTPException(status_code=422, detail="Choose an available USDA portion.")
            grams = portion.grams
            label = portion.label
        else:
            grams = 1 if payload.unit == "g" else 28.349523125
            label = f"1 {payload.unit}"
        if not food.nutrition_basis_grams:
            raise HTTPException(status_code=422, detail="This food has no verified gram weight. Use its label serving instead.")
        factor = grams / food.nutrition_basis_grams
    per_unit = {key: value * factor for key, value in nutrients.items()}
    # Validate calculated totals through the same schema used by manual meal logging.
    values = MealCreate(meal_type=payload.meal_type, logged_date=payload.logged_date,
        food_name=food.description[:255], serving_size=label[:120], quantity=payload.amount,
        source_type="fdc_branded" if food.data_type == "Branded" else "fdc_sr_legacy" if food.data_type == "SR Legacy" else "fdc_foundation",
        fdc_id=food.fdc_id, brand_name=food.brand_name, brand_owner=food.brand_owner, **per_unit)
    return _save_meal(values, current_user, db, usda_description=food.description)


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

@router.patch("/{meal_id}", response_model=MealResponse)
def update_meal(
    meal_id: int,
    payload: MealUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meal = db.scalar(
        select(Meal).where(
            Meal.id == meal_id,
            Meal.user_id == current_user.id,
        )
    )

    if meal is None:
        raise HTTPException(
            status_code=404,
            detail="Meal not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    # Preserve original per-serving nutrition values.
    snapshot = dict(meal.nutrition_snapshot or {})
    if meal.source_type.startswith("fdc_"):
        snapshot.setdefault("usda_description", meal.food_name)
    per_serving = dict(snapshot.get("per_serving") or {})

    nutrients = ("calories", "protein_g", "carbs_g", "fat_g")

    for nutrient in nutrients:
        if nutrient in changes:
            per_serving[nutrient] = changes.pop(nutrient)

    quantity = changes.pop("quantity", meal.quantity)

    for field, value in changes.items():
        setattr(meal, field, value)

    for nutrient in nutrients:
        if nutrient not in per_serving:
            raise HTTPException(
                status_code=422,
                detail=f"Missing per-serving value: {nutrient}",
            )

        setattr(
            meal,
            nutrient,
            per_serving[nutrient] * quantity,
        )

    meal.quantity = quantity

    snapshot.update({
        "per_serving": per_serving,
        "quantity": quantity,
    })
    meal.nutrition_snapshot = snapshot

    db.commit()
    db.refresh(meal)

    return meal

@router.delete(
    "/{meal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    meal = db.scalar(
        select(Meal).where(
            Meal.id == meal_id,
            Meal.user_id == current_user.id,
        )
    )

    if meal is None:
        raise HTTPException(
            status_code=404,
            detail="Meal not found",
        )

    db.delete(meal)
    db.commit()

    return None
