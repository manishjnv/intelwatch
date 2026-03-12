"""Pytest fixtures for Feed Engine module tests."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import get_settings

TEST_API_KEY = "test-module-api-key"


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """Override settings for testing — no real DB/Redis needed for route tests."""
    monkeypatch.setenv("MODULE_API_KEY", TEST_API_KEY)
    monkeypatch.setenv("PLATFORM_URL", "http://fake-platform:8000")
    monkeypatch.setenv("POSTGRES_PASSWORD", "test")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/15")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def mock_db():
    """Return a mock async DB session."""
    session = AsyncMock()
    # Default: empty result set
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_result.scalar_one_or_none.return_value = None
    session.execute.return_value = mock_result
    return session


@pytest.fixture
async def client(mock_db):
    """Async HTTP test client with mocked DB and registration."""
    from app.database import get_db

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db

    # Prevent the lifespan from trying to connect to real DB/platform
    with patch("app.main.engine", MagicMock()), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()
