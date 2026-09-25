from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="FT_", extra="ignore")

    app_name: str = "Family Tree"
    database_url: str = "postgresql+asyncpg://familytree:familytree@localhost:5432/familytree"

    # SuperTokens
    supertokens_uri: str = "http://localhost:3567"
    supertokens_api_key: str | None = None
    # The browser talks to the API through the Vite dev proxy, so both share an origin in dev.
    website_domain: str = "http://localhost:5173"
    api_domain: str = "http://localhost:5173"
    api_base_path: str = "/api/auth"
    # Extra origins allowed to call the API directly (e.g. a future mobile/web client).
    cors_origins: list[str] = []

    invite_ttl_days: int = 14

    # Skips SuperTokens initialisation; tests inject the current user directly.
    testing: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
