"""Route smoke tests for Feed Engine module."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

TEST_API_KEY = "test-module-api-key"
AUTH_HEADERS = {"x-module-key": TEST_API_KEY}


# ---------------------------------------------------------------------------
# Health & Manifest
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_root(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["module"] == "feed-engine"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_manifest(client):
    resp = await client.get("/manifest")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "feed-engine"
    assert "capabilities" in data
    assert "ingest" in data["capabilities"]


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "version" in data


# ---------------------------------------------------------------------------
# Feeds list
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_feeds_missing_api_key(client):
    """Omitting the API key header must return 422."""
    resp = await client.get("/feeds")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_feeds_wrong_api_key(client):
    """Wrong API key must return 401."""
    resp = await client.get("/feeds", headers={"x-module-key": "wrong-key"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_feeds_success(client):
    """Valid API key returns list of all 12 feeds."""
    resp = await client.get("/feeds", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "feeds" in data
    assert data["total"] == 12
    feed_names = {f["feed_name"] for f in data["feeds"]}
    assert "nvd" in feed_names
    assert "kev" in feed_names
    assert "mitre_attack" in feed_names


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_trigger_unknown_feed(client):
    """Triggering a non-existent feed returns 404."""
    resp = await client.post("/feeds/not_a_feed/trigger", headers=AUTH_HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_trigger_valid_feed(client):
    """Triggering a known feed queues it (mocked Redis/RQ)."""
    mock_queue = MagicMock()
    mock_queue.enqueue.return_value = MagicMock(id="fake-job-id")

    with patch("rq.Queue", return_value=mock_queue), \
         patch("redis.Redis.from_url", return_value=MagicMock()):
        resp = await client.post("/feeds/nvd/trigger", headers=AUTH_HEADERS)

    assert resp.status_code == 200
    data = resp.json()
    assert data["feed_name"] == "nvd"
    assert data["status"] == "queued"
