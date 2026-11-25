"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateTdee, getCurrentUser, saveProfile } from "@/lib/api";
import type { ProfileGoals } from "@/lib/types";
import NutritionSuggestions from "@/components/NutritionSuggestions";

export default function GoalsPage() {
  const router = useRouter();
  const [age, setAge] = useState<number | "">("");
  const [gender, setGender] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("");
  const [goalPace, setGoalPace] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bmr, setBmr] = useState<number | null>(null);
  const [tdee, setTdee] = useState<number | null>(null);
  const [calculationLoading, setCalculationLoading] = useState(false);
  const [calculationError, setCalculationError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [calorieTarget, setCalorieTarget] = useState("");
  const [proteinTarget, setProteinTarget] = useState("");
  const [carbTarget, setCarbTarget] = useState("");
  const [fatTarget, setFatTarget] = useState("");

  useEffect(() => {
    getCurrentUser().catch(() => router.replace("/login"));
  }, [router]);

  const weightLbs = Number(weight);
  const heightFeetValue = Number(heightFeet);
  const heightInchesValue = Number(heightInches);
  const formIsComplete =
    (gender === "male" || gender === "female") &&
    typeof age === "number" &&
    age >= 1 &&
    age <= 120 &&
    ["sedentary", "light", "moderate", "very-active"].includes(activityLevel) &&
    Number.isFinite(weightLbs) &&
    weightLbs > 0 &&
    weightLbs <= 1000 &&
    heightFeet !== "" &&
    heightFeetValue >= 1 &&
    heightFeetValue <= 8 &&
    heightInches !== "" &&
    heightInchesValue >= 0 &&
    heightInchesValue <= 11;

  useEffect(() => {
    if (!formIsComplete) {
      return;
    }

    const controller = new AbortController();

    async function calculateEnergy() {
      setCalculationLoading(true);
      setCalculationError("");

      try {
        const data = await calculateTdee(
          {
            gender: gender as "male" | "female",
            age: age as number,
            activity_level: activityLevel as ProfileGoals["activity_level"],
            weight_lbs: weightLbs,
            height_feet: heightFeetValue,
            height_inches: heightInchesValue,
          },
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setBmr(data.bmr);
          setTdee(data.tdee);
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        setCalculationError(
          error instanceof Error
            ? error.message
            : "Unable to calculate energy expenditure.",
        );
        setBmr(null);
        setTdee(null);
      } finally {
        if (!controller.signal.aborted) {
          setCalculationLoading(false);
        }
      }
    }

    void calculateEnergy();

    return () => controller.abort();
  }, [
    activityLevel,
    age,
    formIsComplete,
    gender,
    heightFeetValue,
    heightInchesValue,
    weightLbs,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const profile: ProfileGoals = {
      age: Number(form.get("age")),
      gender: String(form.get("gender")) as ProfileGoals["gender"],
      activity_level: String(
        form.get("activity"),
      ) as ProfileGoals["activity_level"],
      weight_lbs: Number(form.get("weight")),
      height_feet: Number(form.get("height-feet")),
      height_inches: Number(form.get("height-inches")),
      goal: String(form.get("goal")) as ProfileGoals["goal"],
      goal_pace: form.get("goal-pace")
        ? (String(form.get("goal-pace")) as ProfileGoals["goal_pace"])
        : undefined,
      calorie_target: Number(form.get("calories")),
      protein_target: Number(form.get("protein")),
      carb_target: Number(form.get("carbs")),
      fat_target: Number(form.get("fat")),
    };

    try {
      await saveProfile(profile);
      router.replace("/dashboard");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to save your nutrition goals.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-green-50 px-4 py-8 text-black sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="font-medium text-green-700">Step 1 of 1</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-green-100">
            <div className="h-full w-full rounded-full bg-green-700" />
          </div>

          <h1 className="mt-6 text-3xl font-bold text-green-950 sm:text-4xl">
            Set your nutrition goals
          </h1>

          <p className="mt-3 text-gray-600">
            Tell us a little about yourself so NutriLog can personalize your
            nutrition dashboard.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-3xl bg-white p-4 shadow-sm sm:p-8"
        >
          {formIsComplete &&
            (calculationLoading ||
              bmr !== null ||
              tdee !== null ||
              calculationError) && (
              <section
                aria-live="polite"
                className="rounded-2xl border border-green-200 bg-green-700 p-5 text-white shadow-sm sm:p-6"
              >
                <h2 className="text-lg font-semibold">
                  Your estimated daily energy needs
                </h2>

                {calculationLoading && (
                  <p className="mt-3 text-green-100">
                    Calculating your results...
                  </p>
                )}

                {!calculationLoading && bmr !== null && tdee !== null && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-green-100">
                        Basal Metabolic Rate (BMR)
                      </p>
                      <p className="mt-1 text-3xl font-bold">
                        {bmr.toLocaleString()}
                      </p>
                      <p className="text-xs text-green-100">
                        Calories/day at rest
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-green-100">
                        Total Daily Energy Expenditure (TDEE)
                      </p>
                      <p className="mt-1 text-3xl font-bold">
                        {tdee.toLocaleString()}
                      </p>
                      <p className="text-xs text-green-100">
                        Estimated calories/day with activity
                      </p>
                    </div>
                  </div>
                )}

                {calculationError && (
                  <p className="mt-3 text-sm text-red-100">
                    {calculationError}
                  </p>
                )}

                <p className="mt-4 text-sm text-green-100">
                  TDEE estimates the calories needed to maintain your current
                  weight based on your activity level. Your personal calorie
                  target can be adjusted below.
                </p>
              </section>
            )}

          <section className="rounded-2xl border border-green-100 bg-green-50/40 p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold text-green-950">
              About you
            </h2>

            <p className="mb-6 text-sm text-gray-600">
              This helps us personalize your nutrition recommendations.
            </p>

            <fieldset className="mb-6">
              <legend className="mb-2 font-medium text-green-950">
                Gender
              </legend>

              <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
                <label
                  className={`flex w-full flex-1 cursor-pointer items-center justify-center rounded-xl border px-6 py-4 font-medium transition-colors focus-within:ring-2 focus-within:ring-green-300 ${
                    gender === "male"
                      ? "border-green-700 bg-green-700 text-white"
                      : "border-green-200 bg-white text-green-950 hover:bg-green-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={(event) => setGender(event.target.value)}
                    className="sr-only"
                    required
                  />
                  Male
                </label>

                <label
                  className={`flex w-full flex-1 cursor-pointer items-center justify-center rounded-xl border px-6 py-4 font-medium transition-colors focus-within:ring-2 focus-within:ring-green-300 ${
                    gender === "female"
                      ? "border-green-700 bg-green-700 text-white"
                      : "border-green-200 bg-white text-green-950 hover:bg-green-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={(event) => setGender(event.target.value)}
                    className="sr-only"
                  />
                  Female
                </label>
              </div>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="age" className="mb-2 block font-medium">
                  Age
                </label>

                <input
                  id="age"
                  name="age"
                  type="number"
                  value={age}
                  placeholder="25"
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                  onChange={(event) =>
                    setAge(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                />
              </div>

              <div>
                <label htmlFor="activity" className="mb-2 block font-medium">
                  Activity level
                </label>

                <select
                  id="activity"
                  name="activity"
                  value={activityLevel}
                  onChange={(event) => setActivityLevel(event.target.value)}
                  className="w-full rounded-xl border border-green-200 bg-white px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                >
                  <option value="">Select one</option>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Lightly active</option>
                  <option value="moderate">Moderately active</option>
                  <option value="very-active">Very active</option>
                </select>
              </div>

              <div>
                <label htmlFor="weight" className="mb-2 block font-medium">
                  Weight in pounds
                </label>

                <input
                  id="weight"
                  name="weight"
                  type="number"
                  placeholder="150"
                  value={weight}
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                  onChange={(event) => setWeight(event.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <span className="mb-2 block font-medium">Height</span>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="height-feet"
                      className="mb-2 block text-sm text-gray-600"
                    >
                      Feet <span className="text-gray-400">(ft)</span>
                    </label>
                    <input
                      id="height-feet"
                      name="height-feet"
                      type="number"
                      placeholder="5"
                      value={heightFeet}
                      min="1"
                      max="8"
                      className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                      required
                      onChange={(event) => setHeightFeet(event.target.value)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="height-inches"
                      className="mb-2 block text-sm text-gray-600"
                    >
                      Inches <span className="text-gray-400">(in)</span>
                    </label>
                    <input
                      id="height-inches"
                      name="height-inches"
                      type="number"
                      placeholder="8"
                      value={heightInches}
                      min="0"
                      max="11"
                      className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                      required
                      onChange={(event) => setHeightInches(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-green-100 bg-green-50/40 p-5 sm:p-6">
            <h2 className="mb-5 text-xl font-semibold text-green-950">
              Your goal
            </h2>

            <label htmlFor="goal" className="mb-2 block font-medium">
              What is your main goal?
            </label>

            <select
              id="goal"
              name="goal"
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                setGoalPace("");
              }}
              className="w-full rounded-xl border border-green-200 bg-white px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
              required
            >
              <option value="">Select one</option>
              <option value="lose-weight">Lose weight</option>
              <option value="maintain-weight">Maintain weight</option>
              <option value="gain-weight">Gain weight</option>
              <option value="build-muscle">Build muscle</option>
              <option value="general-wellness">Improve general wellness</option>
            </select>

            {["lose-weight", "gain-weight", "build-muscle"].includes(goal) && (
              <div className="mt-5">
                <label htmlFor="goal-pace" className="mb-2 block font-medium">
                  Goal pace
                </label>

                <p className="mb-2 text-sm text-gray-600">
                  How quickly would you like to work toward this goal?
                </p>

                <select
                  id="goal-pace"
                  name="goal-pace"
                  value={goalPace}
                  onChange={(event) => setGoalPace(event.target.value)}
                  className="w-full rounded-xl border border-green-200 bg-white px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                >
                  <option value="">Select a pace</option>
                  <option value="gentle">Gentle</option>
                  <option value="balanced">Balanced</option>
                  <option value="ambitious">Ambitious</option>
                </select>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-green-100 bg-green-50/40 p-5 sm:p-6">
            <h2 className="mb-2 text-xl font-semibold text-green-950">
              Daily targets
            </h2>

            <p className="mb-5 text-sm text-gray-600">
              These can be adjusted later.
            </p>

            <NutritionSuggestions
              person={
                formIsComplete
                  ? {
                      age: age as number,
                      gender: gender as ProfileGoals["gender"],
                      activity_level:
                        activityLevel as ProfileGoals["activity_level"],
                      weight_lbs: weightLbs,
                      height_feet: heightFeetValue,
                      height_inches: heightInchesValue,
                    }
                  : null
              }
              goal={goal}
              pace={goalPace}
              targets={{
                calorie_target: calorieTarget,
                protein_target: proteinTarget,
                carb_target: carbTarget,
                fat_target: fatTarget,
              }}
              disabled={isSubmitting}
              onApply={(targets) => {
                if (targets.calorie_target != null)
                  setCalorieTarget(String(targets.calorie_target));
                if (targets.protein_target != null)
                  setProteinTarget(String(targets.protein_target));
                if (targets.carb_target != null)
                  setCarbTarget(String(targets.carb_target));
                if (targets.fat_target != null)
                  setFatTarget(String(targets.fat_target));
              }}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="calories" className="mb-2 block font-medium">
                  Calories <span className="text-gray-400">(kcal)</span>
                </label>

                <input
                  id="calories"
                  name="calories"
                  type="number"
                  placeholder="2000"
                  value={calorieTarget}
                  onChange={(event) => setCalorieTarget(event.target.value)}
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                />

                {tdee !== null && !calculationLoading && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600">
                      Estimated maintenance calories:{" "}
                      <strong>{tdee.toLocaleString()} kcal/day</strong>
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Use the suggestions above to apply a target adjusted for
                      your goal.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="protein" className="mb-2 block font-medium">
                  Protein <span className="text-gray-400">(g)</span>
                </label>

                <input
                  id="protein"
                  name="protein"
                  type="number"
                  step="any"
                  value={proteinTarget}
                  onChange={(event) => setProteinTarget(event.target.value)}
                  placeholder="140"
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>

              <div>
                <label htmlFor="carbs" className="mb-2 block font-medium">
                  Carbohydrates <span className="text-gray-400">(g)</span>
                </label>

                <input
                  id="carbs"
                  name="carbs"
                  type="number"
                  step="any"
                  value={carbTarget}
                  onChange={(event) => setCarbTarget(event.target.value)}
                  placeholder="250"
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>

              <div>
                <label htmlFor="fat" className="mb-2 block font-medium">
                  Fat <span className="text-gray-400">(g)</span>
                </label>

                <input
                  id="fat"
                  name="fat"
                  type="number"
                  step="any"
                  value={fatTarget}
                  onChange={(event) => setFatTarget(event.target.value)}
                  placeholder="65"
                  min="1"
                  className="w-full rounded-xl border border-green-200 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
            </div>
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Saving your preferences..."
              : "Continue to dashboard"}
          </button>

          {submitError && (
            <p role="alert" className="text-center text-sm text-red-600">
              {submitError}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
