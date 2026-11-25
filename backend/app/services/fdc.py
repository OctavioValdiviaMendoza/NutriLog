import math
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.meal import FoodSearchResult
from app.services.food_search import (
    display_food_name,
    rank_search_result as _rank_search_result,
    retrieval_query,
)


class FdcUnavailableError(RuntimeError):
    pass


class FdcConfigurationError(RuntimeError):
    pass


def _nutrient(food: dict[str, Any], names: set[str]) -> float | None:
    for item in food.get("foodNutrients", []):
        nutrient = item.get("nutrient", item)
        name = str(nutrient.get("name") or item.get("nutrientName", "")).lower()
        unit = str(nutrient.get("unitName") or item.get("unitName", "")).lower()
        if "energy" in names and unit == "kj":
            continue
        if name in names or ("energy" in names and name.startswith("energy (atwater")):
            value = item.get("amount", item.get("value"))
            return float(value) if value is not None else None
    return None


def _result(food: dict[str, Any]) -> FoodSearchResult:
    data_type = food.get("dataType")
    serving_size = food.get("servingSize")
    serving_unit = str(food.get("servingSizeUnit", "")).lower()
    gram_serving = serving_size if serving_unit in {"g", "grm", "gm"} and serving_size and serving_size > 0 else None
    basis_size = serving_size if serving_unit in {"g", "grm", "gm", "ml"} and serving_size and serving_size > 0 else None
    branded_serving = data_type == "Branded" and bool(basis_size or food.get("labelNutrients"))
    names = {"calories": {"energy", "energy (kcal)"}, "protein_g": {"protein"}, "carbs_g": {"carbohydrate, by difference", "carbohydrate"}, "fat_g": {"total lipid (fat)", "total fat"}}
    label_keys = {"calories": "calories", "protein_g": "protein", "carbs_g": "carbohydrates", "fat_g": "fat"}
    nutrients = {}
    for key, nutrient_names in names.items():
        value = _nutrient(food, nutrient_names)
        if branded_serving:
            label_value = food.get("labelNutrients", {}).get(label_keys[key], {}).get("value")
            value = label_value if label_value is not None else value * basis_size / 100 if value is not None and basis_size else None
        nutrients[key] = value
    portions = []
    for index, portion in enumerate(food.get("foodPortions", [])):
        grams = portion.get("gramWeight")
        if not isinstance(grams, (int, float)) or not math.isfinite(grams) or grams <= 0:
            continue
        measure = portion.get("measureUnit", {}).get("name", "")
        label = portion.get("portionDescription") or " ".join(str(part) for part in (portion.get("amount", 1), measure if measure not in {"undetermined", ""} else "", portion.get("modifier", "")) if part != "")
        portions.append({"id": index, "label": label, "grams": grams})
    return FoodSearchResult(
        fdc_id=food["fdcId"],
        description=food.get("description", ""),
        display_name=display_food_name(food.get("description", ""), data_type == "Branded"),
        brand_name=food.get("brandName"),
        brand_owner=food.get("brandOwner"),
        data_type=data_type,
        serving_size=food.get("servingSize"),
        serving_size_unit=food.get("servingSizeUnit"),
        household_serving_full_text=food.get("householdServingFullText"),
        **nutrients,
        nutrition_basis="serving" if branded_serving else "100g",
        nutrition_basis_grams=gram_serving if branded_serving else 100,
        portions=portions,
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
        {"query": retrieval_query(query), "dataType": data_types, "pageSize": 100, "pageNumber": 1},
    )
    foods = payload.get("foods", [])
    ranked = [(score, food) for food in foods if (score := _rank_search_result(food, query)) is not None]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [_result(food) for _, food in ranked[:10]], payload.get("totalHits", 0)


def get_food(fdc_id: int) -> FoodSearchResult:
    return _result(_request(f"food/{fdc_id}", {}))
