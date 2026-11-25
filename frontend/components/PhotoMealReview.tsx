"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFoodDetails,
  listRecipes,
  logRecipe,
  logUsdaFood,
  searchFoods,
} from "@/lib/api";
import FoodPortionFields from "./FoodPortionFields";
import {
  basisLabel,
  createFoodSelection,
  type FoodSelection,
} from "@/components/FoodSearchPicker";
import type {
  FoodSearchResult,
  MealType,
  PhotoAnalyzeResponse,
  Recipe,
} from "@/lib/types";

// Quick search chips for broad categories where cooking style changes calories.
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
  potatoes: [
    "baked potato",
    "mashed potatoes",
    "french fries",
    "roasted potatoes",
  ],
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

const STATUS_BADGE: Record<DraftStatus, { text: string; className: string }> = {
  saved: { text: "Saved", className: "bg-emerald-100 text-emerald-800" },
  confirmed: { text: "Confirmed", className: "bg-green-100 text-green-800" },
  unresolved: { text: "Unresolved", className: "bg-amber-100 text-amber-900" },
  resolving: { text: "Unresolved", className: "bg-amber-100 text-amber-900" },
};

function createReviewItem(
  values: Pick<ReviewItem, "id" | "source" | "displayName"> &
    Partial<ReviewItem>,
): ReviewItem {
  return {
    status: "unresolved",
    searchQuery: "",
    branded: false,
    searching: false,
    searchError: "",
    candidates: [],
    showAllCandidates: false,
    loadingDetails: false,
    selection: null,
    recipeSelection: null,
    ...values,
  };
}

function getItemTitle(item: ReviewItem): string {
  if (item.selection) {
    return item.selection.food.display_name || item.selection.food.description;
  }
  if (item.recipeSelection) {
    return item.recipeSelection.recipe.name;
  }
  return item.displayName;
}

// Preview totals for the summary card; the backend calculates final numbers on save.
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
    // Convert ounces or household portions into grams to scale against the USDA basis.
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

// Single food card: shows model confidence, USDA search, and portion confirmation.
function ReviewItemCard({
  item,
  onKeep,
  onChangeMode,
  onRemove,
  onPatch,
  onSearch,
  onSelectCandidate,
}: {
  item: ReviewItem;
  onKeep: (item: ReviewItem) => void;
  onChangeMode: (item: ReviewItem) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, updater: (curr: ReviewItem) => ReviewItem) => void;
  onSearch: (id: string, query: string, branded: boolean) => void;
  onSelectCandidate: (id: string, food: FoodSearchResult) => void;
}) {
  const prepOptions = item.modelLabel
    ? PREP_SUGGESTIONS[item.modelLabel]
    : undefined;
  const visibleCandidates = item.showAllCandidates
    ? item.candidates
    : item.candidates.slice(0, 4);
  const est = estimateMacros(item);
  const badge = STATUS_BADGE[item.status];
  const isDone = item.status === "confirmed" || item.status === "saved";

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-xs ${
        isDone ? "border-green-300" : "border-amber-200"
      }`}
    >
      {/* Card header: food name, status pill, and Keep/Change/Remove buttons. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-900">
              {getItemTitle(item)}
            </h4>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
            >
              {badge.text}
            </span>
          </div>
          {typeof item.confidence === "number" && (
            <p className="mt-1 text-xs text-slate-500">
              Model confidence: {Math.round(item.confidence * 100)}%
              {item.selection ? ` · Suggested from "${item.displayName}"` : ""}
            </p>
          )}
          {isDone && (
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
                onClick={() => onKeep(item)}
                className="min-h-10 rounded-xl bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
              >
                Keep
              </button>
            )}
            {item.status !== "resolving" && (
              <button
                type="button"
                onClick={() => onChangeMode(item)}
                className="min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Change
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="min-h-10 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Expanded panel: match this item to a USDA food and pick a portion. */}
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
                    onClick={() => onSearch(item.id, option, false)}
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
                onPatch(item.id, (curr) => ({ ...curr, branded: nextBranded }));
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
                onPatch(item.id, (curr) => ({
                  ...curr,
                  searchQuery: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearch(item.id, item.searchQuery, item.branded);
                }
              }}
              placeholder="e.g. grilled chicken breast"
              className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
            />
            <button
              type="button"
              disabled={item.searching}
              onClick={() => onSearch(item.id, item.searchQuery, item.branded)}
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
                  onClick={() => onSelectCandidate(item.id, food)}
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
                    onPatch(item.id, (curr) => ({
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
                {item.selection.food.display_name ||
                  item.selection.food.description}
              </h5>
              <p className="mt-1 text-xs text-amber-900">
                Portions are not estimated from the photo. Select or enter your
                amount below.
              </p>
              <FoodPortionFields
                selection={item.selection}
                portionLimit={5}
                onChange={(selection) =>
                  onPatch(item.id, (current) => ({ ...current, selection }))
                }
              />

              <button
                type="button"
                disabled={
                  !Number.isFinite(item.selection.amount) ||
                  item.selection.amount <= 0
                }
                onClick={() =>
                  onPatch(item.id, (curr) => ({ ...curr, status: "confirmed" }))
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
  // Start one unresolved review card for each food the model detected.
  const [items, setItems] = useState<ReviewItem[]>(() =>
    analysis.predictions.map((prediction, index) =>
      createReviewItem({
        id: `pred-${prediction.label}-${index}`,
        source: "model",
        modelLabel: prediction.label,
        displayName: prediction.display,
        confidence: prediction.confidence,
        searchQuery:
          PREP_SUGGESTIONS[prediction.label]?.[0] ?? prediction.display,
      }),
    ),
  );
  const [mixedOpen, setMixedOpen] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load saved recipes only if the user opens the mixed-dish drawer.
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
      setItems((prev) =>
        prev.map((item) => (item.id === id ? updater(item) : item)),
      );
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
          searchError:
            error instanceof Error ? error.message : "USDA search failed.",
        }));
      }
    },
    [patchItem],
  );

  // The model suggests names; USDA supplies nutrition and portion choices.
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
        selection: createFoodSelection(details),
      }));
    } catch (error) {
      patchItem(id, (item) => ({
        ...item,
        loadingDetails: false,
        searchError:
          error instanceof Error
            ? error.message
            : "Could not load portion options.",
      }));
    }
  }

  function openResolver(item: ReviewItem, autoSearch: boolean) {
    patchItem(item.id, (curr) => ({ ...curr, status: "resolving" }));
    if (
      autoSearch &&
      item.candidates.length === 0 &&
      item.searchQuery.trim().length >= 2
    ) {
      void runUsdaSearch(item.id, item.searchQuery, item.branded);
    }
  }

  function addMissingFood(initialQuery = "") {
    const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem = createReviewItem({
      id: newId,
      source: "manual",
      displayName: initialQuery || "Missing food",
      status: "resolving",
      searchQuery: initialQuery,
    });
    setItems((prev) => [...prev, newItem]);
    if (initialQuery.trim().length >= 2) {
      void runUsdaSearch(newId, initialQuery, false);
    }
  }

  function replaceWithMixedDishUsda() {
    setItems([
      createReviewItem({
        id: `mixed-${Date.now()}`,
        source: "mixed_dish",
        displayName: "Single mixed dish",
        status: "resolving",
      }),
    ]);
    setMixedOpen(false);
    setSaveError("");
  }

  function replaceWithSavedRecipe(recipe: Recipe) {
    setItems([
      createReviewItem({
        id: `recipe-${recipe.id}-${Date.now()}`,
        source: "mixed_dish",
        displayName: recipe.name,
        status: "confirmed",
        searchQuery: recipe.name,
        recipeSelection: { recipe, servings: 1 },
      }),
    ]);
    setMixedOpen(false);
    setSaveError("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function saveReviewedFoods() {
    // Save one by one and mark each item saved so retries never double-log.
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
            ? `Could not save "${getItemTitle(item)}": ${error.message}. Your review draft has been kept so you can retry.`
            : "Could not save all foods. Your review draft has been kept so you can retry.",
        );
        return;
      }
    }

    setSaving(false);
    onLogged(savedCount);
  }

  // Summarize progress across all cards for the bottom bar.
  const confirmedItems = items.filter(
    (item) => item.status === "confirmed" || item.status === "saved",
  );
  const unresolvedCount = items.filter(
    (item) => item.status === "unresolved" || item.status === "resolving",
  ).length;
  const readyToLogCount = items.filter(
    (item) => item.status === "confirmed",
  ).length;

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
      {/* 1. Header and supported model categories. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="photo-review-heading"
            className="text-lg font-semibold text-green-950"
          >
            Review detected foods
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Confirm each food against a USDA record and choose your portion
            before logging. Scores are model confidence, not a guarantee.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {analysis.model_version}
        </span>
      </div>

      {!analysis.model_ready && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          The ML model weights are not loaded yet. You can still add foods
          manually below.
        </p>
      )}

      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          Supported food categories ({analysis.supported_categories.length})
        </summary>
        <p className="mt-2 text-slate-500">
          This classifier currently recognizes only these categories. Other
          foods should be added manually below.
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

      {/* 2. Review cards for each detected or user-added food. */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="font-semibold text-slate-800">
            No supported foods were confidently detected
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The model did not guess any foods for this photo. Add foods manually
            below, or switch to USDA search or Manual entry.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewItemCard
              key={item.id}
              item={item}
              onKeep={(target) => openResolver(target, true)}
              onChangeMode={(target) => openResolver(target, false)}
              onRemove={removeItem}
              onPatch={patchItem}
              onSearch={(id, query, branded) =>
                void runUsdaSearch(id, query, branded)
              }
              onSelectCandidate={(id, food) =>
                void selectUsdaCandidate(id, food)
              }
            />
          ))}
        </div>
      )}

      {/* 3. Extra actions: add missing foods, replace with a mixed dish, or add sauces. */}
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
          {mixedOpen
            ? "Close mixed dish options"
            : "Replace with one mixed dish or recipe"}
        </button>
      </div>

      {mixedOpen && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">
            Log as one complete dish instead
          </p>
          <p className="text-xs text-slate-600">
            For a sandwich, casserole, or bowl, replacing the separate guesses
            prevents double-logging.
          </p>
          <button
            type="button"
            onClick={replaceWithMixedDishUsda}
            className="rounded-xl border border-green-700 bg-green-50 px-4 py-2 text-xs font-semibold text-green-900"
          >
            Search one USDA mixed dish
          </button>
          <div>
            <p className="text-xs font-semibold text-slate-600">
              Or pick a saved recipe:
            </p>
            {loadingRecipes ? (
              <p className="mt-1 text-xs text-slate-500">Loading recipes…</p>
            ) : recipes.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                No saved recipes yet.
              </p>
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
          Photos can miss cooking oil, butter, dressings, or sauces. Nothing is
          added automatically.
        </span>
        <button
          type="button"
          onClick={() => addMissingFood("olive oil")}
          className="font-semibold text-green-800 underline underline-offset-4"
        >
          + Add oil or sauce
        </button>
      </div>

      {/* 4. Totals preview and batch save button. */}
      {confirmedItems.length > 0 && (
        <div className="rounded-2xl border border-green-200 bg-white p-4">
          <h4 className="font-semibold text-green-950">
            Ready to log ({mealType} · {loggedDate})
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Estimated total: <strong>{Math.round(totals.calories)} kcal</strong>{" "}
            · P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g ·
            F {Math.round(totals.fat)}g
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Exact calories and macros are calculated on the server when saved.
          </p>
        </div>
      )}

      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || readyToLogCount === 0 || unresolvedCount > 0}
          onClick={() => void saveReviewedFoods()}
          className="min-h-11 rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-slate-300"
        >
          {saving
            ? "Saving foods…"
            : `Log ${readyToLogCount} ${readyToLogCount === 1 ? "food" : "foods"}`}
        </button>
        {unresolvedCount > 0 && (
          <span className="text-xs text-amber-900">
            Resolve or remove {unresolvedCount} remaining item
            {unresolvedCount === 1 ? "" : "s"} before logging.
          </span>
        )}
      </div>
    </section>
  );
}
