"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMeal,
  getCurrentUser,
  getDailySummary,
  logout,
  updateMeal,
} from "@/lib/api";
import type { DailySummary, Meal } from "@/lib/types";


const formatDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const prettyDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const round = (value: number) => Math.round(value);

function ProgressCard({ label, consumed, target, unit, color }: { label: string; consumed: number; target: number; unit: string; color: string }) {
  const percent = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  return <div className="rounded-2xl bg-gray-50 p-5"><div className="flex items-start justify-between"><p className="text-sm text-gray-600">{label}</p><span className="text-xs text-gray-500">{target ? `${round(percent)}%` : "Set goals"}</span></div><p className="mt-2 text-3xl font-bold">{round(consumed)}<span className="ml-1 text-base font-medium text-gray-500">{unit}</span></p><div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200"><div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-gray-500">{target ? `${round(target)}${unit} target` : "Complete onboarding to set a target"}</p></div>;
}


function MealRow({
  meal,
  onEdit,
  onDelete,
  deleting,
}: {
  meal: Meal;
  onEdit: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-4 last:border-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{meal.food_name}</p>
        <p className="text-sm capitalize text-gray-500">
          {meal.meal_type} · {meal.quantity} × {meal.serving_size}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p className="text-sm font-medium text-gray-600">
          {round(meal.calories)} kcal
        </p>
        <button
          type="button"
          onClick={() => onEdit(meal)}
          disabled={deleting}
          className="rounded-lg border border-green-200 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
          aria-label={`Edit ${meal.food_name}`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(meal)}
          disabled={deleting}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          aria-label={`Delete ${meal.food_name}`}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}


export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("there");
  const [selectedDate, setSelectedDate] = useState("");
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingMealId, setDeletingMealId] = useState<number | null>(null);
  const [mealActionError, setMealActionError] = useState("");
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const editFormRef = useRef<HTMLFormElement | null>(null);
  const [savingMeal, setSavingMeal] = useState(false);
  const [editQuantity, setEditQuantity] = useState("");
  const [editMealType, setEditMealType] = useState<Meal["meal_type"]>("lunch");
  const [editFoodName, setEditFoodName] = useState("");
  const [editServingSize, setEditServingSize] = useState("");
  const [editLoggedDate, setEditLoggedDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const isToday = selectedDate === "";
  const mealGroups = useMemo(() => summary?.meals.reduce<Record<string, Meal[]>>((groups, meal) => { (groups[meal.meal_type] ??= []).push(meal); return groups; }, {}) ?? {}, [summary]);

  useEffect(() => { getCurrentUser().then((user) => setUserName(user.name)).catch(() => router.replace("/login")); }, [router]);
  useEffect(() => { getDailySummary(selectedDate || undefined).then(setSummary).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the dashboard.")).finally(() => setLoading(false)); }, [selectedDate]);

  function selectDate(value: string) { setLoading(true); setError(""); setSelectedDate(value); }
  function shiftDate(days: number) { const next = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date(); next.setDate(next.getDate() + days); selectDate(formatDate(next)); }
  async function handleLogout() { try { await logout(); } finally { router.replace("/login"); } }

  async function handleDeleteMeal(meal: Meal) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${meal.food_name}"?`
    );

    if (!confirmed) return;

    setDeletingMealId(meal.id);
    setMealActionError("");

    try {
      await deleteMeal(meal.id);

      const updatedSummary = await getDailySummary(
        selectedDate || undefined
      );

      setSummary(updatedSummary);
    } catch (error) {
      setMealActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete meal."
      );
    } finally {
      setDeletingMealId(null);
    }
  }

  function handleEditMeal(meal: Meal) {
    setEditingMeal(meal);
    setEditQuantity(String(meal.quantity));
    setEditMealType(meal.meal_type);
    setEditFoodName(meal.food_name);
    setEditServingSize(meal.serving_size);
    setEditLoggedDate(meal.logged_date);
    setEditNotes(meal.notes ?? "");
    setMealActionError("");
  }

  useEffect(() => {
    if (editingMeal && editFormRef.current) {
      editFormRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [editingMeal]);


  async function handleSaveMeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingMeal) return;

    const quantity = Number(editQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      setMealActionError("Quantity must be between 0 and 1000.");
      return;
    }

    if (!editFoodName.trim() || !editServingSize.trim()) {
      setMealActionError("Food name and serving size are required.");
      return;
    }

    if (!editLoggedDate) {
      setMealActionError("Please select a valid date.");
      return;
    }

    setSavingMeal(true);
    setMealActionError("");

    try {
      await updateMeal(editingMeal.id, {
        meal_type: editMealType,
        logged_date: editLoggedDate,
        food_name: editFoodName.trim(),
        serving_size: editServingSize.trim(),
        quantity,
        notes: editNotes.trim() || null,
      });

      setEditingMeal(null);

      const updatedSummary = await getDailySummary(
        selectedDate || undefined
      );

      setSummary(updatedSummary);
    } catch (error) {
      setMealActionError(
        error instanceof Error
          ? error.message
          : "Unable to update meal."
      );
    } finally {
      setSavingMeal(false);
    }
  }


  return <main className="min-h-screen bg-green-50 px-4 py-6 text-gray-900 sm:px-6 sm:py-10"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium text-green-700">Welcome back, {userName}</p><h1 className="text-4xl font-bold text-green-950">NutriLog</h1></div><div className="flex items-center gap-3"><Link href="/meals/new" className="rounded-full bg-green-700 px-5 py-2 font-medium text-white hover:bg-green-800">Log a meal</Link><button type="button" onClick={() => void handleLogout()} className="rounded-full border border-green-700 px-5 py-2 font-medium text-green-800 hover:bg-green-100">Log out</button></div></header>
    <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm text-gray-500">
          Nutrition overview
        </p>

        <h2 className="text-2xl font-semibold">
          {isToday ? "Today" : prettyDate(selectedDate)}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="rounded-full border px-3 py-1 text-lg hover:bg-gray-50"
          aria-label="Previous day"
        >
          ‹
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={(event) => selectDate(event.target.value)}
          className="rounded-xl border px-3 py-2"
        />

        <button
          type="button"
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="rounded-full border px-3 py-1 text-lg hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next day"
        >
          ›
        </button>
      </div>
    </section>

    {mealActionError && (
      <div
        role="alert"
        className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
      >
        {mealActionError}
      </div>
    )}

    {editingMeal && (
      <form
        ref={editFormRef}
        onSubmit={handleSaveMeal}
        className="mb-6 rounded-3xl bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-semibold text-green-950">
          Edit meal
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Food name
            <input
              value={editFoodName}
              onChange={(event) => setEditFoodName(event.target.value)}
              maxLength={255}
              required
              className="mt-1 w-full rounded-xl border p-3"
            />
          </label>

          <label className="text-sm font-medium">
            Meal type
            <select
              value={editMealType}
              onChange={(event) =>
                setEditMealType(event.target.value as Meal["meal_type"])
              }
              className="mt-1 w-full rounded-xl border p-3"
            >
              {["breakfast", "lunch", "dinner", "snack", "other"].map(
                (type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="text-sm font-medium">
            Serving size
            <input
              value={editServingSize}
              onChange={(event) => setEditServingSize(event.target.value)}
              maxLength={120}
              required
              className="mt-1 w-full rounded-xl border p-3"
            />
          </label>

          <label className="text-sm font-medium">
            Quantity
            <input
              type="number"
              min="0.01"
              max="1000"
              step="any"
              value={editQuantity}
              onChange={(event) => setEditQuantity(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border p-3"
            />
          </label>

          <label className="text-sm font-medium">
            Logged date
            <input
              type="date"
              value={editLoggedDate}
              onChange={(event) => setEditLoggedDate(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border p-3"
            />
          </label>

          <label className="text-sm font-medium">
            Notes (optional)
            <input
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              maxLength={1000}
              className="mt-1 w-full rounded-xl border p-3"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={savingMeal}
            className="rounded-xl bg-green-700 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {savingMeal ? "Saving..." : "Save changes"}
          </button>

          <button
            type="button"
            onClick={() => setEditingMeal(null)}
            disabled={savingMeal}
            className="rounded-xl border px-5 py-3 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    )}


    {loading && (
      <div className="rounded-3xl bg-white p-10 text-center text-gray-500 shadow-sm">
        Loading your nutrition summary...
      </div>
    )}
    {!loading && error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800"><p className="font-medium">We could not load this dashboard.</p><p className="mt-1 text-sm">{error}</p><button type="button" onClick={() => selectDate(selectedDate)} className="mt-4 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white">Try again</button></div>}
    {!loading && !error && summary && <><section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><ProgressCard label="Calories" consumed={summary.consumed.calories} target={summary.targets.calories} unit=" kcal" color="bg-orange-400" /><ProgressCard label="Protein" consumed={summary.consumed.protein_g} target={summary.targets.protein_g} unit="g" color="bg-blue-500" /><ProgressCard label="Carbohydrates" consumed={summary.consumed.carbs_g} target={summary.targets.carbs_g} unit="g" color="bg-purple-500" /><ProgressCard label="Fat" consumed={summary.consumed.fat_g} target={summary.targets.fat_g} unit="g" color="bg-yellow-500" /></section><section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Logged meals</h2><span className="text-sm text-gray-500">{summary.meals.length} {summary.meals.length === 1 ? "meal" : "meals"}</span></div>{summary.meals.length ? <div className="mt-3">{Object.entries(mealGroups).map(([type, meals]) => <div key={type}><h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-green-700">{type}</h3>{meals.map((meal) => <MealRow key={meal.id} meal={meal} onEdit={handleEditMeal} onDelete={handleDeleteMeal} deleting={deletingMealId === meal.id} />)}</div>)}</div> : <div className="py-12 text-center"><p className="font-medium">No meals logged for this date.</p><p className="mt-1 text-sm text-gray-500">Add your first meal to start tracking.</p><Link href="/meals/new" className="mt-5 inline-block rounded-full bg-green-700 px-5 py-2 font-medium text-white">Log a meal</Link></div>}</div><div className="rounded-3xl bg-green-700 p-6 text-white shadow-sm"><h2 className="text-xl font-semibold">Remaining today</h2><p className="mt-2 text-green-100">Use these numbers to plan your next meal.</p><div className="mt-6 space-y-4">{[["Calories", summary.remaining.calories, "kcal"], ["Protein", summary.remaining.protein_g, "g"], ["Carbs", summary.remaining.carbs_g, "g"], ["Fat", summary.remaining.fat_g, "g"]].map(([label, value, unit]) => <div key={String(label)} className="flex justify-between border-b border-green-600 pb-3"><span className="text-green-100">{label}</span><span className="font-semibold">{round(Number(value))}{unit}</span></div>)}</div><Link href="/meals/new" className="mt-8 inline-block rounded-full bg-white px-5 py-2 font-medium text-green-800 hover:bg-green-50">Add another meal</Link></div></section></>}
  </div></main>;
}
