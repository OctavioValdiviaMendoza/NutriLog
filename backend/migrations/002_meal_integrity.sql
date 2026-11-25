
-- NutriLog: Meal integrity improvements
-- Adds constraints and an index to an existing database.
-- Safe to rerun after successful completion.

BEGIN;

CREATE INDEX IF NOT EXISTS ix_meals_user_logged_date
ON meals (user_id, logged_date);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_meals_quantity_positive'
          AND conrelid = 'meals'::regclass
    ) THEN
        ALTER TABLE meals
        ADD CONSTRAINT ck_meals_quantity_positive
        CHECK (quantity > 0 AND quantity < 'Infinity'::float8);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_meals_calories_nonnegative'
          AND conrelid = 'meals'::regclass
    ) THEN
        ALTER TABLE meals
        ADD CONSTRAINT ck_meals_calories_nonnegative
        CHECK (calories >= 0 AND calories < 'Infinity'::float8);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_meals_protein_nonnegative'
          AND conrelid = 'meals'::regclass
    ) THEN
        ALTER TABLE meals
        ADD CONSTRAINT ck_meals_protein_nonnegative
        CHECK (protein_g >= 0 AND protein_g < 'Infinity'::float8);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_meals_carbs_nonnegative'
          AND conrelid = 'meals'::regclass
    ) THEN
        ALTER TABLE meals
        ADD CONSTRAINT ck_meals_carbs_nonnegative
        CHECK (carbs_g >= 0 AND carbs_g < 'Infinity'::float8);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_meals_fat_nonnegative'
          AND conrelid = 'meals'::regclass
    ) THEN
        ALTER TABLE meals
        ADD CONSTRAINT ck_meals_fat_nonnegative
        CHECK (fat_g >= 0 AND fat_g < 'Infinity'::float8);
    END IF;
END
$$;

COMMIT;
