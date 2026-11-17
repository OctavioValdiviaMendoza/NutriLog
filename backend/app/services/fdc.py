from typing import Any

import httpx

from app.core.config import settings
from app.schemas.meal import FoodSearchResult


class FdcUnavailableError(RuntimeError):
    pass


class FdcConfigurationError(RuntimeError):
    pass


def _nutrient(food: dict[str, Any], names: set[str]) -> float | None:
    for item in food.get("foodNutrients", []):
        nutrient = item.get("nutrient", item)
        name = str(nutrient.get("name") or item.get("nutrientName", "")).lower()
        if name in names or ("energy" in names and name.startswith("energy (atwater")):
            value = item.get("amount", item.get("value"))
            return float(value) if value is not None else None
    return None


def _result(food: dict[str, Any]) -> FoodSearchResult:
    data_type = food.get("dataType")
    return FoodSearchResult(
        fdc_id=food["fdcId"],
        description=food.get("description", ""),
        brand_name=food.get("brandName"),
        brand_owner=food.get("brandOwner"),
        data_type=data_type,
        serving_size=food.get("servingSize"),
        serving_size_unit=food.get("servingSizeUnit"),
        household_serving_full_text=food.get("householdServingFullText"),
        calories=_nutrient(food, {"energy", "energy (kcal)"}),
        protein_g=_nutrient(food, {"protein"}),
        carbs_g=_nutrient(food, {"carbohydrate, by difference", "carbohydrate"}),
        fat_g=_nutrient(food, {"total lipid (fat)", "total fat"}),
        nutrition_basis="serving" if data_type == "Branded" else "100g",
        nutrition_basis_grams=food.get("servingSize") if data_type == "Branded" else 100,
    )


def _request(path: str, params: dict[str, Any]) -> dict[str, Any]:
    if not settings.fdc_api_key:
        raise FdcUnavailableError("USDA FoodData Central is not configured.")

    try:
        response = httpx.get(
            f"{settings.fdc_api_base_url.rstrip('/')}/{path.lstrip('/')}",
            params={**params, "api_key": settings.fdc_api_key},
            timeout=10,
        )
        if response.status_code == 403:
            raise FdcConfigurationError("USDA FoodData Central rejected the configured API key.")
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise FdcUnavailableError("USDA FoodData Central is temporarily unavailable.") from exc
    return response.json()


def search_foods(query: str, branded_only: bool = False) -> tuple[list[FoodSearchResult], int]:
    data_types = ["Branded"] if branded_only else ["Foundation", "SR Legacy"]
    payload = _request(
        "foods/search",
        {"query": query, "dataType": data_types, "pageSize": 20, "pageNumber": 1},
    )
    foods = payload.get("foods", [])
    query_terms = {term.lower() for term in query.split() if len(term) > 2}

    def rank(food: dict[str, Any]) -> tuple[int, int]:
        description = food.get("description", "").lower()
        matched = sum(term in description for term in query_terms)
        unwanted = sum(term in description for term in ("sauce", "ketchup", "paste", "juice"))
        return (matched - unwanted, -len(description))

    foods.sort(key=rank, reverse=True)
    return [_result(food) for food in foods[:10]], payload.get("totalHits", 0)


def get_food(fdc_id: int) -> FoodSearchResult:
    return _result(_request(f"food/{fdc_id}", {}))
