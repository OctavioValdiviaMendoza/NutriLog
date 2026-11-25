"""Adult planning estimates, not prescriptions or guaranteed weight-change rates.

Sources: realfood.gov/documents/DGA.pdf (protein); nationalacademies.org/read/27957/chapter/5
(macro ranges); niddk.nih.gov/bwp (adult eligibility). Pace, calorie bounds and BMI
screening below are application safeguards, not universal clinical thresholds.
"""
from app.schemas.recommendations import (
    CurrentTargets, RecommendationRequest, RecommendationResponse, SuggestedTargets,
)
from app.services.energy import basal_calories, daily_calories

PACE_RATES = {"gentle": 0.05, "balanced": 0.10, "ambitious": 0.15}
CALORIE_FLOORS = {"male": 1500, "female": 1200}
MAX_AUTOMATIC_CALORIES = 6000
PROTEIN_PER_KG = 1.2
FAT_SHARE = 0.30


def _calorie_issue(calories: float, floor: int) -> str | None:
    if not floor <= calories <= MAX_AUTOMATIC_CALORIES:
        return f"Automatic suggestions support {floor}–{MAX_AUTOMATIC_CALORIES} kcal/day for this profile. These app limits do not guarantee an appropriate diet; ask a clinician about targets outside this range."
    return None


def _macro_issue(calories: float, protein: float, fat: float, carbs: float) -> str | None:
    shares = (4 * protein / calories, 9 * fat / calories, 4 * carbs / calories)
    if not (0.099 <= shares[0] <= 0.351 and 0.199 <= shares[1] <= 0.351 and 0.449 <= shares[2] <= 0.651):
        return "These amounts do not fit the adult planning ranges (protein 10–35%, fat 20–35%, carbs 45–65%). Adjust the targets or use a clinician's plan."
    return None


def recommend_targets(payload: RecommendationRequest) -> RecommendationResponse:
    kg = payload.weight_lbs * 0.45359237
    height_m = (payload.height_feet * 12 + payload.height_inches) * 0.0254
    bmi = kg / height_m ** 2
    tdee = daily_calories(payload)
    adjustment = 0
    rate = PACE_RATES.get(payload.goal_pace, 0)
    if payload.goal == "lose-weight":
        adjustment = -min(round(tdee * rate), 500)
    elif payload.goal in {"gain-weight", "build-muscle"}:
        adjustment = min(round(tdee * rate), 300)
    calories = tdee + adjustment
    result = RecommendationResponse(bmr=basal_calories(payload), tdee=tdee,
        calorie_adjustment=adjustment, weight_kg=round(kg, 2), eligible=False)

    if payload.age < 18:
        result.messages.append("Automatic nutrition suggestions are for adults 18 and older. Younger users need age-specific professional guidance.")
    if not 18.5 <= bmi < 40:
        result.messages.append("Your height and weight fall outside this app's BMI screening range (18.5 to under 40). Check your entries and ask a clinician for individualized targets. BMI is a screening measure, not a diagnosis.")
    issue = _calorie_issue(calories, CALORIE_FLOORS[payload.gender])
    if issue:
        result.messages.append(issue)
    if result.messages:
        return result

    protein = round(PROTEIN_PER_KG * kg, 1)
    fat = round(calories * FAT_SHARE / 9, 1)
    carbs = round((calories - 4 * protein - 9 * fat) / 4, 1)
    issue = _macro_issue(calories, protein, fat, carbs)
    if issue:
        result.messages.append(issue)
        return result
    result.eligible = True
    result.recommended = SuggestedTargets(calorie_target=calories, protein_target=protein, fat_target=fat, carb_target=carbs)

    current = payload.current_targets
    selected_calories = current.calorie_target or calories
    issue = _calorie_issue(selected_calories, CALORIE_FLOORS[payload.gender])
    result.suggestions = CurrentTargets(calorie_target=calories)
    if issue:
        result.messages.extend([issue, "Apply all suggested targets to replace the current calorie amount."])
        return result

    if 0.099 <= 4 * protein / selected_calories <= 0.351:
        result.suggestions.protein_target = protein
    else:
        result.messages.append("The 1.2 g/kg protein suggestion is outside the adult calorie-percentage range for your current calorie target. Apply all suggested targets or ask a clinician about your plan.")
    result.suggestions.fat_target = round(selected_calories * FAT_SHARE / 9, 1)
    selected_protein = current.protein_target or protein
    selected_fat = current.fat_target or result.suggestions.fat_target
    remainder = round((selected_calories - 4 * selected_protein - 9 * selected_fat) / 4, 1)
    issue = _macro_issue(selected_calories, selected_protein, selected_fat, remainder)
    if selected_protein < protein - 0.05:
        result.messages.append("Your current protein is below the app's 1.2 g/kg suggestion. Apply the protein suggestion before balancing carbs, or keep your clinician's targets manually.")
    elif issue:
        result.messages.append(issue)
    else:
        result.suggestions.carb_target = remainder
    if current.carb_target is not None:
        macro_calories = 4 * selected_protein + 9 * selected_fat + 4 * current.carb_target
        if abs(macro_calories - selected_calories) > max(10, selected_calories * 0.01):
            result.messages.append("Your current macros do not add up to the calorie target. Use the carbohydrate suggestion or apply all suggested targets to rebalance them.")
    if payload.goal == "build-muscle":
        result.messages.append("Muscle gain also requires appropriate resistance training. A calorie surplus alone does not guarantee muscle gain.")
    return result
