from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.meal import Meal
from app.models.recipe import Recipe, RecipeIngredient
from app.models.profile import UserProfile
from app.models.user import User


def test_cookie_auth_and_profile_round_trip():
    email = f"profile-{uuid4().hex}@example.com"
    with TestClient(app):
        pass
    client = TestClient(app)

    try:
        signup = client.post(
            "/auth/signup",
            json={
                "name": "Profile Tester",
                "email": email,
                "password": "temporary-password",
            },
        )
        assert signup.status_code == 201
        user = signup.json()
        assert "password" not in user
        assert "password_hash" not in user
        assert "nutrilog_session=" in signup.headers["set-cookie"]

        current_user = client.get("/auth/me")
        assert current_user.status_code == 200
        assert current_user.json()["id"] == user["id"]

        profile_payload = {
            "age": 24,
            "gender": "male",
            "activity_level": "moderate",
            "weight_lbs": 170,
            "height_feet": 5,
            "height_inches": 10,
            "goal": "maintain-weight",
            "goal_pace": "balanced",
            "calorie_target": 2400,
            "protein_target": 160,
            "carb_target": 280,
            "fat_target": 80,
        }
        saved_profile = client.put("/profile", json=profile_payload)
        assert saved_profile.status_code == 200
        assert saved_profile.json()["user_id"] == user["id"]
        assert saved_profile.json()["calorie_target"] == 2400

        loaded_profile = client.get("/profile")
        assert loaded_profile.status_code == 200
        assert loaded_profile.json()["goal"] == "maintain-weight"

        logged_meal = client.post(
            "/meals",
            json={
                "meal_type": "lunch",
                "logged_date": "2026-11-17",
                "food_name": "Test sandwich",
                "serving_size": "1 sandwich",
                "quantity": 2,
                "calories": 400,
                "protein_g": 20,
                "carbs_g": 40,
                "fat_g": 15,
                "source_type": "user_entered",
            },
        )
        assert logged_meal.status_code == 201
        assert logged_meal.json()["calories"] == 800
        assert client.get("/meals?logged_date=2026-11-17").json()[0]["source_type"] == "user_entered"

        created_recipe = client.post(
            "/recipes",
            json={
                "name": "Test tomato bowl",
                "servings": 2,
                "ingredients": [
                    {
                        "food_name": "Tomatoes, raw",
                        "quantity": 200,
                        "unit": "g",
                        "source_type": "fdc_foundation",
                        "fdc_id": 1,
                        "serving_size_grams": 100,
                        "calories_per_serving": 18,
                        "protein_g_per_serving": 0.9,
                        "carbs_g_per_serving": 3.9,
                        "fat_g_per_serving": 0.2,
                    }
                ],
            },
        )
        assert created_recipe.status_code == 201
        recipe = created_recipe.json()
        assert recipe["calories_per_serving"] == 18
        logged_recipe = client.post(
            f"/recipes/{recipe['id']}/log",
            json={"meal_type": "dinner", "logged_date": "2026-11-17", "servings": 1},
        )
        assert logged_recipe.status_code == 201
        assert logged_recipe.json()["source_type"] == "recipe"

        summary = client.get("/summary?date=2026-11-17")
        assert summary.status_code == 200
        assert summary.json()["consumed"]["calories"] == 818
        assert summary.json()["targets"]["calories"] == 2400

        logout = client.post("/auth/logout")
        assert logout.status_code == 204
        assert client.get("/auth/me").status_code == 401
        assert client.get("/profile").status_code == 401
    finally:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).one_or_none()
            if user is not None:
                db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
                db.execute(delete(UserProfile).where(UserProfile.user_id == user.id))
                db.execute(delete(Meal).where(Meal.user_id == user.id))
                recipe_ids = db.query(Recipe.id).filter(Recipe.user_id == user.id).all()
                db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id.in_([recipe_id for (recipe_id,) in recipe_ids])).delete(synchronize_session=False)
                db.execute(delete(Recipe).where(Recipe.user_id == user.id))
                db.delete(user)
                db.commit()
        finally:
            db.close()
def test_public_user_listing_is_not_available():
    with TestClient(app) as client:
        response = client.get("/top3users")

    assert response.status_code == 404