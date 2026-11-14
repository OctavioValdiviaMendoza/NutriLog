# NutriLog frontend integration contract

## Route flow

- `/` is public and links to signup or login.
- `/signup` creates an account, stores the returned user in the MVP `sessionStorage` session, and routes to `/onboarding/goals`.
- `/login` authenticates the user, stores the returned user in `sessionStorage`, and routes to `/dashboard`.
- `/onboarding/goals` will require a stored user and will save profile/goals data before routing to `/dashboard`.
- `/dashboard` will require a stored user and will load profile/goals, meals, and the daily summary from the API.

The current session is intentionally temporary for the prototype. It must not store or return a password. A secure cookie or token flow will replace it later.

## API conventions

- The API base URL is read once in `frontend/lib/api.ts` from `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000` for local development.
- Requests use JSON and `Content-Type: application/json`.
- API failures are converted to `Error` objects with `status` and `details` properties.
- The frontend uses snake_case field names for API payloads so it matches the current FastAPI schemas.

## Current endpoint examples

### Signup

```json
POST /auth/signup
{
  "name": "Octavio",
  "email": "octavio@example.com",
  "password": "temporary-local-password"
}
```

```json
{
  "id": 1,
  "name": "Octavio",
  "email": "octavio@example.com",
  "created_at": "2026-11-13T12:00:00Z"
}
```

### Profile/goals contract for the next backend change

```json
{
  "age": 24,
  "gender": "male",
  "activity_level": "moderate",
  "weight_lbs": 170,
  "height_feet": 5,
  "height_inches": 10,
  "goal": "maintain-weight",
  "goal_pace": "balanced",
  "calorie_target": 2400,
  "protein_target": 160,
  "carb_target": 280,
  "fat_target": 80
}
```

### Meal contract for the next backend change

```json
{
  "meal_type": "breakfast",
  "food_name": "Oatmeal with banana",
  "serving_size": "1 bowl",
  "calories": 420,
  "protein_g": 18,
  "carbs_g": 65,
  "fat_g": 10,
  "logged_date": "2026-11-13"
}
```

## Shared UI conventions

- Primary actions use the existing green filled button style.
- Forms use visible labels, rounded inputs, and a visible focus ring.
- Pending requests disable their submit button and show a progress label.
- Validation and API errors appear near the form and use plain language.
- Empty data gets an intentional explanation and a next action; it is not replaced with fake numbers.
- Cards use the existing rounded white surface and subtle shadow treatment.
