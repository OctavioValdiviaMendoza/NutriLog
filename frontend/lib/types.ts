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
  quantity: number;
  source_type: "fdc_branded" | "fdc_foundation" | "fdc_sr_legacy" | "user_entered" | "recipe";
  fdc_id?: number;
  brand_name?: string;
  brand_owner?: string;
  notes?: string;
};

export type FoodSearchResult = {
  fdc_id: number;
  description: string;
  brand_name?: string;
  brand_owner?: string;
  data_type?: string;
  serving_size?: number;
  serving_size_unit?: string;
  household_serving_full_text?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  nutrition_basis?: "serving" | "100g";
  nutrition_basis_grams?: number;
};

export type RecipeIngredient = {
  id: number;
  recipe_id: number;
  food_name: string;
  quantity: number;
  unit: "g" | "oz" | "serving";
  grams: number;
  source_type: "fdc_branded" | "fdc_foundation" | "fdc_sr_legacy" | "user_entered";
  fdc_id?: number;
};

export type Recipe = {
  id: number;
  name: string;
  instructions?: string;
  servings: number;
  calories_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  ingredients: RecipeIngredient[];
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
