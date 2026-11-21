
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
