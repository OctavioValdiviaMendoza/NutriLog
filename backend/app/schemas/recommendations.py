from typing import Literal
from math import isfinite

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.bmr import BMRRequest

Goal = Literal["lose-weight", "maintain-weight", "gain-weight", "build-muscle", "general-wellness"]
Pace = Literal["gentle", "balanced", "ambitious"]


class FiniteInputs(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def json_safe_errors(cls, value):
        # Invalid JSON numbers must also be serializable in FastAPI's 422 response.
        if isinstance(value, dict):
            return {key: str(item) if isinstance(item, float) and not isfinite(item) else item for key, item in value.items()}
        return value


class CurrentTargets(FiniteInputs):
    calorie_target: float | None = Field(default=None, gt=0, le=20_000)
    protein_target: float | None = Field(default=None, gt=0, le=2_000)
    carb_target: float | None = Field(default=None, gt=0, le=2_000)
    fat_target: float | None = Field(default=None, gt=0, le=2_000)


class RecommendationRequest(BMRRequest, FiniteInputs):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    goal: Goal
    goal_pace: Pace | None = None
    current_targets: CurrentTargets = Field(default_factory=CurrentTargets)

    @model_validator(mode="after")
    def require_pace(self):
        if self.goal in {"lose-weight", "gain-weight", "build-muscle"} and self.goal_pace is None:
            raise ValueError("Choose a pace for your weight or muscle goal.")
        return self


class SuggestedTargets(BaseModel):
    calorie_target: int
    protein_target: float
    fat_target: float
    carb_target: float


class RecommendationResponse(BaseModel):
    policy_version: str = "adult-v1"
    bmr: int
    tdee: int
    calorie_adjustment: int
    weight_kg: float
    eligible: bool
    recommended: SuggestedTargets | None = None
    suggestions: CurrentTargets = Field(default_factory=CurrentTargets)
    messages: list[str] = Field(default_factory=list)
