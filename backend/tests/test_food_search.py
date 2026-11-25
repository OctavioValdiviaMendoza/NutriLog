import pytest

from app.services.food_search import display_food_name, rank_search_result, retrieval_query
from app.services import fdc


def score(description, query):
    return rank_search_result({"description": description}, query)


@pytest.mark.parametrize("query,plain,processed", [
    ("chicken breast cooked", "Chicken, broilers or fryers, breast, meat only, cooked, roasted", "Chicken breast tenders, breaded, cooked, microwaved"),
    ("salmon cooked", "Salmon, cooked, grilled", "Salmon patties, breaded, cooked"),
    ("potato cooked", "Potatoes, boiled, cooked", "Potato, cooked, fried"),
    ("rice cooked", "Rice, cooked", "Rice, cooked, fried"),
    ("rice cooked", "Rice, white, long-grain, enriched, cooked", "Rice noodles, cooked"),
    ("rice cooked", "Rice, white, long-grain, cooked", "Cereals, CREAM OF RICE, cooked with water"),
    ("wheat", "Wheat, hard red winter", "Wheat flour, whole-grain"),
    ("tomato", "Tomatoes, raw", "Tomato sauce"),
    ("apple", "Apples, raw, with skin", "Apple juice"),
    ("carrot", "Carrots, cooked, boiled", "Carrot soup, cooked"),
])
def test_plain_food_outranks_unrequested_processing(query, plain, processed):
    assert score(plain, query) > score(processed, query)


@pytest.mark.parametrize("query,description", [
    ("rice cooked", "Rice, raw"),
    ("salmon raw", "Salmon, cooked, grilled"),
    ("chicken breast grilled", "Chicken breast, cooked, roasted"),
    ("chicken breast skinless", "Chicken breast, meat and skin, cooked"),
    ("apple unsweetened", "Apple sauce, sweetened"),
    ("brown rice", "Rice, white, cooked"),
    ("ham", "Hamburger, cooked"),
])
def test_explicit_preferences_and_food_identity_are_not_silently_changed(query, description):
    assert score(description, query) is None


@pytest.mark.parametrize("query,description", [
    ("chicken breast skinless cooked", "Chicken, breast, meat only, cooked, roasted"),
    ("salmon cooked", "Salmon, steamed"),
    ("baked potato", "Potatoes, baked, flesh and skin"),
    ("fried rice", "Rice, cooked, fried"),
    ("chicken tenders breaded", "Chicken breast tenders, breaded, cooked"),
    ("tomato sauce", "Tomatoes, sauce"),
    ("rice noodles cooked", "Rice noodles, cooked"),
    ("wheat flour", "Wheat flour, whole-grain"),
])
def test_requested_methods_forms_and_synonyms_are_supported(query, description):
    assert score(description, query) is not None


def test_readable_names_preserve_differences_and_original_record():
    description = "Chicken, broilers or fryers, breast, meat only, cooked, roasted"
    result = fdc._result({"fdcId": 123, "description": description, "dataType": "SR Legacy"})
    assert result.display_name == "Roasted chicken breast · Meat only"
    assert result.description == description
    assert result.fdc_id == 123
    assert "Meat and skin" in display_food_name("Chicken, breast, meat and skin, cooked")
    assert "Breaded" in display_food_name("Chicken breast tenders, breaded, cooked")
    assert "brown rice" in display_food_name("Rice, brown, long-grain, cooked")


def test_branded_names_preserve_capitalization():
    assert display_food_name("Brand X BBQ Chicken", branded=True) == "Brand X BBQ Chicken"


def test_skinless_query_retrieves_usda_meat_only_candidates():
    assert retrieval_query("skinless chicken breast cooked") == "chicken breast cooked"


def test_search_applies_semantic_ranking_before_top_ten_cutoff(monkeypatch):
    processed = [{"fdcId": index, "description": "Chicken breast tenders, breaded, cooked"} for index in range(12)]
    plain = {"fdcId": 999, "description": "Chicken, breast, meat only, cooked, roasted"}
    monkeypatch.setattr(fdc, "_request", lambda *args: {"foods": processed + [plain]})
    results, _ = fdc.search_foods("chicken breast cooked")
    assert results[0].fdc_id == 999
    assert len(results) == 10
