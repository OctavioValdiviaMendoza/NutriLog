# Nutrition suggestions: adult-v1

`POST /calculations/recommendations` returns estimates without saving eligibility
answers or changing a profile. This is a deterministic calculator, not trained ML.

- Maintenance/wellness use existing Mifflin–St Jeor TDEE. Loss subtracts 5/10/15%
  for gentle/balanced/ambitious pace, capped at 500 kcal/day. Gain/muscle add those
  percentages, capped at 300 kcal/day. These are app defaults, not prescribed rates.
- Protein: 1.2 × pounds × 0.45359237 grams. Fat: selected calories × 0.30 / 9 grams.
  Carbs: (selected calories − protein × 4 − fat × 9) / 4 grams. Grams round to one
  decimal. Full plans balance within 1 kcal after rounding.
- Automatic eligibility: 18+, explicitly general adult, BMI 18.5 to under 40.
  Pregnancy/breastfeeding, clinician-directed diets and uncertain eligibility get
  explanations, without automatic targets. BMI is a screen, not a diagnosis.
- App calorie bounds: 1,500–6,000 for the male equation; 1,200–6,000 for the female
  equation. These limits do not guarantee an appropriate diet for an individual.
- Adult planning ranges: protein 10–35%, fat 20–35%, carbs 45–65% of calories,
  allowing 0.1 percentage point rounding tolerance. Incompatible plans are withheld.
- Individual suggestions respect manually entered calories/protein/fat, without
  overwriting them. Incompatible entries disable carbohydrate balancing. Apply-all
  uses the coherent goal-based plan instead. Manual targets remain editable.
- Total fat is not saturated fat. The app cannot yet validate saturated fat intake.
  Surplus calories do not guarantee muscle gain; resistance training also matters.

## Sources

- [Dietary Guidelines for Americans 2025–2030](https://www.realfood.gov/documents/DGA.pdf):
  protein goal 1.2–1.6 g/kg/day and saturated fat generally at most 10% of calories.
- [National Academies adult macro ranges](https://www.nationalacademies.org/read/27957/chapter/5).
- [NIH Body Weight Planner](https://www.niddk.nih.gov/bwp): adult-only eligibility
  excluding pregnancy/breastfeeding. Its 1,000 kcal limit is not our app's policy.

Review date: November 23, 2026. Clinical review is needed before extending this
feature beyond general adult planning. No specific weekly weight result is promised.
