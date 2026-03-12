"""Pydantic schemas for Feed Engine API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FeedStatus(BaseModel):
    feed_name: str
    is_enabled: bool
    last_sync_at: datetime | None = None
    last_sync_count: int = 0
    total_ingested: int = 0
    error_count: int = 0
    last_error: str | None = None

    model_config = {"from_attributes": True}


class FeedListResponse(BaseModel):
    feeds: list[FeedStatus]
    total: int


class FeedTriggerResponse(BaseModel):
    feed_name: str
    status: str        # "queued" | "not_found" | "disabled"
    message: str


class FeedConfigUpdate(BaseModel):
    poll_interval_minutes: int | None = Field(None, ge=5, le=10080)
    is_enabled: bool | None = None
    config: dict | None = None


class HealthResponse(BaseModel):
    status: str        # "healthy" | "degraded" | "unhealthy"
    module_id: str
    version: str
    feeds_total: int
    feeds_healthy: int
    feeds_errored: int
    uptime_seconds: float


class ManifestResponse(BaseModel):
    id: str
    name: str
    version: str
    description: str
    capabilities: list[str]
    config_schema: dict
    health_endpoint: str
    plan_required: str
    event_publishes: list[str]
    event_subscribes: list[str]
