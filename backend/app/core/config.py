from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_DEFAULT_DB_PATH = (_BACKEND_DIR / "travelsenseai.db").as_posix()


class Settings(BaseSettings):
    PROJECT_NAME: str = "TravelSenseAI"
    VERSION: str = "0.3.0"
    DESCRIPTION: str = "Intelligent AI-Powered Travel Planning and Tourism Recommendation Platform"
    API_PREFIX: str = "/api"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8005
    LOG_LEVEL: str = "INFO"

    # Database Configuration (SQLite default pointing to backend/travelsenseai.db)
    DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH}"

    # Security & JWT Configuration
    JWT_SECRET_KEY: str = "travelsenseai_super_secret_jwt_key_2026_change_in_production_9f8e7d"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # External APIs Configuration
    GEOAPIFY_API_KEY: str = "a212b99a65ea4fb986991545e1df0573"
    ORS_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    GOOGLE_PLACES_API_KEY: str = ""
    GOOGLE_ROUTES_API_KEY: str = ""
    
    # External API client settings
    EXTERNAL_API_TIMEOUT_SECONDS: float = 12.0
    CACHE_DEFAULT_TTL_SECONDS: int = 3600  # 1 hour in-memory cache

    # CORS configuration - supports JSON list or comma-separated string
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
