
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize(
    "gender,expected_bmr",
    [
        ("male", 1762),
        ("female", 1596),
    ],
)
def test_bmr_calculation(gender, expected_bmr):
    payload = {
        "gender": gender,
        "age": 25,
        "activity_level": "moderate",
        "weight_lbs": 170,
        "height_feet": 5,
        "height_inches": 10,
    }

    with TestClient(app) as client:
        response = client.post(
            "/calculations/bmr",
            json=payload,
        )

    assert response.status_code == 200
    assert response.json()["bmr"] == expected_bmr
    assert response.json()["calories_per_day"] == expected_bmr


@pytest.mark.parametrize(
    "field,value",
    [
        ("age", 0),
        ("age", 121),
        ("gender", "invalid"),
        ("activity_level", "extreme"),
        ("weight_lbs", 0),
        ("height_feet", 0),
        ("height_inches", 12),
    ],
)
def test_bmr_rejects_invalid_input(field, value):
    payload = {
        "gender": "female",
        "age": 25,
        "activity_level": "moderate",
        "weight_lbs": 150,
        "height_feet": 5,
        "height_inches": 6,
    }

    payload[field] = value

    with TestClient(app) as client:
        response = client.post(
            "/calculations/bmr",
            json=payload,
        )

    assert response.status_code == 422

@pytest.mark.parametrize(
    "activity_level,multiplier,expected_tdee",
    [
        ("sedentary", 1.2, 2114),
        ("light", 1.375, 2423),
        ("moderate", 1.55, 2731),
        ("very-active", 1.725, 3039),
    ],
)
def test_tdee_activity_multipliers(
    activity_level, multiplier, expected_tdee
):
    payload = {
        "gender": "male",
        "age": 25,
        "activity_level": activity_level,
        "weight_lbs": 170,
        "height_feet": 5,
        "height_inches": 10,
    }

    with TestClient(app) as client:
        response = client.post(
            "/calculations/tdee",
            json=payload,
        )

    assert response.status_code == 200

    data = response.json()

    assert data["bmr"] == 1762
    assert data["activity_multiplier"] == multiplier
    assert data["tdee"] == expected_tdee


def test_tdee_rejects_invalid_activity():
    payload = {
        "gender": "male",
        "age": 25,
        "activity_level": "extreme",
        "weight_lbs": 170,
        "height_feet": 5,
        "height_inches": 10,
    }

    with TestClient(app) as client:
        response = client.post(
            "/calculations/tdee",
            json=payload,
        )

    assert response.status_code == 422
