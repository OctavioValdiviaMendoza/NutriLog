from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.meal import Meal
from app.models.recipe import Recipe, RecipeIngredient
from app.models.user import User
from app.schemas.meal import MealResponse
from app.schemas.recipe import RecipeCreate, RecipeIngredientResponse, RecipeLogRequest, RecipeResponse

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
    response.ingredients = [RecipeIngredientResponse.model_validate({
            **ingredient.nutrition_snapshot,
            "food_name": ingredient.food_name,
            "quantity": ingredient.quantity,
            "unit": ingredient.unit,
            "source_type": ingredient.source_type,
            "fdc_id": ingredient.fdc_id,
            "serving_size_grams": ingredient.nutrition_snapshot.get("serving_size_grams"),
            "calories_per_serving": ingredient.nutrition_snapshot.get("calories", 0),
            "protein_g_per_serving": ingredient.nutrition_snapshot.get("protein_g", 0),
            "carbs_g_per_serving": ingredient.nutrition_snapshot.get("carbs_g", 0),
            "fat_g_per_serving": ingredient.nutrition_snapshot.get("fat_g", 0),
            "id": ingredient.id,
            "recipe_id": ingredient.recipe_id,
            "grams": ingredient.grams,
        })
        for ingredient in ingredients
    ]
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
        db.add(RecipeIngredient(recipe_id=recipe.id, food_name=item.food_name, quantity=item.quantity, unit=item.unit, grams=_grams(item.quantity, item.unit, item.serving_size_grams), source_type=item.source_type, fdc_id=item.fdc_id, nutrition_snapshot={**values, "quantity": item.quantity, "unit": item.unit, "serving_size_grams": item.serving_size_grams}))
    recipe.calories_per_serving = totals["calories"] / payload.servings
    recipe.protein_g_per_serving = totals["protein_g"] / payload.servings
    recipe.carbs_g_per_serving = totals["carbs_g"] / payload.servings
    recipe.fat_g_per_serving = totals["fat_g"] / payload.servings
    db.commit()
    db.refresh(recipe)
    return _recipe_response(db, recipe)


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
