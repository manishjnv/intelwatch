"""Feed Engine module configuration."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # General
    environment: str = "development"
    log_level: str = "INFO"
    module_id: str = "feed-engine"
    module_version: str = "1.0.0"

    # Platform integration
    platform_url: str = "http://platform:8000"  # main platform base URL
    module_api_key: str = "change-me"           # shared secret with platform
    module_port: int = 8001

    # PostgreSQL (shared with platform)
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "threat_intel"
    postgres_user: str = "ti_user"
    postgres_password: str = "changeme"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis (shared with platform)
    redis_url: str = "redis://redis:6379/0"

    # Feed API keys
    nvd_api_key: str = ""
    abuseipdb_api_key: str = ""
    otx_api_key: str = ""
    virustotal_api_key: str = ""
    shodan_api_key: str = ""

    # Feed scheduling
    feed_poll_interval_minutes: int = 60   # default poll interval
    feed_retry_attempts: int = 3
    feed_timeout_seconds: int = 60

    # Plan limits (enforced by platform, but checked here too)
    max_feeds_free: int = 5
    max_feeds_starter: int = 999           # all feeds
    delay_hours_free: int = 24             # free tier data delay


@lru_cache
def get_settings() -> Settings:
    return Settings()
