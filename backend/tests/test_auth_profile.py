from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
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
                db.delete(user)
                db.commit()
        finally:
            db.close()
