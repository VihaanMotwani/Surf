from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./surf.db"
    task_poll_interval: float = 2.0
    task_claim_limit: int = 1
    max_events_per_poll: int = 100
    openai_model: str = "gpt-4.1-mini"
    openai_api_key: str | None = None
    browser_use_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
