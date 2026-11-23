from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str
    fdc_api_key: str | None = None
    fdc_api_base_url: str = "https://api.nal.usda.gov/fdc/v1"
    auto_create_tables: bool = True
    session_cookie_name: str = "nutrilog_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 7
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    ml_service_url: str = "http://127.0.0.1:8001"

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
