from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.models import User  # noqa: F401 - registers models with Base.metadata


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Local development fallback. Production deployments should run the Lambda
    # migration and set AUTO_CREATE_TABLES=false.
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="NutriLog API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
