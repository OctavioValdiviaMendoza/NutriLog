"""Shared energy estimates for display and goal recommendations."""

from app.schemas.bmr import BMRRequest

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "very-active": 1.725,
}


def basal_calories(payload: BMRRequest) -> int:
    weight_kg = payload.weight_lbs * 0.45359237
    height_cm = (payload.height_feet * 12 + payload.height_inches) * 2.54
    value = 10 * weight_kg + 6.25 * height_cm - 5 * payload.age
    return round(value + (5 if payload.gender == "male" else -161))


def daily_calories(payload: BMRRequest) -> int:
    return round(basal_calories(payload) * ACTIVITY_MULTIPLIERS[payload.activity_level])
