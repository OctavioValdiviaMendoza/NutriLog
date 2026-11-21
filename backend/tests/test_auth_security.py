
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.main import app
from app.db.session import SessionLocal
from app.models.auth_session import AuthSession
from app.models.user import User


@pytest.fixture
def auth_client():
    email = f"auth-security-{uuid4().hex}@example.com"

    with TestClient(app) as client:
        signup = client.post(
            "/auth/signup",
            json={
                "name": "Security Tester",
                "email": email,
                "password": "temporary-password",
            },
        )
        assert signup.status_code == 201

        try:
            yield client, email
        finally:
            with SessionLocal() as db:
                user = db.scalar(
                    select(User).where(User.email == email)
                )
                if user is not None:
                    db.execute(
                        delete(AuthSession).where(
                            AuthSession.user_id == user.id
                        )
                    )
                    db.delete(user)
                    db.commit()


def test_duplicate_email_returns_conflict(auth_client):
    client, email = auth_client

    response = client.post(
        "/auth/signup",
        json={
            "name": "Duplicate Tester",
            "email": email,
            "password": "another-password",
        },
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "password",
    ["", "short", "1234567"],
)
def test_signup_rejects_short_password(password):
    with TestClient(app) as client:
        response = client.post(
            "/auth/signup",
            json={
                "name": "Invalid Password",
                "email": f"invalid-{uuid4().hex}@example.com",
                "password": password,
            },
        )

    assert response.status_code == 422


def test_login_rejects_incorrect_password(auth_client):
    client, email = auth_client

    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": "incorrect-password",
        },
    )

    assert response.status_code == 401


def test_login_rejects_unknown_user():
    with TestClient(app) as client:
        response = client.post(
            "/auth/login",
            json={
                "email": f"unknown-{uuid4().hex}@example.com",
                "password": "temporary-password",
            },
        )

    assert response.status_code == 401


def test_missing_session_returns_401():
    with TestClient(app) as client:
        assert client.get("/auth/me").status_code == 401
        assert client.get("/profile").status_code == 401
        assert client.get("/meals").status_code == 401
        assert client.get("/summary").status_code == 401



def test_expired_session_is_rejected(auth_client):
    client, email = auth_client

    with SessionLocal() as db:
        user = db.scalar(
            select(User).where(User.email == email)
        )

        assert user is not None

        # Save the ID before the database session closes.
        user_id = user.id

        session = db.scalar(
            select(AuthSession).where(
                AuthSession.user_id == user_id
            )
        )

        assert session is not None

        session.expires_at = (
            datetime.now(timezone.utc) - timedelta(minutes=1)
        )
        db.commit()

    # Expired sessions must be rejected.
    response = client.get("/auth/me")

    assert response.status_code == 401

    # Verify the expired session was removed.
    with SessionLocal() as db:
        remaining = db.scalar(
            select(AuthSession).where(
                AuthSession.user_id == user_id
            )
        )

        assert remaining is None
