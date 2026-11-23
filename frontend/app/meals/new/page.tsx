"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  analyzeMealPhoto,
  createMeal,
  logUsdaFood,
  createRecipe,
  deleteRecipe,
  getCurrentUser,
  listRecipes,
  logRecipe,
  searchFoods,
  updateRecipe,
} from "@/lib/api";
import AppShell from "@/components/AppShell";
import PhotoMealCapture, { type MealPhotoDraft } from "@/components/PhotoMealCapture";
import PhotoMealReview from "@/components/PhotoMealReview";
import FoodSearchPicker, {
  basisLabel,
  type FoodSelection,
} from "@/components/FoodSearchPicker";
import type {
  FoodSearchResult,
  MealType,
  PhotoAnalyzeResponse,
  Recipe,
} from "@/lib/types";

function getLocalDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

type Mode = "usda" | "manual" | "recipes" | "photo";
type Ingredient = {
  food_name: string;
  quantity: number;
  unit: "g" | "oz" | "serving";
  source_type:
    "fdc_branded" | "fdc_foundation" | "fdc_sr_legacy" | "user_entered";
  fdc_id?: number;
  serving_size_grams?: number;
  calories_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
};

function sourceType(food: FoodSearchResult): Ingredient["source_type"] {
  return food.data_type === "Branded"
    ? "fdc_branded"
    : food.data_type === "SR Legacy"
      ? "fdc_sr_legacy"
      : "fdc_foundation";
}

export default function NewMealPage() {
  return (
    <Suspense fallback={<p className="p-6">Loading meal logger…</p>}>
      <NewMealContent />
    </Suspense>
  );
}

function NewMealContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("usda");
  const [photo, setPhoto] = useState<MealPhotoDraft | null>(null);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalyzeResponse | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoAnalyzeError, setPhotoAnalyzeError] = useState("");
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [usdaSelection, setUsdaSelection] = useState<FoodSelection | null>(
    null,
  );
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeBuilder, setRecipeBuilder] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [savingMeal, setSavingMeal] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [loggedDate, setLoggedDate] = useState("");
  const [manual, setManual] = useState({
    food_name: "",
    serving_size: "1 serving",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [recipe, setRecipe] = useState({
    name: "",
    instructions: "",
    servings: "1",
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [manualIngredient, setManualIngredient] = useState({
    food_name: "",
    quantity: "1",
    unit: "serving" as Ingredient["unit"],
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });

  // Keep the preview across logging-method switches; release it on replacement or navigation.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);

  useEffect(() => {
    getCurrentUser()
      .then(() => {
        const queryDate = searchParams.get("date");
        const queryMode = searchParams.get("mode");
        setMode(queryMode === "recipes" || queryMode === "manual" || queryMode === "photo" ? queryMode : "usda");
        setLoggedDate(queryDate ?? getLocalDate());
      })
      .catch(() => router.replace("/login"));
  }, [router, searchParams]);
  useEffect(() => {
    if (mode === "recipes")
      listRecipes()
        .then(setRecipes)
        .catch((error) => setMessage(error.message));
  }, [mode]);

  async function runSearch(searchBranded = false) {
    if (query.trim().length < 2) {
      setMessage("Enter at least two characters to search.");
      return;
    }
    try {
      const result = await searchFoods(query, searchBranded);
      setFoods(result.foods);
      setMessage(
        result.foods.length
          ? "Select an exact result."
          : "No match found. Try a broader search or use manual entry.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    }
  }

  function addIngredient(food: FoodSearchResult) {
    setIngredients((current) => [
      ...current,
      {
        food_name: food.description,
        quantity: food.nutrition_basis === "100g" ? 100 : 1,
        unit: food.nutrition_basis === "100g" ? "g" : "serving",
        source_type: sourceType(food),
        fdc_id: food.fdc_id,
        serving_size_grams: food.nutrition_basis_grams,
        calories_per_serving: food.calories ?? 0,
        protein_g_per_serving: food.protein_g ?? 0,
        carbs_g_per_serving: food.carbs_g ?? 0,
        fat_g_per_serving: food.fat_g ?? 0,
      },
    ]);
    setMessage(`${food.description} added to the recipe.`);
  }

  function addManualIngredient() {
    const numericValues = [
      manualIngredient.quantity,
      manualIngredient.calories,
      manualIngredient.protein_g,
      manualIngredient.carbs_g,
      manualIngredient.fat_g,
    ].map(Number);
    if (
      !manualIngredient.food_name.trim() ||
      numericValues.some((value) => !Number.isFinite(value) || value < 0) ||
      numericValues[0] <= 0
    ) {
      setMessage(
        "Enter an ingredient name, a positive amount, and valid nutrition values.",
      );
      return;
    }
    setIngredients((current) => [
      ...current,
      {
        food_name: manualIngredient.food_name.trim(),
        quantity: numericValues[0],
        unit: manualIngredient.unit,
        source_type: "user_entered",
        serving_size_grams: manualIngredient.unit === "serving" ? 1 : 100,
        calories_per_serving: numericValues[1],
        protein_g_per_serving: numericValues[2],
        carbs_g_per_serving: numericValues[3],
        fat_g_per_serving: numericValues[4],
      },
    ]);
    setManualIngredient({
      food_name: "",
      quantity: "1",
      unit: "serving",
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
    });
  }

  async function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (savingRecipe) return;
    const servings = Number(recipe.servings);
    if (
      !recipe.name.trim() ||
      !Number.isFinite(servings) ||
      servings <= 0 ||
      !ingredients.length ||
      ingredients.some(
        (ingredient) =>
          !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0,
      )
    ) {
      setMessage(
        "Add a recipe name, a positive serving count, and valid ingredient amounts.",
      );
      return;
    }
    setSavingRecipe(true);
    try {
      const payload = {
        name: recipe.name.trim(),
        instructions: recipe.instructions,
        servings,
        ingredients,
      };
      const savedRecipe = editingRecipe
        ? await updateRecipe(editingRecipe.id, payload)
        : await createRecipe(payload);

      setRecipes((currentRecipes) => {
        const withoutDuplicate = currentRecipes.filter(
          (item) => item.id !== savedRecipe.id,
        );

        return [...withoutDuplicate, savedRecipe];
      });

      closeBuilder();

      setMessage("Recipe saved successfully. You can now log it.");
      setMode("recipes");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save recipe.",
      );
    } finally {
      setSavingRecipe(false);
    }
  }

  function closeBuilder() {
    setRecipeBuilder(false);
    setEditingRecipe(null);
    setIngredients([]);
    setRecipe({ name: "", instructions: "", servings: "1" });
    setManualIngredient({
      food_name: "",
      quantity: "1",
      unit: "serving",
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
    });
  }

  async function logSelectedMeal() {
    if (savingMeal || (mode !== "usda" && mode !== "manual")) return;
    if (mode === "usda") {
      if (
        !usdaSelection ||
        !Number.isFinite(usdaSelection.amount) ||
        usdaSelection.amount <= 0
      ) {
        setMessage("Choose a food and a positive portion amount.");
        return;
      }
      setSavingMeal(true);
      try {
        const { food, ...portion } = usdaSelection;
        await logUsdaFood({
          ...portion,
          fdc_id: food.fdc_id,
          meal_type: mealType,
          logged_date: loggedDate || getLocalDate(),
        });
        router.push("/dashboard");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not log food.",
        );
      } finally {
        setSavingMeal(false);
      }
      return;
    }
    const values = {
      food_name: manual.food_name.trim(),
      serving_size: manual.serving_size,
      calories: Number(manual.calories),
      protein_g: Number(manual.protein_g),
      carbs_g: Number(manual.carbs_g),
      fat_g: Number(manual.fat_g),
    };
    if (
      !values.food_name ||
      Object.values(values).some(
        (value) => typeof value === "number" && !Number.isFinite(value),
      )
    ) {
      setMessage("Complete the food and nutrition fields before saving.");
      return;
    }
    setSavingMeal(true);
    try {
      await createMeal({
        ...values,
        meal_type: mealType,
        logged_date: loggedDate || getLocalDate(),
        quantity,
        source_type: "user_entered",
      });
      router.push("/dashboard");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save meal.",
      );
    } finally {
      setSavingMeal(false);
    }
  }

  function startEditingRecipe(saved: Recipe) {
    setEditingRecipe(saved);
    setRecipe({
      name: saved.name,
      instructions: saved.instructions ?? "",
      servings: String(saved.servings),
    });
    setIngredients(
      saved.ingredients.map((ingredient) => ({
        food_name: ingredient.food_name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        source_type: ingredient.source_type,
        fdc_id: ingredient.fdc_id,
        serving_size_grams: ingredient.serving_size_grams,
        calories_per_serving: ingredient.calories_per_serving ?? 0,
        protein_g_per_serving: ingredient.protein_g_per_serving ?? 0,
        carbs_g_per_serving: ingredient.carbs_g_per_serving ?? 0,
        fat_g_per_serving: ingredient.fat_g_per_serving ?? 0,
      })),
    );
    setFoods([]);
    setQuery("");
    setMessage("");
    setRecipeBuilder(true);
  }

  async function removeRecipe(saved: Recipe) {
    if (!window.confirm(`Delete ${saved.name}?`)) return;
    try {
      await deleteRecipe(saved.id);
      setRecipes((currentRecipes) =>
        currentRecipes.filter((item) => item.id !== saved.id),
      );
      setMessage("Recipe deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete recipe.",
      );
    }
  }

  async function addRecipeToLog(recipeToLog: Recipe) {
    if (savingMeal || !Number.isFinite(quantity) || quantity <= 0) return;
    setSavingMeal(true);
    try {
      await logRecipe(recipeToLog.id, {
        meal_type: mealType,
        logged_date: loggedDate || getLocalDate(),
        servings: quantity,
      });
      router.push("/dashboard");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not log recipe.",
      );
    } finally {
      setSavingMeal(false);
    }
  }

  async function handleAnalyzePhoto() {
    if (!photo || analyzingPhoto) return;
    setAnalyzingPhoto(true);
    setPhotoAnalyzeError("");
    setPhotoAnalysis(null);
    try {
      const result = await analyzeMealPhoto(photo.file);
      setPhotoAnalysis(result);
    } catch (error) {
      setPhotoAnalyzeError(
        error instanceof Error
          ? error.message
          : "Could not analyze this photo. Please try again or use USDA search.",
      );
    } finally {
      setAnalyzingPhoto(false);
    }
  }

  return (
    <AppShell activeSection={mode === "recipes" ? "recipes" : "meals"}>
      <main className="min-h-screen bg-slate-50 px-3 py-5 text-gray-900 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-5 text-sm text-green-700"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-green-950">Log a meal</h1>
          <p className="mt-2 text-gray-600">
            Search USDA foods, enter nutrition, use a saved recipe, or log from a
            meal photo.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {(["usda", "manual", "recipes", "photo"] as Mode[]).map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  setMode(item);
                  setMessage("");
                  setUsdaSelection(null);
                  setFoods([]);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("mode", item);
                  params.set("date", loggedDate || getLocalDate());
                  router.replace(`/meals/new?${params.toString()}`, {
                    scroll: false,
                  });
                }}
                aria-pressed={mode === item}
                className={`min-h-11 rounded-full px-4 py-2 capitalize ${mode === item ? "bg-green-700 text-white" : "bg-gray-100"}`}
              >
                {item === "usda"
                  ? "USDA search"
                  : item === "manual"
                    ? "Manual entry"
                    : item === "photo"
                      ? "Photo"
                      : "Recipes"}
              </button>
            ))}
          </div>
          <div
            className={`mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 ${mode === "usda" || mode === "photo" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
          >
            <label className="text-sm font-medium">
              Meal type
              <select
                value={mealType}
                onChange={(event) =>
                  setMealType(event.target.value as MealType)
                }
                className="mt-1 w-full rounded-xl border bg-white p-3 font-normal"
              >
                {["breakfast", "lunch", "dinner", "snack", "other"].map(
                  (type) => (
                    <option key={type}>{type}</option>
                  ),
                )}
              </select>
            </label>
            {(mode === "manual" || mode === "recipes") && (
              <label className="text-sm font-medium">
                {mode === "recipes" ? "Recipe servings" : "Quantity"}
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border bg-white p-3 font-normal"
                />
              </label>
            )}
            <label className="text-sm font-medium">
              Date
              <input
                type="date"
                value={loggedDate}
                onChange={(event) => setLoggedDate(event.target.value)}
                className="mt-1 w-full rounded-xl border bg-white p-3 font-normal"
              />
            </label>
          </div>
          {mode === "photo" && (
            <>
              <PhotoMealCapture
                photo={photo}
                onChange={(nextPhoto) => {
                  setPhoto(nextPhoto);
                  setPhotoAnalysis(null);
                  setPhotoAnalyzeError("");
                }}
                onAnalyze={() => void handleAnalyzePhoto()}
                analyzing={analyzingPhoto}
                analyzeError={photoAnalyzeError}
              />
              {photoAnalysis && (
                <PhotoMealReview
                  key={`${photo?.previewUrl ?? "none"}-${photoAnalysis.model_version}`}
                  analysis={photoAnalysis}
                  mealType={mealType}
                  loggedDate={loggedDate || getLocalDate()}
                  onLogged={() => router.push("/dashboard")}
                />
              )}
            </>
          )}
          {mode === "usda" && (
            <>
              <FoodSearchPicker
                onChange={setUsdaSelection}
                disabled={savingMeal}
              />
              <button
                type="button"
                disabled={!usdaSelection || savingMeal}
                onClick={() => void logSelectedMeal()}
                className="mt-5 rounded-xl bg-green-700 p-3 font-medium text-white disabled:bg-gray-300"
              >
                {savingMeal ? "Saving..." : "Add selected food to log"}
              </button>
            </>
          )}
          {mode === "manual" && (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {(Object.keys(manual) as (keyof typeof manual)[]).map(
                  (field) => (
                    <input
                      key={field}
                      value={manual[field]}
                      onChange={(event) =>
                        setManual({ ...manual, [field]: event.target.value })
                      }
                      placeholder={field.replaceAll("_", " ")}
                      required
                      className="rounded-xl border p-3"
                    />
                  ),
                )}
              </div>
              <button
                type="button"
                disabled={savingMeal}
                onClick={() => void logSelectedMeal()}
                className="mt-5 rounded-xl bg-green-700 p-3 font-medium text-white disabled:opacity-50"
              >
                {savingMeal ? "Saving..." : "Add manual food to log"}
              </button>
            </>
          )}
          {mode === "recipes" && (
            <>
              {!recipeBuilder && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecipe(null);
                      setIngredients([]);
                      setRecipeBuilder(true);
                    }}
                    className="mt-6 rounded-xl bg-green-700 px-5 py-3 font-medium text-white"
                  >
                    Create new recipe
                  </button>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {recipes.map((saved) => (
                      <div key={saved.id} className="rounded-2xl border p-5">
                        <h2 className="font-semibold">{saved.name}</h2>
                        <p className="mt-1 text-sm text-gray-600">
                          {saved.servings} servings ·{" "}
                          {Math.round(saved.calories_per_serving)} kcal per
                          serving
                        </p>
                        <p className="text-sm text-gray-600">
                          P {Math.round(saved.protein_g_per_serving)}g · C{" "}
                          {Math.round(saved.carbs_g_per_serving)}g · F{" "}
                          {Math.round(saved.fat_g_per_serving)}g
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void addRecipeToLog(saved)}
                            disabled={savingMeal}
                            className="min-h-11 rounded-xl bg-green-100 px-4 py-2 font-medium text-green-800 disabled:opacity-50"
                          >
                            Add {quantity} serving(s) to log
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditingRecipe(saved)}
                            className="rounded-xl border px-4 py-2 font-medium text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeRecipe(saved)}
                            className="rounded-xl border border-red-200 px-4 py-2 font-medium text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!recipes.length && (
                    <p className="mt-6 text-gray-600">
                      No saved recipes yet. Create your first one.
                    </p>
                  )}
                </>
              )}
              {recipeBuilder && (
                <form onSubmit={saveRecipe} className="mt-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={recipe.name}
                      onChange={(event) =>
                        setRecipe({ ...recipe, name: event.target.value })
                      }
                      placeholder="Recipe name"
                      required
                      className="rounded-xl border p-3"
                    />
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={recipe.servings}
                      onChange={(event) =>
                        setRecipe({ ...recipe, servings: event.target.value })
                      }
                      placeholder="Number of servings"
                      required
                      className="rounded-xl border p-3"
                    />
                  </div>
                  <textarea
                    value={recipe.instructions}
                    onChange={(event) =>
                      setRecipe({ ...recipe, instructions: event.target.value })
                    }
                    placeholder="Optional instructions"
                    className="mt-3 w-full rounded-xl border p-3"
                  />
                  <div className="mt-6 rounded-2xl bg-gray-50 p-4">
                    <h2 className="font-semibold">
                      {editingRecipe ? "Edit ingredients" : "Ingredients"}
                    </h2>
                    <div className="mt-3 flex gap-3">
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search raw ingredients"
                        className="min-w-0 flex-1 rounded-xl border p-3"
                      />
                      <button
                        type="button"
                        onClick={() => void runSearch(false)}
                        disabled={savingRecipe}
                        className="rounded-xl bg-green-700 px-4 text-white disabled:opacity-50"
                      >
                        Search
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {foods.map((food) => (
                        <button
                          type="button"
                          key={food.fdc_id}
                          onClick={() => addIngredient(food)}
                          className="block w-full rounded-xl border bg-white p-3 text-left"
                        >
                          <span className="font-medium">
                            {food.display_name || food.description}
                          </span>
                          <span className="my-1 inline-block rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                            {basisLabel(food)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {food.calories ?? "—"} kcal per{" "}
                            {food.nutrition_basis === "100g"
                              ? "100g"
                              : "serving"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <input
                        value={manualIngredient.food_name}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            food_name: event.target.value,
                          })
                        }
                        placeholder="Manual ingredient"
                        className="rounded-xl border p-3"
                      />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manualIngredient.quantity}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            quantity: event.target.value,
                          })
                        }
                        className="rounded-xl border p-3"
                      />
                      <select
                        value={manualIngredient.unit}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            unit: event.target.value as Ingredient["unit"],
                          })
                        }
                        className="rounded-xl border p-3"
                      >
                        <option value="g">grams</option>
                        <option value="oz">ounces</option>
                        <option value="serving">servings</option>
                      </select>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <input
                        value={manualIngredient.calories}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            calories: event.target.value,
                          })
                        }
                        placeholder="Calories per basis"
                        className="rounded-xl border p-3"
                      />
                      <input
                        value={manualIngredient.protein_g}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            protein_g: event.target.value,
                          })
                        }
                        placeholder="Protein g"
                        className="rounded-xl border p-3"
                      />
                      <input
                        value={manualIngredient.carbs_g}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            carbs_g: event.target.value,
                          })
                        }
                        placeholder="Carbs g"
                        className="rounded-xl border p-3"
                      />
                      <input
                        value={manualIngredient.fat_g}
                        onChange={(event) =>
                          setManualIngredient({
                            ...manualIngredient,
                            fat_g: event.target.value,
                          })
                        }
                        placeholder="Fat g"
                        className="rounded-xl border p-3"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addManualIngredient}
                      disabled={savingRecipe}
                      className="mt-3 rounded-xl border px-4 py-2 disabled:opacity-50"
                    >
                      Add manual ingredient
                    </button>
                    {ingredients.map((ingredient, index) => (
                      <div
                        key={`${ingredient.food_name}-${index}`}
                        className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_110px_auto]"
                      >
                        <span className="rounded-xl border bg-white p-3">
                          {ingredient.food_name}
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={ingredient.quantity}
                          onChange={(event) =>
                            setIngredients(
                              ingredients.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      quantity: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="rounded-xl border p-3"
                        />
                        <select
                          value={ingredient.unit}
                          onChange={(event) =>
                            setIngredients(
                              ingredients.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      unit: event.target
                                        .value as Ingredient["unit"],
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="rounded-xl border p-3"
                        >
                          <option value="g">grams</option>
                          <option value="oz">ounces</option>
                          <option value="serving">servings</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setIngredients((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          className="rounded-xl border border-red-200 px-3 py-2 text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={savingRecipe}
                      className="rounded-xl bg-green-700 px-5 py-3 font-medium text-white disabled:opacity-50"
                    >
                      {savingRecipe
                        ? "Saving recipe..."
                        : editingRecipe
                          ? "Update recipe"
                          : "Save recipe"}
                    </button>
                    <button
                      type="button"
                      onClick={closeBuilder}
                      disabled={savingRecipe}
                      className="rounded-xl border px-5 py-3"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {message && <p className="mt-5 text-sm text-gray-600">{message}</p>}
        </div>
      </main>
    </AppShell>
  );
}
