"use client";

import { useEffect, useState } from "react";
import { getNutritionRecommendations } from "@/lib/api";
import type {
  NutritionRecommendation,
  NutritionTargets,
  ProfileGoals,
  RecommendationPerson,
} from "@/lib/types";

type TargetKey = keyof NutritionTargets;
export type TargetInputs = Record<TargetKey, string | number>;
const fields: {
  key: TargetKey;
  label: string;
  button: string;
  unit: string;
}[] = [
  {
    key: "calorie_target",
    label: "Calories",
    button: "Use suggested calorie target",
    unit: "kcal",
  },
  {
    key: "protein_target",
    label: "Protein",
    button: "Use suggested protein target",
    unit: "g",
  },
  {
    key: "fat_target",
    label: "Fat",
    button: "Use suggested fat target",
    unit: "g",
  },
  {
    key: "carb_target",
    label: "Carbohydrates",
    button: "Use remaining calories for carbs",
    unit: "g",
  },
];

export default function NutritionSuggestions({
  person,
  goal,
  pace,
  targets,
  onApply,
  disabled = false,
}: {
  person: RecommendationPerson | null;
  goal: string;
  pace?: string;
  targets: TargetInputs;
  onApply: (targets: Partial<NutritionTargets>) => void;
  disabled?: boolean;
}) {
  const [result, setResult] = useState<{
    key: string;
    data?: NutritionRecommendation;
    error?: string;
  } | null>(null);
  const needsPace = ["lose-weight", "gain-weight", "build-muscle"].includes(
    goal,
  );
  const currentTargets: Partial<NutritionTargets> = {};
  let invalidTarget = false;
  for (const { key } of fields) {
    if (targets[key] === "") continue;
    const value = Number(targets[key]);
    if (!Number.isFinite(value) || value <= 0) invalidTarget = true;
    else currentTargets[key] = value;
  }
  const ready = person && goal && (!needsPace || pace) && !invalidTarget;
  const requestKey = ready
    ? JSON.stringify({
        ...person,
        goal: goal as ProfileGoals["goal"],
        goal_pace: needsPace ? pace : undefined,
        current_targets: currentTargets,
      })
    : "";

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await getNutritionRecommendations(JSON.parse(requestKey), {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setResult({ key: requestKey, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error:
              error instanceof Error
                ? error.message
                : "Could not calculate suggestions.",
          });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);

  const current = result?.key === requestKey && requestKey ? result : null;
  const data = current?.data;
  const waiting = Boolean(requestKey && !current);
  const explanations: Record<TargetKey, string> = {
    calorie_target: data
      ? `Maintenance ${data.tdee.toLocaleString()} kcal ${data.calorie_adjustment >= 0 ? "+" : "−"} ${Math.abs(data.calorie_adjustment)} kcal for your goal.`
      : "Based on maintenance TDEE, goal, and pace.",
    protein_target: data
      ? `${data.weight_kg} kg × 1.2 g/kg. The same protein factor is used across goals.`
      : "1.2 g per kilogram of body weight.",
    fat_target:
      "30% of the current calorie target ÷ 9; uses suggested calories when that field is empty.",
    carb_target:
      "Remaining calories after the current protein and fat amounts ÷ 4. Empty fields use suggestions.",
  };

  return (
    <section
      className="my-5 min-w-0 rounded-2xl border border-green-200 bg-white p-4 sm:p-5"
      aria-label="Suggested nutrition targets"
    >
      <h3 className="text-lg font-semibold text-green-950">
        Suggested targets
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        General adult planning estimates. Suggestions never replace your entries
        until you apply them, and do not guarantee a healthy diet or a
        particular rate of weight change.
      </p>
      {!person || !goal || (needsPace && !pace) ? (
        <p className="mt-3 text-sm text-slate-600">
          Complete your body details, goal, and pace above to see suggestions.
        </p>
      ) : invalidTarget ? (
        <p role="status" className="mt-3 text-sm text-amber-900">
          Use positive numbers or clear a target field to calculate suggestions.
        </p>
      ) : waiting ? (
        <p role="status" className="mt-3 text-sm text-slate-600">
          Updating suggestions…
        </p>
      ) : null}
      {current?.error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {current.error} Your entered targets are unchanged.
        </p>
      )}
      {data?.messages.length ? (
        <ul
          aria-live="polite"
          className="mt-3 list-disc space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 pl-8 text-sm text-amber-950"
        >
          {data.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {fields.map(({ key, label, button, unit }) => {
          const value = data?.suggestions[key];
          return (
            <div key={key} className="min-w-0 rounded-xl bg-slate-50 p-3">
              <p className="font-medium">
                {label}
                {value != null && (
                  <span className="ml-2 text-green-800">
                    {value.toLocaleString()} {unit}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-600">{explanations[key]}</p>
              <button
                type="button"
                disabled={disabled || waiting || value == null}
                onClick={() => {
                  if (value != null) onApply({ [key]: value });
                }}
                className="mt-3 min-h-11 w-full whitespace-normal rounded-lg border border-green-700 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
              >
                {button}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled || waiting || !data?.recommended}
        onClick={() => {
          if (data?.recommended) onApply(data.recommended);
        }}
        className="mt-4 min-h-11 w-full rounded-xl bg-green-700 px-4 py-3 font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Apply all suggested targets
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Apply all uses the complete goal-based plan, replacing all four targets.
        Individual buttons respect your current entries. Recalculate carbs after
        changing protein or fat.
      </p>
      <details className="mt-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">
          How these estimates work
        </summary>
        <p className="mt-2">
          Gentle/balanced/ambitious use 5/10/15% calorie changes, capped at a
          500 kcal deficit or 300 kcal surplus. These are app defaults, not
          promised weekly results. Automatic plans use adult macro ranges and
          app calorie/BMI screening limits.
        </p>
        <p className="mt-2">
          Total fat is different from saturated fat. This calculator does not
          check your separate saturated-fat intake.
        </p>
        <a
          className="mt-2 inline-block text-green-800 underline"
          href="https://www.realfood.gov/documents/DGA.pdf"
          target="_blank"
          rel="noreferrer"
        >
          U.S. Dietary Guidelines
        </a>
        {" · "}
        <a
          className="text-green-800 underline"
          href="https://www.nationalacademies.org/read/27957/chapter/5"
          target="_blank"
          rel="noreferrer"
        >
          Adult macro ranges
        </a>
      </details>
    </section>
  );
}
