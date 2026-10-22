"use client";

import { FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function GoalsPage() {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Temporary navigation until the backend is connected
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-green-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="font-medium text-green-700">Step 1 of 1</p>

          <h1 className="mt-2 text-4xl font-bold text-green-950">
            Set your nutrition goals
          </h1>

          <p className="mt-3 text-gray-600">
            Tell us a little about yourself so NutriLog can personalize your
            nutrition dashboard.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-3xl bg-white p-8 shadow-sm"
        >
          <section>
            <h2 className="mb-5 text-xl font-semibold text-green-950">
              About you
            </h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="age" className="mb-2 block font-medium">
                  Age
                </label>

                <input
                  id="age"
                  name="age"
                  type="number"
                  placeholder="25"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>

              <div>
                <label htmlFor="activity" className="mb-2 block font-medium">
                  Activity level
                </label>

                <select
                  id="activity"
                  name="activity"
                  className="w-full rounded-xl border bg-white px-4 py-3"
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
                <label htmlFor="height" className="mb-2 block font-medium">
                  Height in inches
                </label>

                <input
                  id="height"
                  name="height"
                  type="number"
                  placeholder="68"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
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
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-xl font-semibold text-green-950">
              Your goal
            </h2>

            <label htmlFor="goal" className="mb-2 block font-medium">
              What is your main goal?
            </label>

            <select
              id="goal"
              name="goal"
              className="w-full rounded-xl border bg-white px-4 py-3"
              required
            >
              <option value="">Select one</option>
              <option value="lose-weight">Lose weight</option>
              <option value="maintain-weight">Maintain weight</option>
              <option value="gain-weight">Gain weight</option>
              <option value="build-muscle">Build muscle</option>
              <option value="general-wellness">Improve general wellness</option>
            </select>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold text-green-950">
              Daily targets
            </h2>

            <p className="mb-5 text-sm text-gray-600">
              These can be adjusted later.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="calories" className="mb-2 block font-medium">
                  Calories
                </label>

                <input
                  id="calories"
                  name="calories"
                  type="number"
                  placeholder="2000"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>

              <div>
                <label htmlFor="protein" className="mb-2 block font-medium">
                  Protein in grams
                </label>

                <input
                  id="protein"
                  name="protein"
                  type="number"
                  placeholder="140"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>

              <div>
                <label htmlFor="carbs" className="mb-2 block font-medium">
                  Carbohydrates in grams
                </label>

                <input
                  id="carbs"
                  name="carbs"
                  type="number"
                  placeholder="250"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>

              <div>
                <label htmlFor="fat" className="mb-2 block font-medium">
                  Fat in grams
                </label>

                <input
                  id="fat"
                  name="fat"
                  type="number"
                  placeholder="65"
                  className="w-full rounded-xl border px-4 py-3"
                  required
                />
              </div>
            </div>
          </section>

          <button
            type="submit"
            className="w-full rounded-full bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800"
          >
            Continue to dashboard
          </button>
        </form>
      </div>
    </main>
  );
}