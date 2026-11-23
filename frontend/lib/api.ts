import type { ApiError, DailySummary, FoodSearchResult, Meal, MealUpdate, ProfileGoals, Recipe, User } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Something went wrong.";

  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "Invalid input";
      })
      .join(", ");
  }

  return "Something went wrong.";
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Unable to reach the NutriLog API. Check that the backend is running.");
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && !path.startsWith("/auth/")) {
      window.open("/login?reason=session-expired", "_self");
    }
    const error = new Error(getErrorMessage(data)) as Error & ApiError;
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data as T;
}

export function signup(payload: {
  name: string;
  email: string;
  password: string;
}) {
  return apiRequest<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: { email: string; password: string }) {
  return apiRequest<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser() {
  return apiRequest<User>("/auth/me");
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function calculateBmr(
  payload: {
    gender: "male" | "female";
    age: number;
    activity_level: "sedentary" | "light" | "moderate" | "very-active";
    weight_lbs: number;
    height_feet: number;
    height_inches: number;
  },
  options: RequestInit = {},
) {
  return apiRequest<{ bmr: number; calories_per_day: number }>(
    "/calculations/bmr",
    {
      ...options,
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function calculateTdee(
  payload: {
    gender: "male" | "female";
    age: number;
    activity_level: "sedentary" | "light" | "moderate" | "very-active";
    weight_lbs: number;
    height_feet: number;
    height_inches: number;
  },
  options: RequestInit = {},
) {
  return apiRequest<{
    bmr: number;
    activity_multiplier: number;
    tdee: number;
  }>("/calculations/tdee", {
    ...options,
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function saveProfile(payload: ProfileGoals) {
  return apiRequest<ProfileGoals>("/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function searchFoods(query: string, brandedOnly = false) {
  return apiRequest<{ foods: FoodSearchResult[]; total_hits: number }>(
    `/meals/foods/search?q=${encodeURIComponent(query)}&branded_only=${brandedOnly}`,
  );
}

export function getFoodDetails(fdcId: number) {
  return apiRequest<FoodSearchResult>(`/meals/foods/${fdcId}`);
}

export function logUsdaFood(payload: { fdc_id: number; meal_type: string; logged_date: string; amount: number; unit: "g" | "oz" | "serving" | "portion"; portion_id?: number }) {
  return apiRequest<Meal>("/meals/foods/log", { method: "POST", body: JSON.stringify(payload) });
}

export function createMeal(payload: Omit<Meal, "id" | "user_id" | "created_at">) {
  return apiRequest<Meal>("/meals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMeal(mealId: number, payload: MealUpdate) {
  return apiRequest<Meal>(`/meals/${mealId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMeal(mealId: number) {
  return apiRequest<void>(`/meals/${mealId}`, {
    method: "DELETE",
  });
}

export function listRecipes() { return apiRequest<Recipe[]>("/recipes"); }

export function createRecipe(payload: { name: string; instructions?: string; servings: number; ingredients: unknown[] }) {
  return apiRequest<Recipe>("/recipes", { method: "POST", body: JSON.stringify(payload) });
}

export function updateRecipe(recipeId: number, payload: { name: string; instructions?: string; servings: number; ingredients: unknown[] }) {
  return apiRequest<Recipe>(`/recipes/${recipeId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteRecipe(recipeId: number) {
  return apiRequest<void>(`/recipes/${recipeId}`, { method: "DELETE" });
}

export function logRecipe(recipeId: number, payload: { meal_type: string; logged_date: string; servings: number }) {
  return apiRequest<Meal>(`/recipes/${recipeId}/log`, { method: "POST", body: JSON.stringify(payload) });
}

export function getDailySummary(date?: string) {
  return apiRequest<DailySummary>(date ? `/summary?date=${encodeURIComponent(date)}` : "/summary");
}
