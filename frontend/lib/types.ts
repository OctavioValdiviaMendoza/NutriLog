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

export type NutritionTargets = Pick<ProfileGoals, "calorie_target" | "protein_target" | "carb_target" | "fat_target">;
export type RecommendationPerson = Pick<ProfileGoals, "age" | "gender" | "activity_level" | "weight_lbs" | "height_feet" | "height_inches">;
export type RecommendationRequest = RecommendationPerson & {
  goal: ProfileGoals["goal"];
  goal_pace?: ProfileGoals["goal_pace"];
  current_targets: Partial<NutritionTargets>;
};
export type NutritionRecommendation = {
  policy_version: string;
  bmr: number;
  tdee: number;
  calorie_adjustment: number;
  weight_kg: number;
  eligible: boolean;
  recommended: NutritionTargets | null;
  suggestions: { [K in keyof NutritionTargets]: number | null };
  messages: string[];
};

export type Meal = {
  id: number;
  meal_type: MealType;
  food_name: string;
  display_name?: string;
  original_usda_description?: string | null;
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

export type MealUpdate = Partial<
  Pick<
    Meal,
    | "meal_type"
    | "logged_date"
    | "food_name"
    | "serving_size"
    | "quantity"
  >
> & {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  notes?: string | null;
};


export type FoodSearchResult = {
  fdc_id: number;
  description: string;
  display_name?: string;
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
  portions?: { id: number; label: string; grams: number }[];
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
  serving_size_grams?: number;
  calories_per_serving?: number;
  protein_g_per_serving?: number;
  carbs_g_per_serving?: number;
  fat_g_per_serving?: number;
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

export type SupportedFoodCategory = {
  label: string;
  display: string;
};

export type PhotoFoodPrediction = {
  label: string;
  display: string;
  confidence: number;
};

export type PhotoAnalyzeResponse = {
  predictions: PhotoFoodPrediction[];
  model_ready: boolean;
  model_version: string;
  supported_categories: SupportedFoodCategory[];
};

export type ApiError = {
  message: string;
  status: number;
  details?: unknown;
};
