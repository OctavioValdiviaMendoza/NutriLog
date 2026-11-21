
import pytest
from pydantic import ValidationError

from app.schemas.profile import ProfileRequest


VALID_PROFILE = {
    "age": 24,
    "gender": "female",
    "activity_level": "moderate",
    "weight_lbs": 150,
    "height_feet": 5,
    "height_inches": 6,
    "goal": "maintain-weight",
    "goal_pace": "balanced",
    "calorie_target": 2000,
    "protein_target": 120,
    "carb_target": 250,
    "fat_target": 65,
}


@pytest.mark.parametrize(
    "field,value",
    [
        ("age", 0),
        ("age", 121),
        ("gender", "invalid"),
        ("activity_level", "extreme"),
        ("weight_lbs", 0),
        ("weight_lbs", -10),
        ("height_feet", 0),
        ("height_inches", 12),
        ("goal", "invalid-goal"),
        ("goal_pace", "extreme"),
        ("calorie_target", 0),
        ("protein_target", -1),
        ("carb_target", -1),
        ("fat_target", -1),
    ],
)
def test_profile_rejects_invalid_values(field, value):
    payload = VALID_PROFILE.copy()
    payload[field] = value

    with pytest.raises(ValidationError):
        ProfileRequest.model_validate(payload)


@pytest.mark.parametrize(
    "field",
    [
        "age",
        "gender",
        "activity_level",
        "weight_lbs",
        "height_feet",
        "height_inches",
        "goal",
        "calorie_target",
        "protein_target",
        "carb_target",
        "fat_target",
    ],
)
def test_profile_rejects_missing_required_fields(field):
    payload = VALID_PROFILE.copy()
    del payload[field]

    with pytest.raises(ValidationError):
        ProfileRequest.model_validate(payload)


@pytest.mark.parametrize("age", [1, 120])
def test_profile_accepts_boundary_ages(age):
    payload = VALID_PROFILE.copy()
    payload["age"] = age

    profile = ProfileRequest.model_validate(payload)

    assert profile.age == age


def test_valid_profile_is_accepted():
    profile = ProfileRequest.model_validate(VALID_PROFILE)

    assert profile.age == 24
    assert profile.activity_level == "moderate"
    assert profile.calorie_target == 2000
