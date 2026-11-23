import pytest

from app.services import fdc


def food_data(**overrides):
    return {"fdcId": 123, "description": "Tomato, raw", "dataType": "Foundation", "foodNutrients": [
        {"nutrientName": "Energy", "unitName": "kcal", "value": 20},
        {"nutrientName": "Protein", "value": 1},
        {"nutrientName": "Carbohydrate, by difference", "value": 4},
        {"nutrientName": "Total lipid (fat)", "value": 0.2},
    ], **overrides}


def test_branded_nutrition_converts_100g_to_label_serving():
    food = fdc._result(food_data(dataType="Branded", servingSize=180, servingSizeUnit="g"))
    assert food.nutrition_basis == "serving"
    assert food.calories == 36
    assert food.protein_g == 1.8


def test_branded_label_values_are_not_scaled_twice():
    food = fdc._result(food_data(dataType="Branded", servingSize=180, servingSizeUnit="g", labelNutrients={"calories": {"value": 400}}))
    assert food.calories == 400


def test_volume_label_does_not_invent_gram_weight():
    food = fdc._result(food_data(dataType="Branded", servingSize=240, servingSizeUnit="ml"))
    assert food.nutrition_basis == "serving"
    assert food.nutrition_basis_grams is None
    assert food.calories == 48


def test_portions_include_only_verified_gram_weights():
    food = fdc._result(food_data(foodPortions=[
        {"amount": 1, "measureUnit": {"name": "cup"}, "gramWeight": 180},
        {"amount": 1, "measureUnit": {"name": "cup"}},
    ]))
    assert [(p.label, p.grams) for p in food.portions] == [("1 cup", 180)]


def test_search_rejects_chickpeas_and_matches_brand_fields(monkeypatch):
    monkeypatch.setattr(fdc, "_request", lambda *args: {"foods": [
        food_data(description="CHICK PEAS", brandName="GRANORO"),
        food_data(fdcId=456, description="Chicken Sandwich", brandOwner="CHICK-FIL-A"),
    ]})
    foods, _ = fdc.search_foods("Chick-fil-A sandwich", True)
    assert [food.fdc_id for food in foods] == [456]


@pytest.mark.parametrize("query,description", [("ham", "hamburger"), ("raw tomato", "tomato sauce")])
def test_search_rejects_substring_and_missing_term_matches(query, description):
    assert fdc._rank_search_result({"description": description}, query) is None
