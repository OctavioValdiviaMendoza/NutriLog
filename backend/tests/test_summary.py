
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.meal import Meal
from app.models.profile import UserProfile
from app.models.user import User


PROFILE = {
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

MEAL = {
    "meal_type": "breakfast",
    "logged_date": "2026-11-21",
    "food_name": "Oatmeal",
    "serving_size": "1 bowl",
    "quantity": 1,
    "calories": 300,
    "protein_g": 10,
    "carbs_g": 50,
    "fat_g": 6,
    "source_type": "user_entered",
}


@pytest.fixture
def summary_clients():
    emails = [
        f"summary-a-{uuid4().hex}@example.com",
        f"summary-b-{uuid4().hex}@example.com",
    ]

    with TestClient(app) as client_a, TestClient(app) as client_b:
        try:
            for client, email in zip((client_a, client_b), emails):
                signup = client.post(
                    "/auth/signup",
                    json={
                        "name": "Summary Tester",
                        "email": email,
                        "password": "temporary-password",
                    },
                )
                assert signup.status_code == 201

            yield client_a, client_b

        finally:
            with SessionLocal() as db:
                users = list(
                    db.scalars(select(User).where(User.email.in_(emails)))
                )

                for user in users:
                    db.execute(
                        delete(AuthSession).where(AuthSession.user_id == user.id)
                    )
                    db.execute(
                        delete(Meal).where(Meal.user_id == user.id)
                    )
                    db.execute(
                        delete(UserProfile).where(
                            UserProfile.user_id == user.id
                        )
                    )
                    db.delete(user)

                db.commit()


def test_empty_day_returns_zero_consumption(summary_clients):
    client, _ = summary_clients

    assert client.put("/profile", json=PROFILE).status_code == 200

    response = client.get("/summary?date=2026-11-21")
    assert response.status_code == 200

    data = response.json()
    assert data["date"] == "2026-11-21"
    assert data["meals"] == []
    assert data["consumed"] == {
        "calories": 0,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 0,
    }
    assert data["remaining"] == data["targets"]


def test_multiple_meals_are_aggregated(summary_clients):
    client, _ = summary_clients

    assert client.put("/profile", json=PROFILE).status_code == 200

    first = client.post("/meals", json=MEAL)
    second = client.post(
        "/meals",
        json={
            **MEAL,
            "meal_type": "lunch",
            "food_name": "Rice and chicken",
            "quantity": 2,
            "calories": 400,
            "protein_g": 30,
            "carbs_g": 45,
            "fat_g": 10,
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201

    response = client.get("/summary?date=2026-11-21")
    assert response.status_code == 200

    data = response.json()

    assert data["consumed"] == {
        "calories": 1100,
        "protein_g": 70,
        "carbs_g": 140,
        "fat_g": 26,
    }

    assert data["remaining"] == {
        "calories": 900,
        "protein_g": 50,
        "carbs_g": 110,
        "fat_g": 39,
    }

    assert len(data["meals"]) == 2


def test_over_target_values_are_negative(summary_clients):
    client, _ = summary_clients

    assert client.put("/profile", json=PROFILE).status_code == 200

    created = client.post(
        "/meals",
        json={
            **MEAL,
            "calories": 2500,
            "protein_g": 150,
            "carbs_g": 300,
            "fat_g": 80,
        },
    )
    assert created.status_code == 201

    response = client.get("/summary?date=2026-11-21")
    assert response.status_code == 200

    remaining = response.json()["remaining"]

    assert remaining["calories"] == -500
    assert remaining["protein_g"] == -30
    assert remaining["carbs_g"] == -50
    assert remaining["fat_g"] == -15


def test_summary_filters_by_date(summary_clients):
    client, _ = summary_clients

    first = client.post("/meals", json=MEAL)
    second = client.post(
        "/meals",
        json={
            **MEAL,
            "logged_date": "2026-11-20",
            "calories": 500,
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201

    today = client.get("/summary?date=2026-11-21")
    yesterday = client.get("/summary?date=2026-11-20")

    assert today.json()["consumed"]["calories"] == 300
    assert yesterday.json()["consumed"]["calories"] == 500


def test_summary_isolated_between_users(summary_clients):
    client_a, client_b = summary_clients

    assert client_a.put("/profile", json=PROFILE).status_code == 200
    assert client_b.put(
        "/profile",
        json={**PROFILE, "calorie_target": 2500},
    ).status_code == 200

    assert client_a.post("/meals", json=MEAL).status_code == 201

    summary_a = client_a.get("/summary?date=2026-11-21")
    summary_b = client_b.get("/summary?date=2026-11-21")

    assert summary_a.status_code == 200
    assert summary_b.status_code == 200

    assert summary_a.json()["consumed"]["calories"] == 300
    assert summary_b.json()["consumed"]["calories"] == 0

    assert summary_a.json()["targets"]["calories"] == 2000
    assert summary_b.json()["targets"]["calories"] == 2500
    assert summary_b.json()["meals"] == []


def test_summary_matches_raw_meal_rows(summary_clients):
    client, _ = summary_clients

    assert client.post("/meals", json=MEAL).status_code == 201
    assert client.post(
        "/meals",
        json={**MEAL, "meal_type": "dinner", "quantity": 2},
    ).status_code == 201

    meals_response = client.get("/meals?logged_date=2026-11-21")
    summary_response = client.get("/summary?date=2026-11-21")

    assert meals_response.status_code == 200
    assert summary_response.status_code == 200

    meals = meals_response.json()
    summary = summary_response.json()

    for field, summary_field in [
        ("calories", "calories"),
        ("protein_g", "protein_g"),
        ("carbs_g", "carbs_g"),
        ("fat_g", "fat_g"),
    ]:
        expected = sum(meal[field] for meal in meals)
        assert summary["consumed"][summary_field] == pytest.approx(expected)

    assert {meal["id"] for meal in summary["meals"]} == {
        meal["id"] for meal in meals
    }

def test_summary_without_profile_returns_zero_targets(summary_clients):
    client, _ = summary_clients

    response = client.get("/summary?date=2026-11-21")

    assert response.status_code == 200

    data = response.json()
    assert data["targets"] == {
        "calories": 0,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 0,
    }
    assert data["consumed"] == data["targets"]
    assert data["remaining"] == data["targets"]
    assert data["meals"] == []


def test_summary_rejects_invalid_date(summary_clients):
    client, _ = summary_clients

    response = client.get("/summary?date=not-a-date")

    assert response.status_code == 422
