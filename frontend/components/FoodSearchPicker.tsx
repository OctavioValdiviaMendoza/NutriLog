"use client";

import { useRef, useState } from "react";
import { getFoodDetails, searchFoods } from "@/lib/api";
import FoodPortionFields from "./FoodPortionFields";
import type { FoodSearchResult } from "@/lib/types";

export type FoodSelection = {
  food: FoodSearchResult;
  amount: number;
  unit: "g" | "oz" | "serving" | "portion";
  portion_id?: number;
};

export function createFoodSelection(food: FoodSearchResult): FoodSelection {
  const isServing = food.nutrition_basis === "serving";
  return {
    food,
    amount: isServing ? 1 : 100,
    unit: isServing ? "serving" : "g",
  };
}

export function basisLabel(food: FoodSearchResult) {
  return food.nutrition_basis === "serving"
    ? `Per serving · ${food.household_serving_full_text || `${food.serving_size ?? 1} ${food.serving_size_unit ?? "serving"}`}`
    : "Per 100g · not a whole item";
}

export default function FoodSearchPicker({
  onChange,
  disabled,
}: {
  onChange: (value: FoodSelection | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [branded, setBranded] = useState(false);
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [selection, setSelection] = useState<FoodSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);

  function update(value: FoodSelection | null) {
    setSelection(value);
    onChange(value);
  }
  function invalidate() {
    request.current++;
    setBusy(false);
    setFoods([]);
    update(null);
    setMessage("");
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setMessage("Enter at least two characters.");
      return;
    }
    const id = ++request.current;
    update(null);
    setFoods([]);
    setBusy(true);
    setMessage("");
    try {
      const result = await searchFoods(query.trim(), branded);
      if (id !== request.current) return;
      setFoods(result.foods);
      setMessage(
        result.foods.length
          ? "Choose a food, then set the amount below."
          : "No reliable match found. Try a simpler name, switch search type, or use manual entry.",
      );
    } catch (error) {
      if (id === request.current)
        setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  async function choose(food: FoodSearchResult) {
    const id = ++request.current;
    update(null);
    setBusy(true);
    setMessage("Loading available portions…");
    try {
      const details = await getFoodDetails(food.fdc_id);
      if (id !== request.current) return;
      update(createFoodSelection(details));
      setMessage("");
    } catch (error) {
      if (id === request.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load portions. Please retry.",
        );
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  return (
    <section className="mt-6" aria-label="Find a food">
      <form onSubmit={search} className="space-y-3">
        <label className="flex min-w-0 flex-col gap-2 text-sm font-medium sm:flex-row sm:items-center">
          Search type
          <select
            className="min-h-11 w-full min-w-0 rounded-xl border bg-white p-2 sm:w-auto"
            value={branded ? "branded" : "ingredients"}
            onChange={(event) => {
              invalidate();
              setBranded(event.target.value === "branded");
            }}
          >
            <option value="ingredients">Ingredients &amp; USDA foods</option>
            <option value="branded">Restaurant &amp; packaged foods</option>
          </select>
        </label>
        <div className="flex gap-3">
          <input
            aria-label="Food name"
            className="min-w-0 flex-1 rounded-xl border p-3"
            value={query}
            onChange={(event) => {
              invalidate();
              setQuery(event.target.value);
            }}
            placeholder={
              branded
                ? "Restaurant name and item"
                : "e.g. raw tomato or chicken sandwich"
            }
            maxLength={120}
          />
          <button
            disabled={busy || disabled}
            className="rounded-xl bg-green-700 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Loading…" : "Search"}
          </button>
        </div>
      </form>
      <p className="mt-2 text-sm text-slate-500">
        USDA records may describe ingredients or restaurant foods. Check the
        source and portion before logging.
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {message}
        </p>
      )}
      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
        {foods.map((food) => (
          <article key={food.fdc_id}>
            <button
              type="button"
              disabled={disabled || busy}
              aria-pressed={selection?.food.fdc_id === food.fdc_id}
              onClick={() => void choose(food)}
              className={`block w-full rounded-2xl border p-4 text-left disabled:opacity-60 ${selection?.food.fdc_id === food.fdc_id ? "border-green-700 bg-green-50" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className="font-semibold">
                {food.display_name || food.description}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {[food.data_type, food.brand_name || food.brand_owner]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="my-2 inline-block rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {basisLabel(food)}
              </span>
              <span className="block text-sm text-slate-600">
                {food.calories ?? "Unavailable"} kcal · Protein{" "}
                {food.protein_g ?? "—"}g · Carbs {food.carbs_g ?? "—"}g · Fat{" "}
                {food.fat_g ?? "—"}g
              </span>
            </button>
            <details className="px-4 py-2 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium hover:text-slate-800">
                Original USDA description
              </summary>
              <p className="mt-1">{food.description}</p>
              <p className="mt-1">USDA food ID: {food.fdc_id}</p>
            </details>
          </article>
        ))}
      </div>
      {selection && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <h2 className="font-semibold">
            Your portion ·{" "}
            {selection.food.display_name || selection.food.description}
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            {basisLabel(selection.food)}
          </p>
          <FoodPortionFields
            selection={selection}
            onChange={update}
            disabled={disabled}
          />
          {!selection.food.portions?.length && (
            <p className="mt-3 text-xs text-amber-900">
              USDA has no household portions for this record. Cup and whole-item
              conversions are only available when a weight is provided.
            </p>
          )}
          <p className="mt-3 text-sm text-slate-600">
            Nutrition is calculated automatically for the amount you log.
          </p>
        </div>
      )}
    </section>
  );
}
