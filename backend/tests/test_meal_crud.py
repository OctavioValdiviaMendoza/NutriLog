
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.meal import Meal
from app.models.user import User


MEAL_PAYLOAD = {
    "meal_type": "breakfast",
    "logged_date": "2026-11-21",
    "food_name": "Oatmeal",
    "serving_size": "1 bowl",
    "quantity": 2,
    "calories": 150,
    "protein_g": 5,
    "carbs_g": 27,
    "fat_g": 3,
    "source_type": "user_entered",
}


@pytest.fixture
def meal_clients():
    emails = [
        f"meal-a-{uuid4().hex}@example.com",
        f"meal-b-{uuid4().hex}@example.com",
    ]

    with TestClient(app) as client_a, TestClient(app) as client_b:
        try:
            for client, email in zip((client_a, client_b), emails):
                response = client.post(
                    "/auth/signup",
                    json={
                        "name": "Meal Tester",
                        "email": email,
                        "password": "temporary-password",
                    },
                )
                assert response.status_code == 201

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
                    db.delete(user)

                db.commit()


def test_create_and_list_meal(meal_clients):
    client, _ = meal_clients

    response = client.post("/meals", json=MEAL_PAYLOAD)
    assert response.status_code == 201

    meal = response.json()
    assert meal["calories"] == 300
    assert meal["protein_g"] == 10
    assert meal["quantity"] == 2

    listed = client.get("/meals?logged_date=2026-11-21")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == meal["id"]


def test_update_meal_quantity_recalculates_nutrition(meal_clients):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    updated = client.patch(
        f"/meals/{meal_id}",
        json={"quantity": 3},
    )

    assert updated.status_code == 200
    assert updated.json()["quantity"] == 3
    assert updated.json()["calories"] == 450
    assert updated.json()["protein_g"] == 15
    assert updated.json()["carbs_g"] == 81
    assert updated.json()["fat_g"] == 9

    summary = client.get("/summary?date=2026-11-21")
    assert summary.status_code == 200
    assert summary.json()["consumed"]["calories"] == 450


def test_update_per_serving_nutrition(meal_clients):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    updated = client.patch(
        f"/meals/{meal_id}",
        json={"calories": 200, "protein_g": 8},
    )

    assert updated.status_code == 200
    assert updated.json()["calories"] == 400
    assert updated.json()["protein_g"] == 16

    # Unchanged nutrients must retain their correct totals.
    assert updated.json()["carbs_g"] == 54
    assert updated.json()["fat_g"] == 6


def test_delete_meal_updates_summary(meal_clients):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    deleted = client.delete(f"/meals/{meal_id}")
    assert deleted.status_code == 204

    listed = client.get("/meals?logged_date=2026-11-21")
    assert listed.status_code == 200
    assert listed.json() == []

    summary = client.get("/summary?date=2026-11-21")
    assert summary.status_code == 200
    assert summary.json()["consumed"]["calories"] == 0


def test_meals_are_isolated_between_users(meal_clients):
    client_a, client_b = meal_clients

    created = client_a.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    assert client_b.get("/meals").json() == []

    assert client_b.patch(
        f"/meals/{meal_id}",
        json={"quantity": 5},
    ).status_code == 404

    assert client_b.delete(f"/meals/{meal_id}").status_code == 404

    # The original owner must still have the unchanged meal.
    owner_meals = client_a.get("/meals").json()
    assert len(owner_meals) == 1
    assert owner_meals[0]["calories"] == 300


@pytest.mark.parametrize(
    "payload",
    [
        {"quantity": 0},
        {"quantity": -1},
        {"quantity": None},
        {"calories": -100},
        {"protein_g": -1},
        {"meal_type": "invalid"},
        {"food_name": ""},
        {"logged_date": "not-a-date"},
    ],
)
def test_invalid_meal_updates_are_rejected(meal_clients, payload):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    response = client.patch(f"/meals/{meal_id}", json=payload)
    assert response.status_code == 422


def test_nonexistent_meal_returns_404(meal_clients):
    client, _ = meal_clients

    assert client.patch(
        "/meals/999999999",
        json={"quantity": 2},
    ).status_code == 404

    assert client.delete("/meals/999999999").status_code == 404


def test_meal_date_filtering(meal_clients):
    client, _ = meal_clients

    first = client.post("/meals", json=MEAL_PAYLOAD)
    second = client.post(
        "/meals",
        json={**MEAL_PAYLOAD, "logged_date": "2026-11-20"},
    )

    assert first.status_code == 201
    assert second.status_code == 201

    today = client.get("/meals?logged_date=2026-11-21")
    yesterday = client.get("/meals?logged_date=2026-11-20")

    assert len(today.json()) == 1
    assert len(yesterday.json()) == 1

def test_updating_meal_date_moves_daily_totals(meal_clients):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201
    meal_id = created.json()["id"]

    updated = client.patch(
        f"/meals/{meal_id}",
        json={"logged_date": "2026-11-22"},
    )

    assert updated.status_code == 200
    assert updated.json()["logged_date"] == "2026-11-22"

    old_day = client.get("/summary?date=2026-11-21")
    new_day = client.get("/summary?date=2026-11-22")

    assert old_day.status_code == 200
    assert new_day.status_code == 200

    assert old_day.json()["consumed"]["calories"] == 0
    assert new_day.json()["consumed"]["calories"] == 300


def test_invalid_update_preserves_original_meal(meal_clients):
    client, _ = meal_clients

    created = client.post("/meals", json=MEAL_PAYLOAD)
    assert created.status_code == 201

    original = created.json()
    meal_id = original["id"]

    rejected = client.patch(
        f"/meals/{meal_id}",
        json={"quantity": -5},
    )

    assert rejected.status_code == 422

    meals = client.get("/meals?logged_date=2026-11-21")
    assert meals.status_code == 200

    saved = next(
        meal for meal in meals.json()
        if meal["id"] == meal_id
    )

    assert saved["quantity"] == original["quantity"]
    assert saved["calories"] == original["calories"]
    assert saved["protein_g"] == original["protein_g"]
    assert saved["carbs_g"] == original["carbs_g"]
    assert saved["fat_g"] == original["fat_g"]
