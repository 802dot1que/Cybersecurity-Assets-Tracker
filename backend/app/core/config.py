from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Asset Inventory"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+psycopg://inventory:inventory@db:5432/inventory"
    REDIS_URL: str = "redis://redis:6379/0"

    JWT_SECRET: str = "change-me-in-prod"
    JWT_ALG: str = "HS256"
    JWT_ACCESS_TTL_MIN: int = 60
    JWT_REFRESH_TTL_DAYS: int = 14

    UPLOAD_MAX_MB: int = 50
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost"]

    # Fuzzy matching
    HOSTNAME_FUZZY_THRESHOLD: int = 90

    # Nessus integration
    NESSUS_URL: str = "https://nessus:8834"
    NESSUS_ACCESS_KEY: str = ""
    NESSUS_SECRET_KEY: str = ""
    NESSUS_VERIFY_SSL: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
