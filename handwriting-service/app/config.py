"""Configuration for Handwriting Service"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "").strip() or os.getenv("MISTRAL_KEY", "").strip()
if MISTRAL_API_KEY in {"your_mistral_api_key_here", "your_api_key_here", "placeholder", "dummy", ""}:
    MISTRAL_API_KEY = ""
HANDWRITING_FALLBACK_MODE = os.getenv("HANDWRITING_FALLBACK_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS]

# Supported image formats
SUPPORTED_FORMATS = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def has_valid_mistral_api_key() -> bool:
    """Return True when a non-placeholder Mistral key is configured."""
    return bool(MISTRAL_API_KEY) and MISTRAL_API_KEY.lower() not in {
        "your_mistral_api_key_here",
        "your_api_key_here",
        "placeholder",
        "dummy",
    }
