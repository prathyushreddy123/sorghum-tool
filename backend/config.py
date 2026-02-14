import secrets

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./sorghum.db"

    # Auth
    SECRET_KEY: str = secrets.token_hex(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # CORS
    CORS_ORIGINS: str = "*"

    # File storage
    UPLOAD_DIR: str = ""
    GCS_BUCKET: str = ""

    # AI services
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    AI_CLASSIFICATION_ENABLED: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()

# Convenience aliases for backward compatibility
GEMINI_API_KEY = settings.GEMINI_API_KEY or None
GROQ_API_KEY = settings.GROQ_API_KEY or None
AI_CLASSIFICATION_ENABLED = settings.AI_CLASSIFICATION_ENABLED
