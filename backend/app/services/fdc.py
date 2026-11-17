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
        name = str(nutrient.get("name", "")).lower()
        if name in names:
            value = item.get("amount")
            return float(value) if value is not None else None
    return None


def _result(food: dict[str, Any]) -> FoodSearchResult:
    return FoodSearchResult(
        fdc_id=food["fdcId"],
        description=food.get("description", ""),
        brand_name=food.get("brandName"),
        brand_owner=food.get("brandOwner"),
        data_type=food.get("dataType"),
        serving_size=food.get("servingSize"),
        serving_size_unit=food.get("servingSizeUnit"),
        household_serving_full_text=food.get("householdServingFullText"),
        calories=_nutrient(food, {"energy", "energy (kcal)"}),
        protein_g=_nutrient(food, {"protein"}),
        carbs_g=_nutrient(food, {"carbohydrate, by difference", "carbohydrate"}),
        fat_g=_nutrient(food, {"total lipid (fat)", "total fat"}),
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
    data_types = ["Branded"] if branded_only else ["Branded", "Foundation", "SR Legacy"]
    payload = _request(
        "foods/search",
        {"query": query, "dataType": data_types, "pageSize": 20, "pageNumber": 1},
    )
    return [_result(food) for food in payload.get("foods", [])], payload.get("totalHits", 0)


def get_food(fdc_id: int) -> FoodSearchResult:
    return _result(_request(f"food/{fdc_id}", {}))
