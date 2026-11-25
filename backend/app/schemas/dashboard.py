from datetime import date

from pydantic import BaseModel

from app.schemas.meal import MealResponse


class NutritionValues(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class DailySummaryResponse(BaseModel):
    date: date
    targets: NutritionValues
    consumed: NutritionValues
    remaining: NutritionValues
    meals: list[MealResponse]
