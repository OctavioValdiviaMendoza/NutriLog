# NutriLog frontend

## Local development

From the repository root, start PostgreSQL and the API first:

```powershell
docker compose up -d db
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. The API should be available at `http://localhost:8000`.

## Verified user flow

1. Create an account and complete onboarding.
2. Confirm the dashboard shows saved targets and zero values on a new day.
3. Log a USDA food, manual food, and saved recipe.
4. Confirm dashboard totals update without a manual refresh.
5. Edit a meal's quantity/date, then confirm the correct day's totals change.
6. Delete a meal and confirm the totals decrease.
7. Change the selected date and confirm meals do not leak across dates.
8. Log out, log back in, and confirm the dashboard reloads from the API.

## Frontend checks

```powershell
npm run lint
npm run build
```

The frontend uses an HttpOnly backend session cookie. Do not add API keys or session values to `NEXT_PUBLIC_*` variables.
