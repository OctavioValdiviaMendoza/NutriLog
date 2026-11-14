export type User = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

export type ProfileGoals = {
  age: number;
  gender: "male" | "female";
  activity_level: "sedentary" | "light" | "moderate" | "very-active";
  weight_lbs: number;
  height_feet: number;
  height_inches: number;
  goal:
    | "lose-weight"
    | "maintain-weight"
    | "gain-weight"
    | "build-muscle"
    | "general-wellness";
  goal_pace?: "gentle" | "balanced" | "ambitious";
  calorie_target: number;
  protein_target: number;
  carb_target: number;
  fat_target: number;
};

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export type Meal = {
  id: number;
  meal_type: MealType;
  food_name: string;
  serving_size: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  logged_date: string;
  created_at: string;
};

export type DailySummary = {
  date: string;
  targets: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  consumed: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  remaining: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  meals: Meal[];
};

export type ApiError = {
  message: string;
  status: number;
  details?: unknown;
};
