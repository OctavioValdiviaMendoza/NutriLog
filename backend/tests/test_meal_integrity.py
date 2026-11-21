
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import engine


@pytest.mark.parametrize(
    "column,value",
    [
        ("quantity", 0),
        ("quantity", -1),
        ("quantity", float("inf")),
        ("quantity", float("nan")),
        ("calories", -1),
        ("calories", float("inf")),
        ("protein_g", -1),
        ("protein_g", float("inf")),
        ("carbs_g", -1),
        ("carbs_g", float("inf")),
        ("fat_g", -1),
        ("fat_g", float("nan")),
    ],
)
def test_meal_numeric_constraints(column, value):
    with engine.connect() as connection:
        transaction = connection.begin()

        try:
            # Create a temporary user.
            user_id = connection.execute(
                text("""
                    INSERT INTO users (name, email, password_hash)
                    VALUES (
                        'Integrity Test',
                        'integrity-test@example.com',
                        'test-only-hash'
                    )
                    RETURNING id
                """)
            ).scalar_one()

            # Create a valid meal owned by the test user.
            meal_id = connection.execute(
                text("""
                    INSERT INTO meals (
                        user_id, meal_type, logged_date,
                        food_name, serving_size, quantity,
                        calories, protein_g, carbs_g, fat_g,
                        source_type, nutrition_snapshot
                    )
                    VALUES (
                        :user_id, 'breakfast', CURRENT_DATE,
                        'Test Oatmeal', '1 bowl', 1,
                        250, 10, 40, 5,
                        'user_entered', '{}'::json
                    )
                    RETURNING id
                """),
                {"user_id": user_id},
            ).scalar_one()

            # PostgreSQL must reject the invalid update.
            with pytest.raises(IntegrityError):
                connection.execute(
                    text(
                        f"""
                        UPDATE meals
                        SET {column} = :value
                        WHERE id = :meal_id
                        """
                    ),
                    {"value": value, "meal_id": meal_id},
                )

        finally:
            # Remove all temporary test data.
            transaction.rollback()

def test_valid_meal_is_accepted():
    with engine.connect() as connection:
        transaction = connection.begin()

        try:
            user_id = connection.execute(
                text("""
                    INSERT INTO users (name, email, password_hash)
                    VALUES (
                        'Valid Meal Test',
                        'valid-meal-test@example.com',
                        'test-only-hash'
                    )
                    RETURNING id
                """)
            ).scalar_one()

            meal_id = connection.execute(
                text("""
                    INSERT INTO meals (
                        user_id, meal_type, logged_date,
                        food_name, serving_size, quantity,
                        calories, protein_g, carbs_g, fat_g,
                        source_type, nutrition_snapshot
                    )
                    VALUES (
                        :user_id, 'breakfast', CURRENT_DATE,
                        'Test Oatmeal', '1 bowl', 1,
                        250, 10, 40, 5,
                        'user_entered', '{}'::json
                    )
                    RETURNING id
                """),
                {"user_id": user_id},
            ).scalar_one()

            assert meal_id is not None

        finally:
            transaction.rollback()
