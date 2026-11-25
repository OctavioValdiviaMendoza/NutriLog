from typing import Literal

from pydantic import BaseModel, Field


class BMRRequest(BaseModel):
    gender: Literal["male", "female"]
    age: int = Field(ge=1, le=120)
    activity_level: Literal["sedentary", "light", "moderate", "very-active"]
    weight_lbs: float = Field(gt=0, le=1_000)
    height_feet: int = Field(ge=1, le=8)
    height_inches: int = Field(ge=0, le=11)


class BMRResponse(BaseModel):
    bmr: int
    calories_per_day: int

class TDEERequest(BMRRequest):
    pass


class TDEEResponse(BaseModel):
    bmr: int
    activity_multiplier: float
    tdee: int