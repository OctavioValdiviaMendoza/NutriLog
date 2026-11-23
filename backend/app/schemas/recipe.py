from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


IngredientUnit = Literal["g", "oz", "serving"]
IngredientSource = Literal["fdc_branded", "fdc_foundation", "fdc_sr_legacy", "user_entered"]


class RecipeIngredientCreate(BaseModel):
    food_name: str = Field(min_length=1, max_length=255)
    quantity: float = Field(gt=0, le=100_000)
    unit: IngredientUnit
    source_type: IngredientSource
    fdc_id: int | None = None
    serving_size_grams: float | None = Field(default=None, gt=0)
    calories_per_serving: float = Field(ge=0)
    protein_g_per_serving: float = Field(ge=0)
    carbs_g_per_serving: float = Field(ge=0)
    fat_g_per_serving: float = Field(ge=0)


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    instructions: str | None = Field(default=None, max_length=5_000)
    servings: float = Field(gt=0, le=1_000)
    ingredients: list[RecipeIngredientCreate] = Field(min_length=1, max_length=100)


class RecipeUpdate(RecipeCreate):
    pass


class RecipeIngredientResponse(RecipeIngredientCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipe_id: int
    grams: float


class RecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    instructions: str | None
    servings: float
    calories_per_serving: float
    protein_g_per_serving: float
    carbs_g_per_serving: float
    fat_g_per_serving: float
    created_at: datetime
    updated_at: datetime
    ingredients: list[RecipeIngredientResponse] = []


class RecipeLogRequest(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack", "other"]
    logged_date: str
    servings: float = Field(gt=0, le=1_000)
