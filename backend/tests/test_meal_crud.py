
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


@pytest.mark.parametrize("description,title", [
    ("Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, grilled", "Grilled chicken breast · Skinless, boneless"),
    ("Rice, brown, long-grain, cooked", "Cooked brown rice · Long-grain"),
    ("Fish, salmon, cooked, baked", "Baked salmon"),
    ("Potatoes, flesh and skin, baked", "Baked potatoes · Flesh and skin"),
])
def test_meal_log_and_summary_use_compact_names_with_original_details(meal_clients, description, title):
    client, _ = meal_clients
    payload = {**MEAL_PAYLOAD, "food_name": description, "source_type": "fdc_sr_legacy", "fdc_id": 123}
    response = client.post("/meals", json=payload)
    assert response.status_code == 201, response.text
    meal = response.json()
    assert meal["display_name"] == title
    assert meal["food_name"] == description
    assert meal["original_usda_description"] == description
    assert "nutrition_snapshot" not in meal
    listed = client.get("/meals").json()[0]
    summary = client.get("/summary?date=2026-11-21").json()["meals"][0]
    assert listed["display_name"] == summary["display_name"] == title
    assert summary["original_usda_description"] == description

    # Quantity edits and user-supplied titles must preserve source attribution.
    edited = client.patch(f"/meals/{meal['id']}", json={"quantity": 3})
    assert edited.json()["display_name"] == title
    assert edited.json()["calories"] == MEAL_PAYLOAD["calories"] * 3
    renamed = client.patch(f"/meals/{meal['id']}", json={"food_name": "My Lunch"})
    assert renamed.json()["display_name"] == "My Lunch"
    assert renamed.json()["original_usda_description"] == description


def test_manual_food_names_are_not_rewritten(meal_clients):
    client, _ = meal_clients
    response = client.post("/meals", json={**MEAL_PAYLOAD, "food_name": "Mom's rice, beans & BBQ"})
    assert response.status_code == 201
    assert response.json()["display_name"] == "Mom's rice, beans & BBQ"
    assert response.json()["original_usda_description"] is None


def test_existing_usda_meals_get_short_names_without_migration(meal_clients):
    client, _ = meal_clients
    description = "Fish, salmon, cooked, baked"
    created = client.post("/meals", json={**MEAL_PAYLOAD, "food_name": description, "source_type": "fdc_sr_legacy", "fdc_id": 123}).json()
    with SessionLocal() as db:
        meal = db.get(Meal, created["id"])
        snapshot = dict(meal.nutrition_snapshot)
        snapshot.pop("usda_description")
        meal.nutrition_snapshot = snapshot
        db.commit()
    meal = client.get("/meals").json()[0]
    assert meal["display_name"] == "Baked salmon"
    assert meal["original_usda_description"] == description


@pytest.mark.parametrize("unit,amount,portion_id,expected", [
    ("g", 50, None, 10), ("g", 150, None, 30),
    ("oz", 1, None, 20 * 28.349523125 / 100),
    ("portion", 2, 0, 72),
])
def test_usda_log_calculates_portions_and_preserves_edit_math(meal_clients, monkeypatch, unit, amount, portion_id, expected):
    from app.api.routes import meals
    from app.schemas.meal import FoodSearchResult

    monkeypatch.setattr(meals, "get_food", lambda _: FoodSearchResult(
        fdc_id=123, description="Tomato", data_type="Foundation", nutrition_basis="100g", nutrition_basis_grams=100,
        calories=20, protein_g=1, carbs_g=4, fat_g=0.2,
        portions=[{"id": 0, "label": "1 cup", "grams": 180}],
    ))
    client, _ = meal_clients
    response = client.post("/meals/foods/log", json={"fdc_id": 123, "meal_type": "lunch", "logged_date": "2026-11-21", "amount": amount, "unit": unit, "portion_id": portion_id})
    assert response.status_code == 201, response.text
    meal = response.json()
    assert meal["calories"] == pytest.approx(expected)
    edited = client.patch(f"/meals/{meal['id']}", json={"quantity": amount * 2})
    assert edited.status_code == 200
    assert edited.json()["calories"] == pytest.approx(expected * 2)


def test_usda_log_rejects_unknown_portions(meal_clients, monkeypatch):
    from app.api.routes import meals
    from app.schemas.meal import FoodSearchResult

    monkeypatch.setattr(meals, "get_food", lambda _: FoodSearchResult(fdc_id=123, description="Tomato", calories=20, protein_g=1, carbs_g=4, fat_g=0.2))
    client, _ = meal_clients
    response = client.post("/meals/foods/log", json={"fdc_id": 123, "meal_type": "lunch", "logged_date": "2026-11-21", "amount": 1, "unit": "portion", "portion_id": 99})
    assert response.status_code == 422


def test_usda_log_uses_whole_label_servings(meal_clients, monkeypatch):
    from app.api.routes import meals
    from app.schemas.meal import FoodSearchResult

    monkeypatch.setattr(meals, "get_food", lambda _: FoodSearchResult(
        fdc_id=123, description="Sandwich", data_type="Branded", nutrition_basis="serving",
        nutrition_basis_grams=180, household_serving_full_text="1 sandwich",
        calories=400, protein_g=25, carbs_g=40, fat_g=15,
    ))
    client, _ = meal_clients
    response = client.post("/meals/foods/log", json={"fdc_id": 123, "meal_type": "lunch", "logged_date": "2026-11-21", "amount": 2, "unit": "serving"})
    assert response.status_code == 201, response.text
    assert response.json()["calories"] == 800
    assert response.json()["serving_size"] == "1 sandwich"


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
