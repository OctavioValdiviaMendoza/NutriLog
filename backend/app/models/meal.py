from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Meal(Base):
    __tablename__ = "meals"
    __table_args__ = (
        Index("ix_meals_user_logged_date", "user_id", "logged_date"),
        CheckConstraint(
            "quantity > 0 AND quantity < 'Infinity'::float8",
            name="ck_meals_quantity_positive",
        ),
        CheckConstraint(
            "calories >= 0 AND calories < 'Infinity'::float8",
            name="ck_meals_calories_nonnegative",
        ),
        CheckConstraint(
            "protein_g >= 0 AND protein_g < 'Infinity'::float8",
            name="ck_meals_protein_nonnegative",
        ),
        CheckConstraint(
            "carbs_g >= 0 AND carbs_g < 'Infinity'::float8",
            name="ck_meals_carbs_nonnegative",
        ),
        CheckConstraint(
            "fat_g >= 0 AND fat_g < 'Infinity'::float8",
            name="ck_meals_fat_nonnegative",
        ),
    )


    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    logged_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    serving_size: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    calories: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    fdc_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recipe_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id"), nullable=True)
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brand_owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    nutrition_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
