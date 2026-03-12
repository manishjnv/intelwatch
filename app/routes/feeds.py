"""Feed management routes — list, trigger, configure feeds."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import FeedSyncState, FeedConfig
from app.schemas import FeedStatus, FeedListResponse, FeedTriggerResponse, FeedConfigUpdate
from app.services.registry import CONNECTOR_REGISTRY

router = APIRouter(prefix="/feeds", tags=["feeds"])


def verify_api_key(x_module_key: str = Header(...)):
    """Verify the shared API key from platform gateway."""
    from app.config import get_settings
    settings = get_settings()
    if x_module_key != settings.module_api_key:
        raise HTTPException(status_code=401, detail="Invalid module API key")
    return x_module_key


@router.get("", response_model=FeedListResponse)
async def list_feeds(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: str = Depends(verify_api_key),
):
    """List all feed connectors with their current status."""
    rows = await db.execute(select(FeedSyncState))
    states = {row.feed_name: row for row in rows.scalars().all()}

    feeds = []
    for name in CONNECTOR_REGISTRY:
        state = states.get(name)
        feeds.append(FeedStatus(
            feed_name=name,
            is_enabled=state.is_enabled if state else True,
            last_sync_at=state.last_sync_at if state else None,
            last_sync_count=state.last_sync_count if state else 0,
            total_ingested=state.total_ingested if state else 0,
            error_count=state.error_count if state else 0,
            last_error=state.last_error if state else None,
        ))

    return FeedListResponse(feeds=feeds, total=len(feeds))


@router.post("/{feed_name}/trigger", response_model=FeedTriggerResponse)
async def trigger_feed(
    feed_name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: str = Depends(verify_api_key),
):
    """Manually trigger an immediate sync for one feed."""
    if feed_name not in CONNECTOR_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Feed '{feed_name}' not found")

    # Check if enabled
    row = await db.execute(select(FeedSyncState).where(FeedSyncState.feed_name == feed_name))
    state = row.scalar_one_or_none()
    if state and not state.is_enabled:
        return FeedTriggerResponse(feed_name=feed_name, status="disabled", message="Feed is disabled")

    # Queue the job via Redis RQ
    try:
        from redis import Redis
        from rq import Queue
        from app.config import get_settings
        settings = get_settings()
        redis_conn = Redis.from_url(settings.redis_url)
        q = Queue("feeds", connection=redis_conn)
        q.enqueue("app.worker.run_feed", feed_name, job_timeout=300)
        return FeedTriggerResponse(feed_name=feed_name, status="queued", message=f"Feed '{feed_name}' queued for immediate sync")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trigger-all", response_model=list[FeedTriggerResponse])
async def trigger_all_feeds(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: str = Depends(verify_api_key),
):
    """Trigger all enabled feeds immediately."""
    results = []
    for feed_name in CONNECTOR_REGISTRY:
        try:
            from redis import Redis
            from rq import Queue
            from app.config import get_settings
            settings = get_settings()
            redis_conn = Redis.from_url(settings.redis_url)
            q = Queue("feeds", connection=redis_conn)
            q.enqueue("app.worker.run_feed", feed_name, job_timeout=300)
            results.append(FeedTriggerResponse(feed_name=feed_name, status="queued", message="Queued"))
        except Exception as e:
            results.append(FeedTriggerResponse(feed_name=feed_name, status="error", message=str(e)))
    return results


@router.patch("/{feed_name}/config", response_model=FeedStatus)
async def update_feed_config(
    feed_name: str,
    update: FeedConfigUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: str = Depends(verify_api_key),
):
    """Update feed configuration (interval, enabled state)."""
    if feed_name not in CONNECTOR_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Feed '{feed_name}' not found")

    row = await db.execute(select(FeedSyncState).where(FeedSyncState.feed_name == feed_name))
    state = row.scalar_one_or_none()
    if not state:
        raise HTTPException(status_code=404, detail="Feed state not found — run a sync first")

    if update.is_enabled is not None:
        state.is_enabled = update.is_enabled

    await db.commit()
    await db.refresh(state)
    return FeedStatus.model_validate(state)
