# NutriLog

NutriLog is a nutrition-tracking web application that allows users to create accounts, set personalized nutrition goals, log meals, save recipes, and monitor daily calorie and macronutrient consumption.

## Technology Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Python 3.11, FastAPI, Pydantic, SQLAlchemy
- **Database:** PostgreSQL 16
- **Development infrastructure:** Docker Compose
- **Testing:** pytest

## Prerequisites

Install the following before running the project:

- Git
- Python 3.11
- Node.js and npm compatible with Next.js 16
- Docker Desktop with Docker Compose

## 1. Clone the Repository

```bash
git clone https://github.com/OctavioValdiviaMendoza/NutriLog.git
cd NutriLog
```

Check out the branch containing the features you intend to test. The development and integration branches may contain functionality not yet merged into `main`.

## 2. Start PostgreSQL

From the project root:

```bash
docker compose up -d db
```

Verify the database is ready:

```bash
docker compose exec db pg_isready -U nutrilog -d nutrilog
```

Local development configuration:

| Setting | Value |
|---|---|
| Host | localhost |
| Port | 5433 |
| Database | nutrilog |
| Username | nutrilog |
| Password | nutrilog |

These credentials are intended only for local development.

## 3. Configure the Backend

Create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

For local development, verify the database URL is:

```env
DATABASE_URL=postgresql+psycopg://nutrilog:nutrilog@localhost:5433/nutrilog
```

Other development settings include:

```env
AUTO_CREATE_TABLES=true
SESSION_COOKIE_NAME=nutrilog_session
SESSION_MAX_AGE_SECONDS=604800
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

If USDA FoodData Central integration is required, configure `FDC_API_KEY` in the local backend environment file.

Never commit real API keys or production credentials.

### Create the Python Environment

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## 4. Apply Database Migrations

Return to the project root:

```bash
cd ..
```

Apply the initial database schema:

```bash
docker compose exec -T db psql \
  -X -v ON_ERROR_STOP=1 \
  -U nutrilog -d nutrilog \
  -f /dev/stdin < backend/users_migration.sql
```

Apply the meal integrity migration:

```bash
docker compose exec -T db psql \
  -X -v ON_ERROR_STOP=1 \
  -U nutrilog -d nutrilog \
  -f /dev/stdin < backend/migrations/002_meal_integrity.sql
```

These migrations have been verified against a clean PostgreSQL database and rerun successfully against an existing schema.

The second migration adds numeric integrity constraints and a composite `(user_id, logged_date)` index.

`AUTO_CREATE_TABLES=true` is a local development convenience. It does not replace migrations for existing database tables.

## 5. Start FastAPI

Open a terminal:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

API documentation:

http://localhost:8000/docs

## 6. Start Next.js

Open another terminal:

```bash
cd frontend
npm ci
```

Create or update `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Open:

http://localhost:3000

**Important:** Use `localhost` consistently for the frontend and backend URLs during local development. Mixing `localhost` and `127.0.0.1` can interfere with cookie-based authentication.

## 7. Run Backend Tests

From the backend directory with the virtual environment activated:

```bash
python -m pytest tests/ -v
```

The current integration branch has 103 passing backend tests, covering:

- Authentication and profile persistence
- Profile validation and user isolation
- BMR and activity-adjusted TDEE calculations
- Meal database integrity
- Meal CRUD and ownership
- Daily nutrition summaries
- Recipe access control
- Invalid and expired sessions

Tests that create temporary accounts clean up their records afterward.

## 8. Frontend Checks

From the frontend directory:

```bash
npm run lint
npm run build
```

These commands should be run before preparing a release or merging frontend changes.

## 9. Manual Demo Workflow

1. Open the NutriLog landing page.
2. Create an account.
3. Complete onboarding and save nutrition goals.
4. Open the dashboard.
5. Log a meal.
6. Verify that calories and macros update.
7. Edit a meal's quantity and verify recalculation.
8. Delete a meal and verify that totals decrease.
9. Change the selected date and verify date-specific totals.
10. Log out and log back in to verify session persistence.

Some meal editing and deletion features may currently be available through the API before corresponding frontend controls are implemented.

## 10. Stopping the Application

Stop FastAPI and Next.js using `Control + C`.

Stop PostgreSQL without deleting its data:

```bash
docker compose stop db
```

Do not use `docker compose down -v` unless intentionally deleting the PostgreSQL volume.

## 11. Security and Deployment Notes

- Protected endpoints identify users through authenticated sessions.
- Users cannot access other users' profiles, meals, or recipes through the tested routes.
- Session cookies are HTTP-only.
- `COOKIE_SECURE=false` is intended for local HTTP development only.
- Production deployments should use HTTPS, secure cookies, appropriately restricted CORS origins, strong credentials, and explicit database migrations.
- The local Docker database credentials must not be reused in production.
- Environment files and virtual environments should not be committed.

## 12. Known Limitations

- Photo-assisted food recognition remains outside the verified MVP.
- Meal recommendations and social features are not part of the current tested backend.
- The TDEE endpoint calculates estimated daily energy expenditure but is not yet integrated into automatic onboarding target recommendations.
- Frontend meal editing and deletion controls require separate verification.
- External USDA food search requires valid API configuration and network access.

## Contributors

Octavio Valdivia Mendoza and Guadalupe Carrillo Vega

San José State University — Computer Science Term Project