"""Default food labels and their names in FoodSeg103."""

# Keep this order consistent when preparing data or showing an unloaded model.
DEFAULT_CANDIDATES: dict[str, tuple[str, ...]] = {
    "rice": ("rice",),
    "bread": ("bread",),
    "noodles": ("noodles", "pasta"),
    "potatoes": ("potato", "potatoes"),
    "broccoli": ("broccoli",),
    "carrots": ("carrot", "carrots"),
    "tomatoes": ("tomato", "tomatoes"),
    "lettuce": ("lettuce", "salad"),
    "eggs": ("egg", "eggs"),
    "fish": ("fish",),
    "steak": ("steak", "beef"),
    "poultry": ("chicken", "duck", "poultry", "chicken/duck"),
}
