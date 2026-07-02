"""Configuration settings for the DataFun MCP server.

Reads from environment variables with .env file support.
The .env file is expected at the project root (two levels above this file).
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env at project root: mcp/core/config.py → mcp/core → mcp → project root
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """MCP server settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM / OpenRouter
    openrouter_api_key: str = ""
    litellm_default_model: str = "meta-llama/llama-3.3-70b-instruct"

    # Suggestion limits
    max_suggestions: int = 5


# Module-level singleton
settings = Settings()
