from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str] = mapped_column(String(16), nullable=False)
    activity_level: Mapped[str] = mapped_column(String(20), nullable=False)
    weight_lbs: Mapped[float] = mapped_column(Float, nullable=False)
    height_feet: Mapped[int] = mapped_column(Integer, nullable=False)
    height_inches: Mapped[int] = mapped_column(Integer, nullable=False)
    goal: Mapped[str] = mapped_column(String(32), nullable=False)
    goal_pace: Mapped[str | None] = mapped_column(String(16), nullable=True)
    calorie_target: Mapped[float] = mapped_column(Float, nullable=False)
    protein_target: Mapped[float] = mapped_column(Float, nullable=False)
    carb_target: Mapped[float] = mapped_column(Float, nullable=False)
    fat_target: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
