"""RQ Worker entry point for Feed Engine."""

from __future__ import annotations

import os
import sys

# Ensure app is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from redis import Redis
from rq import Worker, Queue

from app.config import get_settings

settings = get_settings()

redis_conn = Redis.from_url(settings.redis_url)


async def run_feed(feed_name: str):
    """Run a single feed sync. Called by RQ worker."""
    from app.services.registry import CONNECTOR_REGISTRY
    from app.database import AsyncSessionLocal
    from app.models import FeedSyncState
    from sqlalchemy import select
    from datetime import datetime, timezone

    connector_class = CONNECTOR_REGISTRY.get(feed_name)
    if not connector_class:
        print(f"Unknown feed: {feed_name}")
        return

    connector = connector_class()
    async with AsyncSessionLocal() as db:
        # Get last cursor
        row = await db.execute(select(FeedSyncState).where(FeedSyncState.feed_name == feed_name))
        state = row.scalar_one_or_none()
        last_cursor = state.last_cursor if state else None

        try:
            raw_items = await connector.fetch_with_retry(last_cursor)
            normalized = connector.normalize(raw_items)

            count = len(normalized)
            now = datetime.now(timezone.utc)

            # Upsert state
            if not state:
                state = FeedSyncState(feed_name=feed_name)
                db.add(state)

            state.last_sync_at = now
            state.last_sync_count = count
            state.total_ingested += count
            state.last_error = None
            state.last_cursor = now.isoformat()
            await db.commit()

            # Publish event to Redis
            try:
                import json
                redis_conn.publish("intel:batch_complete", json.dumps({
                    "feed_name": feed_name,
                    "count": count,
                }))
            except Exception:
                pass

            print(f"[{feed_name}] synced {count} items")

        except Exception as e:
            if state:
                state.last_error = str(e)
                state.error_count = (state.error_count or 0) + 1
                await db.commit()
            print(f"[{feed_name}] ERROR: {e}")
        finally:
            await connector.close()


if __name__ == "__main__":
    queues = [Queue("feeds", connection=redis_conn)]
    worker = Worker(queues, connection=redis_conn)
    worker.work()
