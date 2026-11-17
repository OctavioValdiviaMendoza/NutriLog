from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


MealType = Literal["breakfast", "lunch", "dinner", "snack", "other"]
SourceType = Literal["fdc_branded", "fdc_foundation", "fdc_sr_legacy", "user_entered", "recipe"]


class FoodSearchResult(BaseModel):
    fdc_id: int
    description: str
    brand_name: str | None = None
    brand_owner: str | None = None
    recipe_id: int | None = None
    data_type: str | None = None
    serving_size: float | None = None
    serving_size_unit: str | None = None
    household_serving_full_text: str | None = None
    calories: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    nutrition_basis: Literal["serving", "100g"] = "serving"
    nutrition_basis_grams: float | None = None


class FoodSearchResponse(BaseModel):
    foods: list[FoodSearchResult]
    total_hits: int = 0


class MealCreate(BaseModel):
    meal_type: MealType
    logged_date: date
    food_name: str = Field(min_length=1, max_length=255)
    serving_size: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=1_000)
    calories: float = Field(ge=0, le=100_000)
    protein_g: float = Field(ge=0, le=100_000)
    carbs_g: float = Field(ge=0, le=100_000)
    fat_g: float = Field(ge=0, le=100_000)
    source_type: SourceType
    fdc_id: int | None = None
    brand_name: str | None = None
    brand_owner: str | None = None
    notes: str | None = Field(default=None, max_length=1_000)


class MealResponse(MealCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
