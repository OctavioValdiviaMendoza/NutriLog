from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.meal import Meal
from app.models.profile import UserProfile
from app.models.user import User
from app.schemas.dashboard import DailySummaryResponse, NutritionValues
from app.schemas.meal import MealResponse

router = APIRouter(tags=["dashboard"])


@router.get("/summary", response_model=DailySummaryResponse)
def get_daily_summary(
    logged_date: date | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    summary_date = logged_date or date.today()
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == current_user.id))
    meals = list(
        db.scalars(
            select(Meal)
            .where(Meal.user_id == current_user.id, Meal.logged_date == summary_date)
            .order_by(Meal.created_at.desc())
        ).all()
    )

    consumed = NutritionValues(
        calories=sum(meal.calories for meal in meals),
        protein_g=sum(meal.protein_g for meal in meals),
        carbs_g=sum(meal.carbs_g for meal in meals),
        fat_g=sum(meal.fat_g for meal in meals),
    )
    targets = NutritionValues(
        calories=profile.calorie_target if profile else 0,
        protein_g=profile.protein_target if profile else 0,
        carbs_g=profile.carb_target if profile else 0,
        fat_g=profile.fat_target if profile else 0,
    )
    remaining = NutritionValues(
        calories=targets.calories - consumed.calories,
        protein_g=targets.protein_g - consumed.protein_g,
        carbs_g=targets.carbs_g - consumed.carbs_g,
        fat_g=targets.fat_g - consumed.fat_g,
    )
    return DailySummaryResponse(
        date=summary_date,
        targets=targets,
        consumed=consumed,
        remaining=remaining,
        meals=[MealResponse.model_validate(meal) for meal in meals],
    )
