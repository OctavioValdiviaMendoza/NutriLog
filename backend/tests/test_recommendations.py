import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

BASE = {"gender": "male", "age": 25, "activity_level": "moderate", "weight_lbs": 170,
        "height_feet": 5, "height_inches": 10, "goal": "maintain-weight", "eligibility": "general_adult"}
client = TestClient(app)


def recommend(**changes):
    response = client.post("/calculations/recommendations", json={**BASE, **changes})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("goal", ["lose-weight", "maintain-weight", "gain-weight", "build-muscle", "general-wellness"])
@pytest.mark.parametrize("pace", ["gentle", "balanced", "ambitious"])
def test_goals_produce_balanced_macros_and_capped_calorie_adjustments(goal, pace):
    data = recommend(goal=goal, goal_pace=pace)
    assert data["eligible"]
    plan = data["recommended"]
    calories = plan["calorie_target"]
    assert plan["protein_target"] == round(170 * 0.45359237 * 1.2, 1)
    assert plan["fat_target"] == round(calories * 0.30 / 9, 1)
    assert abs(4 * plan["protein_target"] + 9 * plan["fat_target"] + 4 * plan["carb_target"] - calories) <= 1
    assert 0.45 <= 4 * plan["carb_target"] / calories <= 0.65
    adjustment = data["calorie_adjustment"]
    assert calories == data["tdee"] + adjustment
    if goal == "lose-weight":
        assert -500 <= adjustment < 0
    elif goal in {"gain-weight", "build-muscle"}:
        assert 0 < adjustment <= 300
    else:
        assert adjustment == 0


def test_pace_is_monotonic_and_protein_does_not_depend_on_pace():
    plans = [recommend(goal="gain-weight", goal_pace=pace) for pace in ["gentle", "balanced", "ambitious"]]
    assert [p["calorie_adjustment"] for p in plans] == sorted(p["calorie_adjustment"] for p in plans)
    assert len({p["recommended"]["protein_target"] for p in plans}) == 1


@pytest.mark.parametrize("changes,reason", [
    ({"age": 17}, "18 and older"),
    ({"eligibility": "pregnant_or_breastfeeding"}, "pregnancy"),
    ({"eligibility": "clinician_guidance"}, "clinician"),
    ({"eligibility": "unsure"}, "uncertain"),
    ({"weight_lbs": 85}, "BMI"),
    ({"weight_lbs": 400}, "BMI"),
    ({"gender": "female", "age": 80, "weight_lbs": 110, "height_feet": 5, "height_inches": 1, "activity_level": "sedentary", "goal": "lose-weight", "goal_pace": "ambitious"}, "kcal/day"),
])
def test_ineligible_profiles_receive_no_automatic_targets(changes, reason):
    data = recommend(**changes)
    assert not data["eligible"]
    assert data["recommended"] is None
    assert all(value is None for value in data["suggestions"].values())
    assert reason in " ".join(data["messages"])


def test_custom_calories_drive_fat_and_remaining_carbs():
    current = {"calorie_target": 2400, "protein_target": 120, "fat_target": 80}
    data = recommend(current_targets=current)
    assert data["suggestions"]["fat_target"] == 80
    assert data["suggestions"]["carb_target"] == 300
    assert data["recommended"]["calorie_target"] == data["tdee"]


def test_inconsistent_manual_macros_do_not_generate_negative_carbs():
    data = recommend(current_targets={"calorie_target": 2000, "protein_target": 200, "fat_target": 180})
    assert data["suggestions"]["carb_target"] is None
    assert data["messages"]


def test_low_manual_calories_can_be_replaced_with_valid_full_plan():
    data = recommend(current_targets={"calorie_target": 700})
    assert data["recommended"] is not None
    assert data["suggestions"]["fat_target"] is None
    assert data["suggestions"]["carb_target"] is None


@pytest.mark.parametrize("changes", [{"goal": "unknown"}, {"goal": "gain-weight"}, {"eligibility": ""}, {"current_targets": {"fat_target": -1}}])
def test_invalid_inputs_are_rejected(changes):
    assert client.post("/calculations/recommendations", json={**BASE, **changes}).status_code == 422


def test_nonfinite_and_missing_eligibility_are_rejected():
    payload = {**BASE, "weight_lbs": 1e309}
    assert client.post("/calculations/recommendations", content=json.dumps(payload), headers={"Content-Type": "application/json"}).status_code == 422
    payload = {**BASE}
    payload.pop("eligibility")
    assert client.post("/calculations/recommendations", json=payload).status_code == 422
