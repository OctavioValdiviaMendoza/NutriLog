"use client";

import type { FoodSelection } from "./FoodSearchPicker";

// USDA search and photo review use the same portion controls.
export default function FoodPortionFields({
  selection,
  onChange,
  disabled = false,
  portionLimit = 6,
}: {
  selection: FoodSelection;
  onChange: (selection: FoodSelection) => void;
  disabled?: boolean;
  portionLimit?: number;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0" aria-label="Food portion">
      <div className="mt-4 flex flex-wrap gap-2">
        {selection.food.nutrition_basis_grams &&
          [50, 100, 150].map((grams) => (
            <button
              type="button"
              key={grams}
              aria-pressed={
                selection.unit === "g" && selection.amount === grams
              }
              onClick={() =>
                onChange({
                  ...selection,
                  amount: grams,
                  unit: "g",
                  portion_id: undefined,
                })
              }
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${selection.unit === "g" && selection.amount === grams ? "border-green-700 bg-green-700 text-white" : "border-amber-300 bg-white"}`}
            >
              {grams}g
            </button>
          ))}
        {selection.food.nutrition_basis === "serving" && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...selection,
                amount: 1,
                unit: "serving",
                portion_id: undefined,
              })
            }
            className="rounded-xl border bg-white px-4 py-2 text-sm"
          >
            1 label serving
          </button>
        )}
        {selection.food.portions?.slice(0, portionLimit).map((portion) => (
          <button
            type="button"
            key={portion.id}
            aria-pressed={
              selection.unit === "portion" &&
              selection.portion_id === portion.id
            }
            onClick={() =>
              onChange({
                ...selection,
                amount: 1,
                unit: "portion",
                portion_id: portion.id,
              })
            }
            className={`rounded-xl border px-4 py-2 text-sm ${selection.portion_id === portion.id ? "border-green-700 bg-green-700 text-white" : "bg-white"}`}
          >
            {portion.label} ({portion.grams}g)
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Amount
          <input
            type="number"
            min="0.01"
            max="1000"
            step="any"
            value={selection.amount || ""}
            onChange={(event) =>
              onChange({ ...selection, amount: Number(event.target.value) })
            }
            className="mt-1 w-full rounded-xl border bg-white p-3"
          />
        </label>
        <label className="text-sm font-medium">
          Unit
          <select
            value={
              selection.unit === "portion"
                ? `portion:${selection.portion_id}`
                : selection.unit
            }
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                ...selection,
                amount: 1,
                unit: value.startsWith("portion:")
                  ? "portion"
                  : (value as FoodSelection["unit"]),
                portion_id: value.startsWith("portion:")
                  ? Number(value.split(":")[1])
                  : undefined,
              });
            }}
            className="mt-1 w-full rounded-xl border bg-white p-3"
          >
            {selection.food.nutrition_basis_grams && (
              <>
                <option value="g">Grams</option>
                <option value="oz">Ounces</option>
              </>
            )}
            {selection.food.nutrition_basis === "serving" && (
              <option value="serving">Label servings</option>
            )}
            {selection.food.portions?.map((portion) => (
              <option value={`portion:${portion.id}`} key={portion.id}>
                {portion.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
