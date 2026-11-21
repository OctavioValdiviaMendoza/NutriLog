
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.profile import UserProfile
from app.models.user import User


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


@pytest.fixture
def test_users():
    emails = [
        f"security-a-{uuid4().hex}@example.com",
        f"security-b-{uuid4().hex}@example.com",
    ]

    with TestClient(app) as client_a, TestClient(app) as client_b:
        for client, email in zip(
            (client_a, client_b), emails
        ):
            response = client.post(
                "/auth/signup",
                json={
                    "name": "Security Tester",
                    "email": email,
                    "password": "temporary-password",
                },
            )
            assert response.status_code == 201

        try:
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
                        delete(UserProfile).where(
                            UserProfile.user_id == user.id
                        )
                    )
                    db.delete(user)

                db.commit()


def test_profile_requires_authentication():
    with TestClient(app) as client:
        response = client.get("/profile")
        assert response.status_code == 401

        response = client.put(
            "/profile",
            json=VALID_PROFILE,
        )
        assert response.status_code == 401


def test_profile_update_is_idempotent(test_users):
    client_a, _ = test_users

    first = client_a.put(
        "/profile",
        json=VALID_PROFILE,
    )
    assert first.status_code == 200

    original_id = first.json()["id"]

    updated_payload = {
        **VALID_PROFILE,
        "calorie_target": 2200,
        "protein_target": 140,
    }

    second = client_a.put(
        "/profile",
        json=updated_payload,
    )
    assert second.status_code == 200
    assert second.json()["id"] == original_id

    loaded = client_a.get("/profile")
    assert loaded.status_code == 200
    assert loaded.json()["calorie_target"] == 2200
    assert loaded.json()["protein_target"] == 140

    with SessionLocal() as db:
        count = len(
            list(
                db.scalars(
                    select(UserProfile).where(
                        UserProfile.user_id
                        == first.json()["user_id"]
                    )
                )
            )
        )
        assert count == 1


def test_profiles_are_isolated_between_users(test_users):
    client_a, client_b = test_users

    profile_a = {
        **VALID_PROFILE,
        "calorie_target": 1800,
    }
    profile_b = {
        **VALID_PROFILE,
        "calorie_target": 2600,
    }

    response_a = client_a.put(
        "/profile",
        json=profile_a,
    )
    response_b = client_b.put(
        "/profile",
        json=profile_b,
    )

    assert response_a.status_code == 200
    assert response_b.status_code == 200

    assert (
        response_a.json()["user_id"]
        != response_b.json()["user_id"]
    )

    loaded_a = client_a.get("/profile")
    loaded_b = client_b.get("/profile")

    assert loaded_a.json()["calorie_target"] == 1800
    assert loaded_b.json()["calorie_target"] == 2600

    # A user-supplied ID must not override session ownership.
    attempted_override = client_a.put(
        "/profile",
        json={
            **profile_a,
            "user_id": response_b.json()["user_id"],
        },
    )

    assert attempted_override.status_code in (200, 422)

    # Regardless of response, user B's profile is unchanged.
    loaded_b_again = client_b.get("/profile")
    assert loaded_b_again.json()["calorie_target"] == 2600


def test_invalid_session_is_rejected():
    with TestClient(app) as client:
        client.cookies.set(
            "nutrilog_session",
            "invalid-session-token",
        )

        response = client.get("/profile")
        assert response.status_code == 401
