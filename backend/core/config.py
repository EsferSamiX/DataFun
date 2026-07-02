from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Auth
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # MCP Server
    MCP_SERVER_URL: str = "http://localhost:8001/mcp"

    # LLM
    OPENROUTER_API_KEY: str
    LITELLM_DEFAULT_MODEL: str = "meta-llama/llama-3.3-70b-instruct"
    LITELLM_EMBEDDING_MODEL: str = "openai/text-embedding-3-small"

    # App
    MAX_CHAT_HISTORY: int = 10
    MAX_UPLOAD_SIZE_MB: int = 200
    PROFILE_CACHE_TTL_SECONDS: int = 86400


settings = Settings()
