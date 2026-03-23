"""
Application configuration loaded from environment variables.
"""
import logging
import os
import secrets
import ssl
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env file from the backend directory
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── LLM ──────────────────────────────────────────────────
    llm_api_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "nvidia/nemotron-3-nano-30b-a3b-fp8"
    embedding_model: str = "nvidia/nv-embed-v2"
    llm_max_tokens: int = 8192
    vision_model: str = ""  # Optional: vision model for slide QA (empty = disabled)
    vlm_dpi: int = 96  # DPI for VLM image rendering (higher = better quality, slower)

    # ── Data paths ───────────────────────────────────────────
    upload_dir: str = os.getenv("UPLOAD_DIR", "/data/uploads")
    chroma_db_dir: str = os.getenv("CHROMA_DB_DIR", "/data/chroma_db")

    # ── Auth & CORS ────────────────────────────────────────
    environment: str = "development"  # Set to "production" to enforce JWT_SECRET_KEY
    jwt_secret_key: str = ""
    jwt_expiry_hours: int = 24
    cors_origins: str = "http://localhost:3000,http://localhost:3100"
    max_upload_size_mb: int = 50

    # ── RAG settings ─────────────────────────────────────────
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k: int = 5
    temperature: float = 0.1

    class Config:
        env_file = str(_backend_dir / ".env")
        extra = "ignore"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret_key:
        if s.environment == "production":
            raise RuntimeError(
                "JWT_SECRET_KEY must be set in production. "
                "Set it in your environment or .env file."
            )
        # Development only: generate a random key for this session.
        # WARNING: tokens become invalid on restart.
        s.jwt_secret_key = secrets.token_hex(32)
        log.warning(
            "JWT_SECRET_KEY is not set. A random key has been generated for this session. "
            "All users will be logged out on restart. Set JWT_SECRET_KEY in .env to avoid this."
        )
    return s


def create_ssl_context() -> ssl.SSLContext:
    """Create an SSL context that skips verification (self-signed cert)."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx
