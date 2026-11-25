
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.meal import Meal
from app.models.recipe import Recipe, RecipeIngredient
from app.models.user import User


@pytest.fixture
def recipe_clients():
    emails = [
        f"recipe-security-a-{uuid4().hex}@example.com",
        f"recipe-security-b-{uuid4().hex}@example.com",
    ]

    with TestClient(app) as client_a, TestClient(app) as client_b:
        try:
            for client, email in zip((client_a, client_b), emails):
                response = client.post(
                    "/auth/signup",
                    json={
                        "name": "Recipe Security Tester",
                        "email": email,
                        "password": "temporary-password",
                    },
                )
                assert response.status_code == 201

            yield client_a, client_b

        finally:
            with SessionLocal() as db:
                users = list(
                    db.scalars(
                        select(User).where(User.email.in_(emails))
                    )
                )

                for user in users:
                    db.execute(
                        delete(AuthSession).where(
                            AuthSession.user_id == user.id
                        )
                    )
                    db.execute(
                        delete(Meal).where(
                            Meal.user_id == user.id
                        )
                    )

                    recipe_ids = list(
                        db.scalars(
                            select(Recipe.id).where(
                                Recipe.user_id == user.id
                            )
                        )
                    )

                    if recipe_ids:
                        db.execute(
                            delete(RecipeIngredient).where(
                                RecipeIngredient.recipe_id.in_(recipe_ids)
                            )
                        )

                    db.execute(
                        delete(Recipe).where(
                            Recipe.user_id == user.id
                        )
                    )
                    db.delete(user)

                db.commit()


def test_recipe_isolation_between_users(recipe_clients):
    client_a, client_b = recipe_clients

    payload = {
        "name": "Private Oatmeal",
        "servings": 2,
        "ingredients": [
            {
                "food_name": "Oats",
                "quantity": 100,
                "unit": "g",
                "source_type": "user_entered",
                "serving_size_grams": 100,
                "calories_per_serving": 389,
                "protein_g_per_serving": 16.9,
                "carbs_g_per_serving": 66.3,
                "fat_g_per_serving": 6.9,
            }
        ],
    }

    created = client_a.post("/recipes", json=payload)
    assert created.status_code == 201

    recipe_id = created.json()["id"]

    owner_recipes = client_a.get("/recipes")
    other_recipes = client_b.get("/recipes")

    assert owner_recipes.status_code == 200
    assert other_recipes.status_code == 200

    assert any(
        recipe["id"] == recipe_id
        for recipe in owner_recipes.json()
    )
    assert all(
        recipe["id"] != recipe_id
        for recipe in other_recipes.json()
    )

    # User B cannot log User A's recipe.
    forbidden = client_b.post(
        f"/recipes/{recipe_id}/log",
        json={
            "meal_type": "breakfast",
            "logged_date": "2026-11-21",
            "servings": 1,
        },
    )

    assert forbidden.status_code == 404

    assert client_b.get("/meals").json() == []


def test_recipe_edits_preserve_nutrition_and_delete_keeps_logged_meals(recipe_clients):
    owner, other = recipe_clients
    payload = {"name": "Oatmeal", "servings": 2, "ingredients": [{
        "food_name": "Oats", "quantity": 50, "unit": "g", "source_type": "user_entered",
        "serving_size_grams": 100, "calories_per_serving": 400,
        "protein_g_per_serving": 10, "carbs_g_per_serving": 60, "fat_g_per_serving": 8,
    }]}
    created = owner.post("/recipes", json=payload)
    assert created.status_code == 201
    recipe = created.json()
    assert recipe["calories_per_serving"] == 100
    assert other.patch(f"/recipes/{recipe['id']}", json=payload).status_code == 404
    assert other.delete(f"/recipes/{recipe['id']}").status_code == 404
    for _ in range(3):
        updated = owner.patch(f"/recipes/{recipe['id']}", json={**payload, "ingredients": recipe["ingredients"]})
        assert updated.status_code == 200, updated.text
        recipe = updated.json()
        assert recipe["calories_per_serving"] == 100
        assert recipe["ingredients"][0]["calories_per_serving"] == 400
    logged = owner.post(f"/recipes/{recipe['id']}/log", json={"meal_type": "breakfast", "logged_date": "2026-11-21", "servings": 2})
    assert logged.status_code == 201
    assert owner.delete(f"/recipes/{recipe['id']}").status_code == 204
    assert owner.get("/recipes").json() == []
    assert owner.get("/meals").json()[0]["calories"] == 200


@pytest.mark.parametrize(
    "path",
    [
        "/recipes",
        "/meals",
        "/meals/foods/search?q=oats",
        "/meals/foods/12345",
        "/summary",
        "/profile",
    ],
)
def test_protected_get_routes_require_authentication(path):
    with TestClient(app) as client:
        response = client.get(path)

    assert response.status_code == 401
