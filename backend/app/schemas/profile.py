from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProfileRequest(BaseModel):
    age: int = Field(ge=1, le=120)
    gender: Literal["male", "female"]
    activity_level: Literal["sedentary", "light", "moderate", "very-active"]
    weight_lbs: float = Field(gt=0, le=1_000)
    height_feet: int = Field(ge=1, le=8)
    height_inches: int = Field(ge=0, le=11)
    goal: Literal[
        "lose-weight",
        "maintain-weight",
        "gain-weight",
        "build-muscle",
        "general-wellness",
    ]
    goal_pace: Literal["gentle", "balanced", "ambitious"] | None = None
    calorie_target: float = Field(gt=0, le=20_000)
    protein_target: float = Field(gt=0, le=2_000)
    carb_target: float = Field(gt=0, le=2_000)
    fat_target: float = Field(gt=0, le=2_000)


class ProfileResponse(ProfileRequest):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
