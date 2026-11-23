"""Rank USDA records by food identity, preparation, and requested processing.

These rules choose and label records; they never combine records or alter nutrition.
"""

import re
from typing import Any

STOP_WORDS = {"a", "an", "the", "and", "of", "with", "or"}
WORD_ALIASES = {
    "breasts": "breast", "thighs": "thigh", "tenders": "tender",
    "nuggets": "nugget", "patties": "patty", "potatoes": "potato",
    "tomatoes": "tomato", "apples": "apple", "beans": "bean",
    "carrots": "carrot", "eggs": "egg", "onions": "onion",
    "peppers": "pepper", "peas": "pea", "oats": "oat",
    "strawberries": "strawberry", "blueberries": "blueberry",
    "garbanzo": "chickpea", "chickpeas": "chickpea",
    "barbecued": "barbecue", "bbq": "barbecue",
    "noodles": "noodle", "cereals": "cereal", "crackers": "cracker",
    "cakes": "cake", "chips": "chip", "mixes": "mix",
    "roast": "roasted", "grill": "grilled", "bake": "baked",
    "boil": "boiled", "steam": "steamed",
}
METHODS = {"roasted", "grilled", "baked", "boiled", "steamed", "stewed", "fried", "sauteed", "broiled", "poached", "microwaved", "barbecue", "braised", "simmered"}
PROCESSED = {"breaded", "battered", "tender", "nugget", "patty", "sausage", "deli", "sauce", "ketchup", "paste", "juice", "soup", "stuffed", "sweetened", "noodle", "pasta", "cereal", "flour", "cracker", "cake", "bread", "chip", "pudding", "mix"}
DESCRIPTORS = METHODS | PROCESSED | {"raw", "cooked", "skinless", "withskin", "boneless", "plain"}


def normalize_search_text(value: str) -> str:
    value = re.sub(r"['’]", "", value.lower())
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value).split())


def _tokens(text: str) -> set[str]:
    text = normalize_search_text(text)
    text = re.sub(r"\b(?:without skin|skin not eaten|meat only)\b", "skinless", text)
    text = re.sub(r"\b(?:with skin|meat and skin)\b", "withskin", text)
    text = re.sub(r"\b(?:no added sugar|unsweetened)\b", "unsweetened", text)
    return {WORD_ALIASES.get(word, word) for word in text.split()} - STOP_WORDS


def retrieval_query(query: str) -> str:
    """Keep USDA's search broad enough to retrieve descriptor synonyms."""
    normalized = normalize_search_text(query)
    normalized = re.sub(r"\b(?:skinless|boneless|without skin|with skin|meat only)\b", " ", normalized)
    return " ".join(normalized.split()) or normalize_search_text(query)


def rank_search_result(food: dict[str, Any], query: str) -> int | None:
    requested = _tokens(query)
    if not requested:
        return None
    description = str(food.get("description") or "")
    actual = _tokens(description)
    brand = _tokens(f"{food.get('brandName') or ''} {food.get('brandOwner') or ''}")
    identity = requested - DESCRIPTORS
    if not identity <= actual | brand:
        return None

    cooked = bool(actual & (METHODS | {"cooked"}))
    if "raw" in requested and ("raw" not in actual or cooked):
        return None
    if requested & (METHODS | {"cooked"}) and (not cooked or "raw" in actual):
        return None
    if not (requested & METHODS) <= actual:
        return None
    if not (requested & {"skinless", "withskin", "boneless"}) <= actual:
        return None
    if not (requested & PROCESSED) <= actual:
        return None

    score = 100 + 20 * len(identity & actual) + 10 * len(requested & brand)
    if normalize_search_text(query) in normalize_search_text(description):
        score += 35
    # Processing differences outweigh a coincidental phrase match or short name.
    unrequested_forms = (actual & PROCESSED) - requested
    # USDA files plain oats under "Cereals" as well as prepared breakfast foods.
    if identity & {"oat", "oatmeal"}:
        unrequested_forms -= {"cereal"}
    score -= 100 * len(unrequested_forms)
    if "fried" in actual and "fried" not in requested:
        score -= 70
    if "withskin" not in requested:
        score += 15 if "skinless" in actual else -20 if "withskin" in actual else 0
    if "raw" in actual and not requested & (METHODS | {"cooked"}):
        score += 10
    return score - min(len(description), 300) // 75


def display_food_name(description: str, branded: bool = False) -> str:
    """Build a compact label without guessing or dropping food-specific modifiers."""
    if branded:
        return description.strip()
    if "," not in description:
        return description.strip()
    segments = [part.strip() for part in description.split(",") if part.strip()]
    segments = [part for part in segments if part.lower() not in {"broilers or fryers", "broiler or fryers", "all classes"}]
    if not segments:
        return description
    if segments[0].lower() == "fish" and len(segments) > 1:
        segments.pop(0)
    if len(segments) > 1 and segments[1].lower() in {"breast", "thigh", "wing", "leg", "drumstick"}:
        segments[:2] = [f"{segments[0]} {segments[1]}"]
    base, *modifiers = segments
    methods = [part.lower() for part in modifiers if part.lower() in METHODS]
    if methods:
        modifiers = [part for part in modifiers if part.lower() != "cooked" and part.lower() not in METHODS]
        base = f"{', '.join(methods)} {base}"
    elif any(part.lower() in {"cooked", "raw"} for part in modifiers):
        state = next(part.lower() for part in modifiers if part.lower() in {"cooked", "raw"})
        modifiers = [part for part in modifiers if part.lower() != state]
        base = f"{state} {base}"

    # Move grain type into the name; keep length, enrichment, and other qualifiers.
    if base.lower().endswith("rice"):
        grain = next((part for part in modifiers if part.lower() in {"brown", "white", "wild"}), None)
        if grain:
            modifiers.remove(grain)
            base = f"{base[:-4]}{grain.lower()} rice"
    normalized = {part.lower() for part in modifiers}
    if "skinless" in normalized and "meat only" in normalized:
        modifiers = [part for part in modifiers if part.lower() != "meat only"]
    # Only explicitly stated attributes are used; "meat only" is not expanded.
    attributes = [part.lower() for part in modifiers if part.lower() in {"skinless", "boneless"}]
    modifiers = [part for part in modifiers if part.lower() not in {"skinless", "boneless"}]
    if attributes:
        modifiers.insert(0, ", ".join(dict.fromkeys(attributes)))
    parts = [base, *modifiers]
    return " · ".join(part[0].upper() + part[1:].lower() for part in dict.fromkeys(parts))
