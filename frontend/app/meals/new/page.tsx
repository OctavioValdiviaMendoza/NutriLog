"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createMeal, getCurrentUser, searchFoods } from "@/lib/api";
import type { FoodSearchResult, MealType } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);
const fields = ["food_name", "serving_size", "calories", "protein_g", "carbs_g", "fat_g"] as const;

export default function NewMealPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [quantity, setQuantity] = useState(1);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState<Record<typeof fields[number], string>>({ food_name: "", serving_size: "1 serving", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [message, setMessage] = useState("");

  useEffect(() => { getCurrentUser().catch(() => router.replace("/login")); }, [router]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    try {
      const result = await searchFoods(query, true);
      setFoods(result.foods);
      setMessage(result.foods.length ? "Select the exact item and serving size." : "No USDA match. Use manual entry if needed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Search failed."); }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const food = selected;
    const values = manual
      ? { food_name: form.food_name, serving_size: form.serving_size, calories: Number(form.calories), protein_g: Number(form.protein_g), carbs_g: Number(form.carbs_g), fat_g: Number(form.fat_g) }
      : { food_name: food?.description ?? "", serving_size: food?.household_serving_full_text || `${food?.serving_size ?? "1"} ${food?.serving_size_unit ?? "serving"}`, calories: food?.calories ?? 0, protein_g: food?.protein_g ?? 0, carbs_g: food?.carbs_g ?? 0, fat_g: food?.fat_g ?? 0 };
    if (!values.food_name || Object.values(values).some((value) => typeof value === "number" && !Number.isFinite(value))) { setMessage("Complete the food and nutrition fields before saving."); return; }
    try {
      await createMeal({ ...values, meal_type: mealType, logged_date: today, quantity, source_type: manual ? "user_entered" : "fdc_branded", fdc_id: manual ? undefined : food?.fdc_id, brand_name: manual ? undefined : food?.brand_name, brand_owner: manual ? undefined : food?.brand_owner });
      router.push("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save meal."); }
  }

  return (
    <main className="min-h-screen bg-green-50 px-6 py-10 text-gray-900"><div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm">
      <button type="button" onClick={() => router.back()} className="mb-5 text-sm text-green-700">← Back</button>
      <h1 className="text-3xl font-bold text-green-950">Log a meal</h1>
      <p className="mt-2 text-gray-600">Search USDA branded foods for restaurant items, or enter nutrition manually if it is not listed.</p>
      <div className="mt-6 flex gap-3"><button type="button" onClick={() => setManual(false)} className={`rounded-full px-4 py-2 ${!manual ? "bg-green-700 text-white" : "bg-gray-100"}`}>USDA search</button><button type="button" onClick={() => { setManual(true); setSelected(null); }} className={`rounded-full px-4 py-2 ${manual ? "bg-green-700 text-white" : "bg-gray-100"}`}>Manual entry</button></div>
      {!manual && <form onSubmit={handleSearch} className="mt-6 flex gap-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. McDonald's Big Mac" className="min-w-0 flex-1 rounded-xl border p-3" /><button className="rounded-xl bg-green-700 px-5 font-medium text-white">Search</button></form>}
      {!manual && <div className="mt-4 space-y-3">{foods.map((food) => <button type="button" key={food.fdc_id} onClick={() => setSelected(food)} className={`block w-full rounded-xl border p-4 text-left ${selected?.fdc_id === food.fdc_id ? "border-green-700 bg-green-50" : "border-gray-200"}`}><span className="font-semibold">{food.description}</span><span className="block text-sm text-gray-600">{food.brand_name || food.brand_owner || "Branded food"} · {food.household_serving_full_text || "Serving listed by USDA"}</span><span className="block text-sm text-gray-600">{food.calories ?? "—"} kcal · P {food.protein_g ?? "—"}g · C {food.carbs_g ?? "—"}g · F {food.fat_g ?? "—"}g</span></button>)}</div>}
      {manual && <div className="mt-6 grid gap-3 sm:grid-cols-2">{fields.map((field) => <input key={field} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder={field.replaceAll("_", " ")} className="rounded-xl border p-3" />)}</div>}
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2"><label>Meal type<select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} className="mt-1 w-full rounded-xl border p-3">{["breakfast", "lunch", "dinner", "snack", "other"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label><button type="submit" disabled={!manual && !selected} className="rounded-xl bg-green-700 p-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 sm:col-span-2">Save meal</button></form>
      {message && <p className="mt-4 text-sm text-gray-600">{message}</p>}
    </div></main>
  );
}
