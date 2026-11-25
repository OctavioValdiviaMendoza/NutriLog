"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import NutritionSuggestions from "@/components/NutritionSuggestions";
import { getCurrentUser, getProfile, saveProfile } from "@/lib/api";
import type { ApiError, ProfileGoals } from "@/lib/types";

const activityOptions = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "very-active", label: "Very active" },
];

const goalOptions = [
  { value: "lose-weight", label: "Lose weight" },
  { value: "maintain-weight", label: "Maintain weight" },
  { value: "gain-weight", label: "Gain weight" },
  { value: "build-muscle", label: "Build muscle" },
  { value: "general-wellness", label: "General wellness" },
];

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        await getCurrentUser();
        const data = await getProfile();

        if (active) setProfile(data);
      } catch (reason) {
        if (!active) return;

        const apiError = reason as Error & ApiError;

        if (apiError.status === 401) {
          router.replace("/login");
        } else if (apiError.status === 404) {
          router.replace("/onboarding/goals");
        } else {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load your profile.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [router]);

  function updateField<K extends keyof ProfileGoals>(
    field: K,
    value: ProfileGoals[K],
  ) {
    setProfile((current) =>
      current ? { ...current, [field]: value } : current,
    );
    setSuccess("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const saved = await saveProfile(profile);
      setProfile(saved);
      setSuccess("Your settings have been saved successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save your settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3";

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Settings & Preferences
          </h1>
          <p className="mt-2 text-slate-600">
            Review and update your personal information and nutrition goals.
          </p>
        </div>

        {loading && <p>Loading your settings...</p>}

        {error && (
          <p role="alert" className="mb-4 text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="mb-4 text-green-700">
            {success}
          </p>
        )}

        {!loading && profile && (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-semibold">
                Personal information
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Age
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={profile.age}
                    onChange={(event) =>
                      updateField("age", Number(event.target.value))
                    }
                    className={inputClass}
                  />
                </label>

                <label>
                  Gender
                  <select
                    value={profile.gender}
                    onChange={(event) =>
                      updateField(
                        "gender",
                        event.target.value as ProfileGoals["gender"],
                      )
                    }
                    className={inputClass}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>

                <label>
                  Weight (lbs)
                  <input
                    type="number"
                    min="0.1"
                    max="1000"
                    step="any"
                    required
                    value={profile.weight_lbs}
                    onChange={(event) =>
                      updateField("weight_lbs", Number(event.target.value))
                    }
                    className={inputClass}
                  />
                </label>

                <label>
                  Activity level
                  <select
                    value={profile.activity_level}
                    onChange={(event) =>
                      updateField(
                        "activity_level",
                        event.target.value as ProfileGoals["activity_level"],
                      )
                    }
                    className={inputClass}
                  >
                    {activityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Height (feet)
                  <input
                    type="number"
                    min="1"
                    max="8"
                    required
                    value={profile.height_feet}
                    onChange={(event) =>
                      updateField("height_feet", Number(event.target.value))
                    }
                    className={inputClass}
                  />
                </label>

                <label>
                  Height (inches)
                  <input
                    type="number"
                    min="0"
                    max="11"
                    required
                    value={profile.height_inches}
                    onChange={(event) =>
                      updateField("height_inches", Number(event.target.value))
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-semibold">Nutrition goals</h2>

              <NutritionSuggestions
                person={{
                  age: profile.age,
                  gender: profile.gender,
                  activity_level: profile.activity_level,
                  weight_lbs: profile.weight_lbs,
                  height_feet: profile.height_feet,
                  height_inches: profile.height_inches,
                }}
                goal={profile.goal}
                pace={profile.goal_pace}
                targets={{
                  calorie_target: profile.calorie_target,
                  protein_target: profile.protein_target,
                  carb_target: profile.carb_target,
                  fat_target: profile.fat_target,
                }}
                disabled={saving}
                onApply={(targets) => {
                  setProfile((current) =>
                    current ? { ...current, ...targets } : current,
                  );
                  setSuccess("");
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Fitness goal
                  <select
                    value={profile.goal}
                    onChange={(event) => {
                      const nextGoal = event.target
                        .value as ProfileGoals["goal"];

                      setProfile((current) =>
                        current
                          ? { ...current, goal: nextGoal, goal_pace: undefined }
                          : current,
                      );
                      setSuccess("");
                    }}
                    className={inputClass}
                  >
                    {goalOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {["lose-weight", "gain-weight", "build-muscle"].includes(
                  profile.goal,
                ) && (
                  <label>
                    Goal pace
                    <select
                      value={profile.goal_pace ?? ""}
                      onChange={(event) =>
                        updateField(
                          "goal_pace",
                          event.target.value
                            ? (event.target.value as ProfileGoals["goal_pace"])
                            : undefined,
                        )
                      }
                      className={inputClass}
                    >
                      <option value="">Select a pace</option>
                      <option value="gentle">Gentle</option>
                      <option value="balanced">Balanced</option>
                      <option value="ambitious">Ambitious</option>
                    </select>
                  </label>
                )}

                {(
                  [
                    ["calorie_target", "Calories (kcal)"],
                    ["protein_target", "Protein (g)"],
                    ["carb_target", "Carbohydrates (g)"],
                    ["fat_target", "Fat (g)"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      required
                      value={profile[field]}
                      onChange={(event) =>
                        updateField(field, Number(event.target.value))
                      }
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-xl border border-slate-300 px-6 py-3 font-medium"
              >
                Back to dashboard
              </button>
            </div>
          </form>
        )}
      </main>
    </AppShell>
  );
}
