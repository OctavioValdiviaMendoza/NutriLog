from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.meal import Meal
from app.models.recipe import Recipe, RecipeIngredient
from app.models.user import User
from app.schemas.meal import MealResponse
from app.schemas.recipe import RecipeCreate, RecipeIngredientResponse, RecipeLogRequest, RecipeResponse, RecipeUpdate

router = APIRouter(prefix="/recipes", tags=["recipes"])
OUNCES_TO_GRAMS = 28.349523125


def _grams(quantity: float, unit: str, serving_size_grams: float | None) -> float:
    if unit == "g":
        return quantity
    if unit == "oz":
        return quantity * OUNCES_TO_GRAMS
    return quantity * (serving_size_grams or 1)


def _factor(quantity: float, unit: str, serving_size_grams: float | None) -> float:
    if unit == "serving":
        return quantity
    if serving_size_grams:
        return _grams(quantity, unit, serving_size_grams) / serving_size_grams
    return _grams(quantity, unit, serving_size_grams) / 100


def _recipe_response(db: Session, recipe: Recipe) -> RecipeResponse:
    ingredients = list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)).all())
    response = RecipeResponse.model_validate(recipe)
    def ingredient_response(ingredient: RecipeIngredient) -> RecipeIngredientResponse:
        snapshot = ingredient.nutrition_snapshot or {}
        factor = _factor(ingredient.quantity, ingredient.unit, snapshot.get("serving_size_grams"))

        def base_value(name: str) -> float:
            stored_base = snapshot.get(f"base_{name}_per_serving")
            if stored_base is not None:
                return float(stored_base)
            scaled = float(snapshot.get(name, 0))
            return scaled / factor if factor else scaled

        return RecipeIngredientResponse.model_validate({
            **snapshot,
            "food_name": ingredient.food_name,
            "quantity": ingredient.quantity,
            "unit": ingredient.unit,
            "source_type": ingredient.source_type,
            "fdc_id": ingredient.fdc_id,
            "serving_size_grams": ingredient.nutrition_snapshot.get("serving_size_grams"),
            "calories_per_serving": base_value("calories"),
            "protein_g_per_serving": base_value("protein_g"),
            "carbs_g_per_serving": base_value("carbs_g"),
            "fat_g_per_serving": base_value("fat_g"),
            "id": ingredient.id,
            "recipe_id": ingredient.recipe_id,
            "grams": ingredient.grams,
        })

    response.ingredients = [ingredient_response(ingredient) for ingredient in ingredients]
    return response


@router.get("", response_model=list[RecipeResponse])
def list_recipes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recipes = list(db.scalars(select(Recipe).where(Recipe.user_id == current_user.id).order_by(Recipe.name)).all())
    return [_recipe_response(db, recipe) for recipe in recipes]


@router.post("", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    recipe = Recipe(user_id=current_user.id, name=payload.name, instructions=payload.instructions, servings=payload.servings, calories_per_serving=0, protein_g_per_serving=0, carbs_g_per_serving=0, fat_g_per_serving=0)
    db.add(recipe)
    db.flush()
    for item in payload.ingredients:
        factor = _factor(item.quantity, item.unit, item.serving_size_grams)
        values = {key: getattr(item, f"{key}_per_serving") * factor for key in totals}
        totals = {key: totals[key] + values[key] for key in totals}
        db.add(RecipeIngredient(recipe_id=recipe.id, food_name=item.food_name, quantity=item.quantity, unit=item.unit, grams=_grams(item.quantity, item.unit, item.serving_size_grams), source_type=item.source_type, fdc_id=item.fdc_id, nutrition_snapshot={**values, "base_calories_per_serving": item.calories_per_serving, "base_protein_g_per_serving": item.protein_g_per_serving, "base_carbs_g_per_serving": item.carbs_g_per_serving, "base_fat_g_per_serving": item.fat_g_per_serving, "quantity": item.quantity, "unit": item.unit, "serving_size_grams": item.serving_size_grams}))
    recipe.calories_per_serving = totals["calories"] / payload.servings
    recipe.protein_g_per_serving = totals["protein_g"] / payload.servings
    recipe.carbs_g_per_serving = totals["carbs_g"] / payload.servings
    recipe.fat_g_per_serving = totals["fat_g"] / payload.servings
    db.commit()
    db.refresh(recipe)
    return _recipe_response(db, recipe)


@router.patch("/{recipe_id}", response_model=RecipeResponse)
def update_recipe(recipe_id: int, payload: RecipeUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recipe = db.scalar(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")

    db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe.id).delete(synchronize_session=False)
    recipe.name = payload.name
    recipe.instructions = payload.instructions
    recipe.servings = payload.servings
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for item in payload.ingredients:
        factor = _factor(item.quantity, item.unit, item.serving_size_grams)
        values = {key: getattr(item, f"{key}_per_serving") * factor for key in totals}
        totals = {key: totals[key] + values[key] for key in totals}
        db.add(RecipeIngredient(recipe_id=recipe.id, food_name=item.food_name, quantity=item.quantity, unit=item.unit, grams=_grams(item.quantity, item.unit, item.serving_size_grams), source_type=item.source_type, fdc_id=item.fdc_id, nutrition_snapshot={**values, "base_calories_per_serving": item.calories_per_serving, "base_protein_g_per_serving": item.protein_g_per_serving, "base_carbs_g_per_serving": item.carbs_g_per_serving, "base_fat_g_per_serving": item.fat_g_per_serving, "quantity": item.quantity, "unit": item.unit, "serving_size_grams": item.serving_size_grams}))
    recipe.calories_per_serving = totals["calories"] / payload.servings
    recipe.protein_g_per_serving = totals["protein_g"] / payload.servings
    recipe.carbs_g_per_serving = totals["carbs_g"] / payload.servings
    recipe.fat_g_per_serving = totals["fat_g"] / payload.servings
    db.commit()
    db.refresh(recipe)
    return _recipe_response(db, recipe)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recipe = db.scalar(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    # Logged meals keep their nutrition snapshot when the saved recipe is removed.
    db.execute(update(Meal).where(Meal.recipe_id == recipe.id).values(recipe_id=None))
    db.delete(recipe)
    db.commit()
    return None


@router.post("/{recipe_id}/log", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
def log_recipe(recipe_id: int, payload: RecipeLogRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recipe = db.scalar(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == current_user.id))
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found.")
    servings = payload.servings
    meal = Meal(user_id=current_user.id, recipe_id=recipe.id, meal_type=payload.meal_type, logged_date=date.fromisoformat(payload.logged_date), food_name=recipe.name, serving_size="1 recipe serving", quantity=servings, calories=recipe.calories_per_serving * servings, protein_g=recipe.protein_g_per_serving * servings, carbs_g=recipe.carbs_g_per_serving * servings, fat_g=recipe.fat_g_per_serving * servings, source_type="recipe", nutrition_snapshot={"recipe_id": recipe.id, "per_serving": {"calories": recipe.calories_per_serving, "protein_g": recipe.protein_g_per_serving, "carbs_g": recipe.carbs_g_per_serving, "fat_g": recipe.fat_g_per_serving}, "servings": servings})
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal
