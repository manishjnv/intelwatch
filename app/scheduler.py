"""APScheduler — schedules periodic feed ingestion jobs."""

from __future__ import annotations

import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import timedelta, datetime, timezone
from redis import Redis
from rq import Queue
from rq_scheduler import Scheduler

from app.config import get_settings
from app.services.registry import CONNECTOR_REGISTRY

settings = get_settings()
redis_conn = Redis.from_url(settings.redis_url)
scheduler = Scheduler(queue_name="feeds", connection=redis_conn)


def schedule_all():
    """Clear existing jobs and re-register all feed schedules."""
    # Clear old feed jobs
    for job in scheduler.get_jobs():
        scheduler.cancel(job)

    now = datetime.now(timezone.utc)

    # Schedule each connector at its default interval
    INTERVALS = {
        "nvd":              timedelta(minutes=30),
        "kev":              timedelta(hours=6),
        "urlhaus":          timedelta(hours=1),
        "otx":              timedelta(hours=2),
        "threatfox":        timedelta(hours=2),
        "malwarebazaar":    timedelta(hours=3),
        "virustotal":       timedelta(hours=6),
        "shodan":           timedelta(hours=12),
        "abuseipdb":        timedelta(hours=4),
        "cisa_advisories":  timedelta(hours=6),
        "exploitdb":        timedelta(hours=12),
        "mitre_attack":     timedelta(hours=168),  # weekly
    }

    for feed_name in CONNECTOR_REGISTRY:
        interval = INTERVALS.get(feed_name, timedelta(hours=1))
        scheduler.schedule(
            scheduled_time=now + timedelta(minutes=5),  # start 5 min after launch
            func="app.worker.run_feed",
            args=[feed_name],
            interval=int(interval.total_seconds()),
            repeat=None,
            id=f"feed:{feed_name}",
            description=f"Feed sync: {feed_name}",
            queue_name="feeds",
        )
        print(f"Scheduled {feed_name} every {interval}")

    print(f"Scheduled {len(CONNECTOR_REGISTRY)} feed jobs")


if __name__ == "__main__":
    schedule_all()
    print("Scheduler running...")
    scheduler.run()
