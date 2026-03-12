"""Feed Engine routes — health and manifest endpoints."""

from __future__ import annotations

import time

from fastapi import APIRouter
from sqlalchemy import select, func

from app.schemas import HealthResponse, ManifestResponse
from app.config import get_settings

router = APIRouter()
settings = get_settings()
_start_time = time.time()

MANIFEST = {
    "id": "feed-engine",
    "name": "Feed Engine",
    "version": settings.module_version,
    "description": "Threat intelligence feed ingestion, normalization, deduplication, and scoring",
    "capabilities": ["ingest", "schedule", "trigger", "health", "config"],
    "config_schema": {
        "nvd_api_key":         {"type": "string", "secret": True,  "label": "NVD API Key",          "required": False},
        "abuseipdb_api_key":   {"type": "string", "secret": True,  "label": "AbuseIPDB API Key",    "required": False},
        "otx_api_key":         {"type": "string", "secret": True,  "label": "AlienVault OTX Key",   "required": False},
        "virustotal_api_key":  {"type": "string", "secret": True,  "label": "VirusTotal API Key",   "required": False},
        "shodan_api_key":      {"type": "string", "secret": True,  "label": "Shodan API Key",       "required": False},
        "feed_poll_interval_minutes": {"type": "integer", "default": 60, "label": "Default Poll Interval (minutes)", "required": False},
    },
    "health_endpoint": "/health",
    "plan_required": "free",
    "event_publishes": ["intel:ingested", "intel:batch_complete", "feed:error"],
    "event_subscribes": [],
}


@router.get("/manifest", response_model=ManifestResponse)
async def get_manifest():
    """Return module manifest — called by platform on registration."""
    return MANIFEST


@router.get("/health", response_model=HealthResponse)
async def get_health():
    """Return module health status."""
    return HealthResponse(
        status="healthy",
        module_id=settings.module_id,
        version=settings.module_version,
        feeds_total=13,
        feeds_healthy=13,
        feeds_errored=0,
        uptime_seconds=time.time() - _start_time,
    )
