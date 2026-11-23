"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFoodDetails,
  listRecipes,
  logRecipe,
  logUsdaFood,
  searchFoods,
} from "@/lib/api";
import { basisLabel, type FoodSelection } from "@/components/FoodSearchPicker";
import type {
  FoodSearchResult,
  MealType,
  PhotoAnalyzeResponse,
  Recipe,
} from "@/lib/types";

const PREP_SUGGESTIONS: Record<string, string[]> = {
  poultry: [
    "grilled chicken breast",
    "baked chicken thigh",
    "breaded fried chicken",
    "roasted turkey breast",
  ],
  steak: ["grilled beef steak", "pan seared sirloin steak", "ribeye steak"],
  fish: ["grilled salmon", "baked cod", "fried fish fillet", "tuna"],
  eggs: ["scrambled eggs", "boiled egg", "fried egg"],
  rice: ["cooked white rice", "cooked brown rice", "fried rice"],
  bread: ["whole wheat bread", "white bread", "sourdough bread"],
  noodles: ["cooked pasta", "ramen noodles", "rice noodles"],
  potatoes: ["baked potato", "mashed potatoes", "french fries", "roasted potatoes"],
  broccoli: ["steamed broccoli", "raw broccoli", "roasted broccoli"],
  carrots: ["raw carrots", "cooked carrots"],
  tomatoes: ["raw tomato", "cherry tomatoes"],
  lettuce: ["romaine lettuce", "iceberg lettuce", "mixed green salad"],
};

type DraftStatus = "unresolved" | "resolving" | "confirmed" | "saved";

type ReviewItem = {
  id: string;
  source: "model" | "manual" | "mixed_dish";
  modelLabel?: string;
  displayName: string;
  confidence?: number;
  status: DraftStatus;
  searchQuery: string;
  branded: boolean;
  searching: boolean;
  searchError: string;
  candidates: FoodSearchResult[];
  showAllCandidates: boolean;
  loadingDetails: boolean;
  selection: FoodSelection | null;
  recipeSelection: { recipe: Recipe; servings: number } | null;
};

function estimateMacros(item: ReviewItem): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} | null {
  if (item.recipeSelection) {
    const { recipe, servings } = item.recipeSelection;
    return {
      calories: recipe.calories_per_serving * servings,
      protein: recipe.protein_g_per_serving * servings,
      carbs: recipe.carbs_g_per_serving * servings,
      fat: recipe.fat_g_per_serving * servings,
    };
  }
  const sel = item.selection;
  if (!sel) return null;
  const food = sel.food;
  let multiplier = 1;
  if (sel.unit === "serving") {
    multiplier = sel.amount;
  } else {
    const basisGrams = food.nutrition_basis_grams || 100;
    let grams = sel.amount;
    if (sel.unit === "oz") {
      grams = sel.amount * 28.3495;
    } else if (sel.unit === "portion") {
      const portion = food.portions?.find((p) => p.id === sel.portion_id);
      grams = (portion?.grams ?? basisGrams) * sel.amount;
    }
    multiplier = grams / basisGrams;
  }
  return {
    calories: (food.calories ?? 0) * multiplier,
    protein: (food.protein_g ?? 0) * multiplier,
    carbs: (food.carbs_g ?? 0) * multiplier,
    fat: (food.fat_g ?? 0) * multiplier,
  };
}

function formatPortion(item: ReviewItem): string {
  if (item.recipeSelection) {
    return `${item.recipeSelection.servings} serving(s) of ${item.recipeSelection.recipe.name}`;
  }
  const sel = item.selection;
  if (!sel) return "Portion not set";
  if (sel.unit === "portion") {
    const portion = sel.food.portions?.find((p) => p.id === sel.portion_id);
    return `${sel.amount} × ${portion?.label ?? "portion"}`;
  }
  if (sel.unit === "serving") return `${sel.amount} serving(s)`;
  return `${sel.amount}${sel.unit}`;
}

export default function PhotoMealReview({
  analysis,
  mealType,
  loggedDate,
  onLogged,
}: {
  analysis: PhotoAnalyzeResponse;
  mealType: MealType;
  loggedDate: string;
  onLogged: (loggedCount: number) => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>(() =>
    analysis.predictions.map((pred, idx) => ({
      id: `pred-${pred.label}-${idx}`,
      source: "model",
      modelLabel: pred.label,
      displayName: pred.display,
      confidence: pred.confidence,
      status: "unresolved",
      searchQuery: PREP_SUGGESTIONS[pred.label]?.[0] ?? pred.display,
      branded: false,
      searching: false,
      searchError: "",
      candidates: [],
      showAllCandidates: false,
      loadingDetails: false,
      selection: null,
      recipeSelection: null,
    })),
  );
  const [mixedOpen, setMixedOpen] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!mixedOpen || recipes.length > 0) return;
    setLoadingRecipes(true);
    listRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]))
      .finally(() => setLoadingRecipes(false));
  }, [mixedOpen, recipes.length]);

  const patchItem = useCallback(
    (id: string, updater: (item: ReviewItem) => ReviewItem) => {
      setItems((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
    },
    [],
  );

  const runUsdaSearch = useCallback(
    async (id: string, queryText: string, brandedOnly: boolean) => {
      const trimmed = queryText.trim();
      if (trimmed.length < 2) {
        patchItem(id, (item) => ({
          ...item,
          searchError: "Enter at least two characters to search USDA foods.",
        }));
        return;
      }
      patchItem(id, (item) => ({
        ...item,
        searchQuery: trimmed,
        branded: brandedOnly,
        searching: true,
        searchError: "",
        showAllCandidates: false,
      }));
      try {
        const result = await searchFoods(trimmed, brandedOnly);
        patchItem(id, (item) => ({
          ...item,
          searching: false,
          candidates: result.foods,
          searchError: result.foods.length
            ? ""
            : "No USDA matches found. Try a simpler name or switch search type.",
        }));
      } catch (error) {
        patchItem(id, (item) => ({
          ...item,
          searching: false,
          searchError: error instanceof Error ? error.message : "USDA search failed.",
        }));
      }
    },
    [patchItem],
  );

  async function selectUsdaCandidate(id: string, food: FoodSearchResult) {
    patchItem(id, (item) => ({
      ...item,
      loadingDetails: true,
      searchError: "",
    }));
    try {
      const details = await getFoodDetails(food.fdc_id);
      patchItem(id, (item) => ({
        ...item,
        loadingDetails: false,
        recipeSelection: null,
        selection: {
          food: details,
          amount: details.nutrition_basis === "serving" ? 1 : 100,
          unit: details.nutrition_basis === "serving" ? "serving" : "g",
        },
      }));
    } catch (error) {
      patchItem(id, (item) => ({
        ...item,
        loadingDetails: false,
        searchError:
          error instanceof Error ? error.message : "Could not load portion options.",
      }));
    }
  }

  function openResolver(item: ReviewItem, autoSearch: boolean) {
    patchItem(item.id, (curr) => ({
      ...curr,
      status: "resolving",
    }));
    if (autoSearch && item.candidates.length === 0 && item.searchQuery.trim().length >= 2) {
      void runUsdaSearch(item.id, item.searchQuery, item.branded);
    }
  }

  function addMissingFood(initialQuery = "") {
    const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: ReviewItem = {
      id: newId,
      source: "manual",
      displayName: initialQuery ? initialQuery : "Missing food",
      status: "resolving",
      searchQuery: initialQuery,
      branded: false,
      searching: false,
      searchError: "",
      candidates: [],
      showAllCandidates: false,
      loadingDetails: false,
      selection: null,
      recipeSelection: null,
    };
    setItems((prev) => [...prev, newItem]);
    if (initialQuery.trim().length >= 2) {
      void runUsdaSearch(newId, initialQuery, false);
    }
  }

  function replaceWithMixedDishUsda() {
    const newId = `mixed-${Date.now()}`;
    setItems([
      {
        id: newId,
        source: "mixed_dish",
        displayName: "Single mixed dish",
        status: "resolving",
        searchQuery: "",
        branded: false,
        searching: false,
        searchError: "",
        candidates: [],
        showAllCandidates: false,
        loadingDetails: false,
        selection: null,
        recipeSelection: null,
      },
    ]);
    setMixedOpen(false);
    setSaveError("");
  }

  function replaceWithSavedRecipe(recipe: Recipe) {
    const newId = `recipe-${recipe.id}-${Date.now()}`;
    setItems([
      {
        id: newId,
        source: "mixed_dish",
        displayName: recipe.name,
        status: "confirmed",
        searchQuery: recipe.name,
        branded: false,
        searching: false,
        searchError: "",
        candidates: [],
        showAllCandidates: false,
        loadingDetails: false,
        selection: null,
        recipeSelection: { recipe, servings: 1 },
      },
    ]);
    setMixedOpen(false);
    setSaveError("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function saveBatch() {
    const toSave = items.filter((item) => item.status === "confirmed");
    if (saving || toSave.length === 0) return;

    setSaving(true);
    setSaveError("");
    let savedCount = items.filter((item) => item.status === "saved").length;

    for (const item of toSave) {
      try {
        if (item.recipeSelection) {
          await logRecipe(item.recipeSelection.recipe.id, {
            meal_type: mealType,
            logged_date: loggedDate,
            servings: item.recipeSelection.servings,
          });
        } else if (item.selection) {
          const { food, ...portion } = item.selection;
          await logUsdaFood({
            ...portion,
            fdc_id: food.fdc_id,
            meal_type: mealType,
            logged_date: loggedDate,
          });
        }
        savedCount += 1;
        patchItem(item.id, (curr) => ({ ...curr, status: "saved" }));
      } catch (error) {
        setSaving(false);
        setSaveError(
          error instanceof Error
            ? `Could not save "${item.selection?.food.display_name || item.displayName}": ${error.message}. Your review draft has been kept so you can retry.`
            : "Could not save all foods. Your review draft has been kept so you can retry.",
        );
        return;
      }
    }

    setSaving(false);
    onLogged(savedCount);
  }

  const confirmedItems = items.filter(
    (item) => item.status === "confirmed" || item.status === "saved",
  );
  const unresolvedCount = items.filter(
    (item) => item.status === "unresolved" || item.status === "resolving",
  ).length;
  const readyToLogCount = items.filter((item) => item.status === "confirmed").length;

  const totals = confirmedItems.reduce(
    (acc, item) => {
      const est = estimateMacros(item);
      if (!est) return acc;
      return {
        calories: acc.calories + est.calories,
        protein: acc.protein + est.protein,
        carbs: acc.carbs + est.carbs,
        fat: acc.fat + est.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <section
      aria-labelledby="photo-review-heading"
      className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="photo-review-heading" className="text-lg font-semibold text-green-950">
            Review detected foods
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Confirm each food against a USDA record and choose your portion before logging.
            Scores are model confidence, not a guarantee.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {analysis.model_version}
        </span>
      </div>

      {!analysis.model_ready && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The ML model weights are not loaded yet. You can still add foods manually below.
        </p>
      )}

      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          Supported food categories ({analysis.supported_categories.length})
        </summary>
        <p className="mt-2 text-slate-500">
          This classifier currently recognizes only these categories. Other foods should be added manually below.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {analysis.supported_categories.map((cat) => (
            <span
              key={cat.label}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {cat.display}
            </span>
          ))}
        </div>
      </details>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="font-semibold text-slate-800">
            No supported foods were confidently detected
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The model did not guess any foods for this photo. Add foods manually below, or switch to USDA search or Manual entry.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const prepOptions = item.modelLabel ? PREP_SUGGESTIONS[item.modelLabel] : undefined;
            const visibleCandidates = item.showAllCandidates
              ? item.candidates
              : item.candidates.slice(0, 4);
            const est = estimateMacros(item);

            return (
              <article
                key={item.id}
                className={`rounded-2xl border bg-white p-4 shadow-xs ${
                  item.status === "confirmed" || item.status === "saved"
                    ? "border-green-300"
                    : "border-amber-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">
                        {item.selection
                          ? item.selection.food.display_name || item.selection.food.description
                          : item.recipeSelection
                            ? item.recipeSelection.recipe.name
                            : item.displayName}
                      </h4>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.status === "saved"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "confirmed"
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.status === "saved"
                          ? "Saved"
                          : item.status === "confirmed"
                            ? "Confirmed"
                            : "Unresolved"}
                      </span>
                    </div>
                    {typeof item.confidence === "number" && (
                      <p className="mt-1 text-xs text-slate-500">
                        Model confidence: {Math.round(item.confidence * 100)}%
                        {item.selection ? ` · Suggested from "${item.displayName}"` : ""}
                      </p>
                    )}
                    {(item.status === "confirmed" || item.status === "saved") && (
                      <p className="mt-1 text-sm text-slate-600">
                        {formatPortion(item)}
                        {est
                          ? ` · ~${Math.round(est.calories)} kcal (P ${Math.round(est.protein)}g · C ${Math.round(est.carbs)}g · F ${Math.round(est.fat)}g)`
                          : ""}
                      </p>
                    )}
                  </div>

                  {item.status !== "saved" && (
                    <div className="flex flex-wrap gap-2">
                      {item.status === "unresolved" && (
                        <button
                          type="button"
                          onClick={() => openResolver(item, true)}
                          className="min-h-10 rounded-xl bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
                        >
                          Keep
                        </button>
                      )}
                      {item.status !== "resolving" && (
                        <button
                          type="button"
                          onClick={() => openResolver(item, false)}
                          className="min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Change
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="min-h-10 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {item.status === "resolving" && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    {prepOptions && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Choose how it was prepared
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {prepOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => void runUsdaSearch(item.id, option, false)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                                item.searchQuery.toLowerCase() === option.toLowerCase()
                                  ? "border-green-700 bg-green-50 text-green-900"
                                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label="Search type"
                        value={item.branded ? "branded" : "ingredients"}
                        onChange={(event) => {
                          const nextBranded = event.target.value === "branded";
                          patchItem(item.id, (curr) => ({ ...curr, branded: nextBranded }));
                        }}
                        className="min-h-11 rounded-xl border bg-white px-3 text-sm"
                      >
                        <option value="ingredients">Ingredients &amp; USDA</option>
                        <option value="branded">Restaurant &amp; packaged</option>
                      </select>
                      <input
                        aria-label={`Search USDA food for ${item.displayName}`}
                        value={item.searchQuery}
                        onChange={(event) =>
                          patchItem(item.id, (curr) => ({
                            ...curr,
                            searchQuery: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void runUsdaSearch(item.id, item.searchQuery, item.branded);
                          }
                        }}
                        placeholder="e.g. grilled chicken breast"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
                      />
                      <button
                        type="button"
                        disabled={item.searching}
                        onClick={() =>
                          void runUsdaSearch(item.id, item.searchQuery, item.branded)
                        }
                        className="min-h-11 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {item.searching ? "Searching…" : "Search"}
                      </button>
                    </div>

                    {item.searchError && (
                      <p role="status" className="text-sm text-amber-900">
                        {item.searchError}
                      </p>
                    )}

                    {visibleCandidates.length > 0 && (
                      <div className="space-y-2">
                        {visibleCandidates.map((food) => (
                          <button
                            key={food.fdc_id}
                            type="button"
                            disabled={item.loadingDetails}
                            onClick={() => void selectUsdaCandidate(item.id, food)}
                            className={`block w-full rounded-xl border p-3 text-left text-sm ${
                              item.selection?.food.fdc_id === food.fdc_id
                                ? "border-green-700 bg-green-50"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <span className="font-semibold text-slate-900">
                              {food.display_name || food.description}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {basisLabel(food)} · {food.calories ?? "—"} kcal · P{" "}
                              {food.protein_g ?? "—"}g · C {food.carbs_g ?? "—"}g · F{" "}
                              {food.fat_g ?? "—"}g
                            </span>
                          </button>
                        ))}
                        {item.candidates.length > 4 && (
                          <button
                            type="button"
                            onClick={() =>
                              patchItem(item.id, (curr) => ({
                                ...curr,
                                showAllCandidates: !curr.showAllCandidates,
                              }))
                            }
                            className="text-xs font-semibold text-green-800 underline underline-offset-4"
                          >
                            {item.showAllCandidates
                              ? "Show fewer results"
                              : `Search more (${item.candidates.length - 4} more results)`}
                          </button>
                        )}
                      </div>
                    )}

                    {item.loadingDetails && (
                      <p role="status" className="text-sm text-slate-600">
                        Loading verified USDA portions…
                      </p>
                    )}

                    {item.selection && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                        <h5 className="font-semibold text-slate-900">
                          Choose your portion ·{" "}
                          {item.selection.food.display_name || item.selection.food.description}
                        </h5>
                        <p className="mt-1 text-xs text-amber-900">
                          Portions are not estimated from the photo. Select or enter your amount below.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.selection.food.nutrition_basis_grams &&
                            [50, 100, 150].map((grams) => (
                              <button
                                key={grams}
                                type="button"
                                onClick={() =>
                                  patchItem(item.id, (curr) =>
                                    curr.selection
                                      ? {
                                          ...curr,
                                          selection: {
                                            ...curr.selection,
                                            amount: grams,
                                            unit: "g",
                                            portion_id: undefined,
                                          },
                                        }
                                      : curr,
                                  )
                                }
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                                  item.selection?.unit === "g" &&
                                  item.selection?.amount === grams
                                    ? "border-green-700 bg-green-700 text-white"
                                    : "border-amber-300 bg-white text-slate-800"
                                }`}
                              >
                                {grams}g
                              </button>
                            ))}
                          {item.selection.food.nutrition_basis === "serving" && (
                            <button
                              type="button"
                              onClick={() =>
                                patchItem(item.id, (curr) =>
                                  curr.selection
                                    ? {
                                        ...curr,
                                        selection: {
                                          ...curr.selection,
                                          amount: 1,
                                          unit: "serving",
                                          portion_id: undefined,
                                        },
                                      }
                                    : curr,
                                )
                              }
                              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                                item.selection.unit === "serving"
                                  ? "border-green-700 bg-green-700 text-white"
                                  : "border-amber-300 bg-white text-slate-800"
                              }`}
                            >
                              1 label serving
                            </button>
                          )}
                          {item.selection.food.portions?.slice(0, 5).map((portion) => (
                            <button
                              key={portion.id}
                              type="button"
                              onClick={() =>
                                patchItem(item.id, (curr) =>
                                  curr.selection
                                    ? {
                                        ...curr,
                                        selection: {
                                          ...curr.selection,
                                          amount: 1,
                                          unit: "portion",
                                          portion_id: portion.id,
                                        },
                                      }
                                    : curr,
                                )
                              }
                              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                                item.selection?.portion_id === portion.id
                                  ? "border-green-700 bg-green-700 text-white"
                                  : "bg-white text-slate-800"
                              }`}
                            >
                              {portion.label} ({portion.grams}g)
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-700">
                            Amount
                            <input
                              type="number"
                              min="0.01"
                              max="1000"
                              step="any"
                              value={item.selection.amount || ""}
                              onChange={(event) => {
                                const val = Number(event.target.value);
                                patchItem(item.id, (curr) =>
                                  curr.selection
                                    ? {
                                        ...curr,
                                        selection: { ...curr.selection, amount: val },
                                      }
                                    : curr,
                                );
                              }}
                              className="mt-1 w-full rounded-xl border bg-white p-2.5 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-700">
                            Unit
                            <select
                              value={
                                item.selection.unit === "portion"
                                  ? `portion:${item.selection.portion_id}`
                                  : item.selection.unit
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                patchItem(item.id, (curr) =>
                                  curr.selection
                                    ? {
                                        ...curr,
                                        selection: {
                                          ...curr.selection,
                                          amount: 1,
                                          unit: value.startsWith("portion:")
                                            ? "portion"
                                            : (value as FoodSelection["unit"]),
                                          portion_id: value.startsWith("portion:")
                                            ? Number(value.split(":")[1])
                                            : undefined,
                                        },
                                      }
                                    : curr,
                                );
                              }}
                              className="mt-1 w-full rounded-xl border bg-white p-2.5 text-sm"
                            >
                              {item.selection.food.nutrition_basis_grams && (
                                <>
                                  <option value="g">Grams</option>
                                  <option value="oz">Ounces</option>
                                </>
                              )}
                              {item.selection.food.nutrition_basis === "serving" && (
                                <option value="serving">Label servings</option>
                              )}
                              {item.selection.food.portions?.map((portion) => (
                                <option key={portion.id} value={`portion:${portion.id}`}>
                                  {portion.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <button
                          type="button"
                          disabled={
                            !Number.isFinite(item.selection.amount) ||
                            item.selection.amount <= 0
                          }
                          onClick={() =>
                            patchItem(item.id, (curr) => ({ ...curr, status: "confirmed" }))
                          }
                          className="mt-4 min-h-11 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          Confirm food &amp; portion
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => addMissingFood("")}
          className="min-h-11 rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
        >
          + Add a missing food
        </button>
        <button
          type="button"
          onClick={() => setMixedOpen((open) => !open)}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {mixedOpen ? "Close mixed dish options" : "Replace with one mixed dish or recipe"}
        </button>
      </div>

      {mixedOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            Log as one complete dish instead
          </p>
          <p className="text-xs text-slate-600">
            For a sandwich, casserole, or bowl, replacing the separate guesses prevents double-logging.
          </p>
          <button
            type="button"
            onClick={replaceWithMixedDishUsda}
            className="rounded-xl border border-green-700 bg-green-50 px-4 py-2 text-xs font-semibold text-green-900"
          >
            Search one USDA mixed dish
          </button>
          <div>
            <p className="text-xs font-semibold text-slate-600">Or pick a saved recipe:</p>
            {loadingRecipes ? (
              <p className="mt-1 text-xs text-slate-500">Loading recipes…</p>
            ) : recipes.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No saved recipes yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {recipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => replaceWithSavedRecipe(r)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
                  >
                    {r.name} ({Math.round(r.calories_per_serving)} kcal/serving)
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span>
          Photos can miss cooking oil, butter, dressings, or sauces. Nothing is added automatically.
        </span>
        <button
          type="button"
          onClick={() => addMissingFood("olive oil")}
          className="font-semibold text-green-800 underline underline-offset-4"
        >
          + Add oil or sauce
        </button>
      </div>

      {confirmedItems.length > 0 && (
        <div className="rounded-2xl border border-green-200 bg-white p-4">
          <h4 className="font-semibold text-green-950">
            Ready to log ({mealType} · {loggedDate})
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Estimated total: <strong>{Math.round(totals.calories)} kcal</strong> · P{" "}
            {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F{" "}
            {Math.round(totals.fat)}g
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Exact calories and macros are calculated on the server when saved.
          </p>
        </div>
      )}

      {saveError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || readyToLogCount === 0 || unresolvedCount > 0}
          onClick={() => void saveBatch()}
          className="min-h-11 rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-slate-300"
        >
          {saving
            ? "Saving foods…"
            : `Log ${readyToLogCount} ${readyToLogCount === 1 ? "food" : "foods"}`}
        </button>
        {unresolvedCount > 0 && (
          <span className="text-xs text-amber-900">
            Resolve or remove {unresolvedCount} remaining item{unresolvedCount === 1 ? "" : "s"} before logging.
          </span>
        )}
      </div>
    </section>
  );
}
