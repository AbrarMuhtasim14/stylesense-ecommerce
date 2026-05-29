"""
StyleSense Backend Configuration
Loads environment variables and provides typed settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str = "product-images"

    # Google Gemini
    gemini_api_key: str

    # Application
    admin_password: str
    image_weight: float = 0.6

    # Server
    host: str = "0.0.0.0"
    port: int = 7860
    debug: bool = False

    # CLIP
    clip_model: str = "ViT-B-32"
    clip_pretrained: str = "openai"

    # Gemini
    gemini_model: str = "gemini-2.5-flash"

    # OpenRouter (fallback when Gemini rate-limited)
    openrouter_api_key: str = ""
    openrouter_model: str = "qwen/qwen3-vl-32b-instruct"

    # Search defaults
    default_match_threshold: float = 0.10
    default_match_count: int = 20

    # Chat session
    max_chat_sessions: int = 50
    chat_session_ttl_seconds: int = 3600  # 1 hour

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
