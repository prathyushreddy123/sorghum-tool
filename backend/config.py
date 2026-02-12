import os

GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")
AI_CLASSIFICATION_ENABLED: bool = os.getenv("AI_CLASSIFICATION_ENABLED", "true").lower() == "true"
