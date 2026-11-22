"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeal, createRecipe, getCurrentUser, listRecipes, logRecipe, searchFoods } from "@/lib/api";
import type { FoodSearchResult, MealType, Recipe } from "@/lib/types";


function getLocalDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

type Mode = "usda" | "manual" | "recipes";
type Ingredient = { food_name: string; quantity: number; unit: "g" | "oz" | "serving"; source_type: "fdc_branded" | "fdc_foundation" | "fdc_sr_legacy" | "user_entered"; fdc_id?: number; serving_size_grams?: number; calories_per_serving: number; protein_g_per_serving: number; carbs_g_per_serving: number; fat_g_per_serving: number };

function sourceType(food: FoodSearchResult): Ingredient["source_type"] { return food.data_type === "Branded" ? "fdc_branded" : food.data_type === "SR Legacy" ? "fdc_sr_legacy" : "fdc_foundation"; }

export default function NewMealPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("usda");
  const [query, setQuery] = useState("");
  const [branded, setBranded] = useState(false);
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeBuilder, setRecipeBuilder] = useState(false);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [savingMeal, setSavingMeal] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [manual, setManual] = useState({ food_name: "", serving_size: "1 serving", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [recipe, setRecipe] = useState({ name: "", instructions: "", servings: "1" });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [manualIngredient, setManualIngredient] = useState({ food_name: "", quantity: "1", unit: "serving" as Ingredient["unit"], calories: "", protein_g: "", carbs_g: "", fat_g: "" });

  useEffect(() => { getCurrentUser().catch(() => router.replace("/login")); }, [router]);
  useEffect(() => { if (mode === "recipes") listRecipes().then(setRecipes).catch((error) => setMessage(error.message)); }, [mode]);

  async function runSearch() {
    if (query.trim().length < 2) return;
    try { const result = await searchFoods(query, branded); setFoods(result.foods); setMessage(result.foods.length ? "Select an exact result." : "No match found. Try a broader search or use manual entry."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Search failed."); }
  }

  async function search(event: FormEvent) { event.preventDefault(); await runSearch(); }

  function addIngredient(food: FoodSearchResult) {
    setIngredients([...ingredients, { food_name: food.description, quantity: 1, unit: "serving", source_type: sourceType(food), fdc_id: food.fdc_id, serving_size_grams: food.nutrition_basis_grams, calories_per_serving: food.calories ?? 0, protein_g_per_serving: food.protein_g ?? 0, carbs_g_per_serving: food.carbs_g ?? 0, fat_g_per_serving: food.fat_g ?? 0 }]);
    setMessage(`${food.description} added to the recipe.`);
  }

  function addManualIngredient() {
    if (!manualIngredient.food_name) { setMessage("Enter a manual ingredient name."); return; }
    setIngredients([...ingredients, { food_name: manualIngredient.food_name, quantity: Number(manualIngredient.quantity), unit: manualIngredient.unit, source_type: "user_entered", serving_size_grams: manualIngredient.unit === "serving" ? 1 : 100, calories_per_serving: Number(manualIngredient.calories), protein_g_per_serving: Number(manualIngredient.protein_g), carbs_g_per_serving: Number(manualIngredient.carbs_g), fat_g_per_serving: Number(manualIngredient.fat_g) }]);
    setManualIngredient({ food_name: "", quantity: "1", unit: "serving", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  }

  async function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (savingRecipe) return;
    if (!recipe.name || !ingredients.length) { setMessage("Add a recipe name and at least one ingredient."); return; }
    setSavingRecipe(true);
    try {
      const savedRecipe = await createRecipe({
        name: recipe.name,
        instructions: recipe.instructions,
        servings: Number(recipe.servings),
        ingredients,
      });

      setRecipes((currentRecipes) => {
        const withoutDuplicate = currentRecipes.filter(
          (item) => item.id !== savedRecipe.id
        );

        return [...withoutDuplicate, savedRecipe];
      });

      setRecipeBuilder(false);
      setIngredients([]);
      setRecipe({
        name: "",
        instructions: "",
        servings: "1",
      });

      setMessage("Recipe saved successfully. You can now log it.");
      setMode("recipes");
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save recipe."); }
    finally { setSavingRecipe(false); }
  }

  async function logSelectedMeal() {
    if (savingMeal) return;
    const food = selected;
    const values = mode === "manual" ? { food_name: manual.food_name, serving_size: manual.serving_size, calories: Number(manual.calories), protein_g: Number(manual.protein_g), carbs_g: Number(manual.carbs_g), fat_g: Number(manual.fat_g) } : { food_name: food?.description ?? "", serving_size: food?.household_serving_full_text || `${food?.serving_size ?? "1"} serving`, calories: food?.calories ?? 0, protein_g: food?.protein_g ?? 0, carbs_g: food?.carbs_g ?? 0, fat_g: food?.fat_g ?? 0 };
    if (!values.food_name || Object.values(values).some((value) => typeof value === "number" && !Number.isFinite(value))) { setMessage("Complete the food and nutrition fields before saving."); return; }
    setSavingMeal(true);
    try { await createMeal({ ...values, meal_type: mealType, logged_date: getLocalDate(), quantity, source_type: mode === "manual" ? "user_entered" : sourceType(food!), fdc_id: mode === "manual" ? undefined : food?.fdc_id, brand_name: mode === "manual" ? undefined : food?.brand_name, brand_owner: mode === "manual" ? undefined : food?.brand_owner }); router.push("/dashboard"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save meal."); }
    finally { setSavingMeal(false); }
  }

  async function addRecipeToLog(recipeToLog: Recipe) {
    try { await logRecipe(recipeToLog.id, { meal_type: mealType, logged_date: getLocalDate(), servings: quantity }); router.push("/dashboard"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not log recipe."); }
  }

  return <main className="min-h-screen bg-green-50 px-6 py-10 text-gray-900"><div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
    <button type="button" onClick={() => router.back()} className="mb-5 text-sm text-green-700">← Back</button>
    <h1 className="text-3xl font-bold text-green-950">Log a meal</h1>
    <p className="mt-2 text-gray-600">Choose a USDA food, enter nutrition manually, or use one of your saved recipes.</p>
    <div className="mt-6 flex flex-wrap gap-3">{(["usda", "manual", "recipes"] as Mode[]).map((item) => <button type="button" key={item} onClick={() => { setMode(item); setSelected(null); setFoods([]); }} className={`rounded-full px-4 py-2 capitalize ${mode === item ? "bg-green-700 text-white" : "bg-gray-100"}`}>{item === "usda" ? "USDA search" : item === "manual" ? "Manual entry" : "Recipes"}</button>)}</div>
    {mode !== "recipes" && <form onSubmit={logSelectedMeal} className="mt-6 grid gap-4 sm:grid-cols-2"><label>Meal type<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className="mt-1 w-full rounded-xl border p-3">{["breakfast", "lunch", "dinner", "snack", "other"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label></form>}
    {mode === "usda" && <><form onSubmit={search} className="mt-6 flex flex-wrap gap-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={branded ? "e.g. McDonald's Big Mac" : "e.g. roma tomato"} className="min-w-0 flex-1 rounded-xl border p-3" /><button disabled={savingMeal} className="rounded-xl bg-green-700 px-5 font-medium text-white disabled:opacity-50">Search</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branded} onChange={(event) => setBranded(event.target.checked)} /> Branded/restaurant foods</label></form><p className="mt-2 text-xs text-gray-500">Ingredient search prioritizes raw USDA foods. Turn on branded search for restaurant or packaged items.</p><div className="mt-4 space-y-3">{foods.map((food) => <button type="button" key={food.fdc_id} onClick={() => setSelected(food)} className={`block w-full rounded-xl border p-4 text-left ${selected?.fdc_id === food.fdc_id ? "border-green-700 bg-green-50" : "border-gray-200"}`}><span className="font-semibold">{food.description}</span><span className="block text-sm text-gray-600">{food.brand_name || food.brand_owner || food.data_type || "USDA food"} · {food.household_serving_full_text || `${food.nutrition_basis_grams ?? 100} g basis`}</span><span className="block text-sm text-gray-600">{food.calories ?? "—"} kcal · P {food.protein_g ?? "—"}g · C {food.carbs_g ?? "—"}g · F {food.fat_g ?? "—"}g</span></button>)}</div><button type="button" disabled={!selected || savingMeal} onClick={() => void logSelectedMeal()} className="mt-5 rounded-xl bg-green-700 p-3 font-medium text-white disabled:bg-gray-300">{savingMeal ? "Saving..." : "Add selected food to log"}</button></>}
    {mode === "manual" && <><div className="mt-6 grid gap-3 sm:grid-cols-2">{(Object.keys(manual) as (keyof typeof manual)[]).map((field) => <input key={field} value={manual[field]} onChange={(event) => setManual({ ...manual, [field]: event.target.value })} placeholder={field.replaceAll("_", " ")} required className="rounded-xl border p-3" />)}</div><button type="button" disabled={savingMeal} onClick={() => void logSelectedMeal()} className="mt-5 rounded-xl bg-green-700 p-3 font-medium text-white disabled:opacity-50">{savingMeal ? "Saving..." : "Add manual food to log"}</button></>}
    {mode === "recipes" && <>{!recipeBuilder && <><button type="button" onClick={() => setRecipeBuilder(true)} className="mt-6 rounded-xl bg-green-700 px-5 py-3 font-medium text-white">Create new recipe</button><div className="mt-6 grid gap-4 md:grid-cols-2">{recipes.map((saved) => <div key={saved.id} className="rounded-2xl border p-5"><h2 className="font-semibold">{saved.name}</h2><p className="mt-1 text-sm text-gray-600">{saved.servings} servings · {Math.round(saved.calories_per_serving)} kcal per serving</p><p className="text-sm text-gray-600">P {Math.round(saved.protein_g_per_serving)}g · C {Math.round(saved.carbs_g_per_serving)}g · F {Math.round(saved.fat_g_per_serving)}g</p><button type="button" onClick={() => void addRecipeToLog(saved)} className="mt-4 rounded-xl bg-green-100 px-4 py-2 font-medium text-green-800">Add {quantity} serving(s) to log</button></div>)}</div>{!recipes.length && <p className="mt-6 text-gray-600">No saved recipes yet. Create your first one.</p>}</>}
      {recipeBuilder && <form onSubmit={saveRecipe} className="mt-6"><div className="grid gap-3 sm:grid-cols-2"><input value={recipe.name} onChange={(event) => setRecipe({ ...recipe, name: event.target.value })} placeholder="Recipe name" required className="rounded-xl border p-3" /><input type="number" min="0.1" step="0.1" value={recipe.servings} onChange={(event) => setRecipe({ ...recipe, servings: event.target.value })} placeholder="Number of servings" required className="rounded-xl border p-3" /></div><textarea value={recipe.instructions} onChange={(event) => setRecipe({ ...recipe, instructions: event.target.value })} placeholder="Optional instructions" className="mt-3 w-full rounded-xl border p-3" /><div className="mt-6 rounded-2xl bg-gray-50 p-4"><h2 className="font-semibold">Ingredients</h2><div className="mt-3 flex gap-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search raw ingredients" className="min-w-0 flex-1 rounded-xl border p-3" /><button type="button" onClick={() => void runSearch()} disabled={savingRecipe} className="rounded-xl bg-green-700 px-4 text-white disabled:opacity-50">Search</button></div><div className="mt-3 space-y-2">{foods.map((food) => <button type="button" key={food.fdc_id} onClick={() => addIngredient(food)} className="block w-full rounded-xl border bg-white p-3 text-left"><span className="font-medium">{food.description}</span><span className="block text-xs text-gray-500">{food.calories ?? "—"} kcal per {food.nutrition_basis === "100g" ? "100g" : "serving"}</span></button>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-3"><input value={manualIngredient.food_name} onChange={(event) => setManualIngredient({ ...manualIngredient, food_name: event.target.value })} placeholder="Manual ingredient" className="rounded-xl border p-3" /><input type="number" min="0.01" step="0.01" value={manualIngredient.quantity} onChange={(event) => setManualIngredient({ ...manualIngredient, quantity: event.target.value })} className="rounded-xl border p-3" /><select value={manualIngredient.unit} onChange={(event) => setManualIngredient({ ...manualIngredient, unit: event.target.value as Ingredient["unit"] })} className="rounded-xl border p-3"><option value="g">grams</option><option value="oz">ounces</option><option value="serving">servings</option></select></div><div className="mt-2 grid gap-2 sm:grid-cols-4"><input value={manualIngredient.calories} onChange={(event) => setManualIngredient({ ...manualIngredient, calories: event.target.value })} placeholder="Calories per basis" className="rounded-xl border p-3" /><input value={manualIngredient.protein_g} onChange={(event) => setManualIngredient({ ...manualIngredient, protein_g: event.target.value })} placeholder="Protein g" className="rounded-xl border p-3" /><input value={manualIngredient.carbs_g} onChange={(event) => setManualIngredient({ ...manualIngredient, carbs_g: event.target.value })} placeholder="Carbs g" className="rounded-xl border p-3" /><input value={manualIngredient.fat_g} onChange={(event) => setManualIngredient({ ...manualIngredient, fat_g: event.target.value })} placeholder="Fat g" className="rounded-xl border p-3" /></div><button type="button" onClick={addManualIngredient} disabled={savingRecipe} className="mt-3 rounded-xl border px-4 py-2 disabled:opacity-50">Add manual ingredient</button>{ingredients.map((ingredient, index) => <div key={`${ingredient.food_name}-${index}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_110px]"><span className="rounded-xl border bg-white p-3">{ingredient.food_name}</span><input type="number" min="0.01" step="0.01" value={ingredient.quantity} onChange={(event) => setIngredients(ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} className="rounded-xl border p-3" /><select value={ingredient.unit} onChange={(event) => setIngredients(ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value as Ingredient["unit"] } : item))} className="rounded-xl border p-3"><option value="g">grams</option><option value="oz">ounces</option><option value="serving">servings</option></select></div>)}</div><div className="mt-5 flex gap-3"><button type="submit" disabled={savingRecipe} className="rounded-xl bg-green-700 px-5 py-3 font-medium text-white disabled:opacity-50">{savingRecipe ? "Saving recipe..." : "Save recipe"}</button><button type="button" onClick={() => setRecipeBuilder(false)} disabled={savingRecipe} className="rounded-xl border px-5 py-3">Cancel</button></div></form>}
    </>}
    {message && <p className="mt-5 text-sm text-gray-600">{message}</p>}
  </div></main>;
}
