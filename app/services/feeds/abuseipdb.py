"""AbuseIPDB feed connector (free tier: 1000 checks/day)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.config import get_settings
import logging`r`nfrom app.services.feeds.base import BaseFeedConnector

logger = logging.getLogger(__name__)
settings = get_settings()

ABUSEIPDB_BLACKLIST_URL = "https://api.abuseipdb.com/api/v2/blacklist"
ABUSEIPDB_CHECK_URL = "https://api.abuseipdb.com/api/v2/check"

# Public seed source for IPs to check (stamparm/ipsum — high-confidence malicious IPs)
IPSUM_URL = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"
IPSUM_MIN_SCORE = 8
MAX_CHECKS_PER_CYCLE = 25  # Stay well under 1000/day free-tier limit


class AbuseIPDBConnector(BaseFeedConnector):
    FEED_NAME = "abuseipdb"
    SOURCE_RELIABILITY = 80

    async def fetch(self, last_cursor: str | None = None) -> list[dict]:
        if not settings.abuseipdb_api_key:
            logger.warning("abuseipdb_no_api_key")
            return []

        headers = {
            "Key": settings.abuseipdb_api_key,
            "Accept": "application/json",
        }

        # Try the blacklist endpoint first (requires paid plan)
        try:
            params = {"confidenceMinimum": 90, "limit": 500}
            response = await self.client.get(ABUSEIPDB_BLACKLIST_URL, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            items = data.get("data", [])
            if items:
                logger.info("abuseipdb_fetch_blacklist", total=len(items))
                return items
        except Exception as e:
            logger.info("abuseipdb_blacklist_unavailable", error=str(e)[:200])

        # Fallback: check individual IPs from public threat lists (free tier)
        seed_ips = await self._fetch_seed_ips()
        if not seed_ips:
            logger.warning("abuseipdb_no_seed_ips")
            return []

        # Rotate through seed IPs using cursor offset
        offset = 0
        if last_cursor:
            try:
                offset = int(last_cursor)
            except (ValueError, TypeError):
                pass

        offset = offset % len(seed_ips)
        batch = seed_ips[offset : offset + MAX_CHECKS_PER_CYCLE]
        if len(batch) < MAX_CHECKS_PER_CYCLE:
            batch += seed_ips[: MAX_CHECKS_PER_CYCLE - len(batch)]

        items = []
        for ip in batch:
            try:
                resp = await self.client.get(
                    ABUSEIPDB_CHECK_URL,
                    headers=headers,
                    params={"ipAddress": ip, "maxAgeInDays": 90, "verbose": ""},
                )
                if resp.status_code == 429:
                    logger.warning("abuseipdb_rate_limited")
                    break
                if resp.status_code == 200:
                    entry = resp.json().get("data", {})
                    if entry and entry.get("abuseConfidenceScore", 0) >= 50:
                        items.append(entry)
            except Exception as e:
                logger.debug("abuseipdb_check_error", ip=ip, error=str(e)[:100])

        self._next_cursor = str(offset + MAX_CHECKS_PER_CYCLE)
        logger.info("abuseipdb_fetch_check", total=len(items), checked=len(batch))
        return items

    async def _fetch_seed_ips(self) -> list[str]:
        """Fetch high-confidence malicious IPs from IPsum."""
        import random
        try:
            resp = await self.client.get(IPSUM_URL, timeout=30)
            if resp.status_code != 200:
                return []
            ips = []
            for line in resp.text.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 2:
                    try:
                        score = int(parts[1])
                        if score >= IPSUM_MIN_SCORE:
                            ips.append(parts[0])
                    except ValueError:
                        continue
            random.shuffle(ips)
            return ips[:500]
        except Exception as e:
            logger.error("abuseipdb_seed_error", error=str(e))
            return []

    def normalize(self, raw_items: list[dict]) -> list[dict]:
        items = []
        for raw in raw_items:
            ip = raw.get("ipAddress", "")
            if not ip:
                continue

            abuse_score = raw.get("abuseConfidenceScore", 0)
            country = raw.get("countryCode", "")
            last_reported = raw.get("lastReportedAt", "")

            # Map abuse score to severity
            if abuse_score >= 90:
                severity = "critical"
            elif abuse_score >= 70:
                severity = "high"
            elif abuse_score >= 50:
                severity = "medium"
            else:
                severity = "low"

            published_at = None
            if last_reported:
                try:
                    published_at = datetime.fromisoformat(last_reported.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            geo = [country] if country else []

            items.append({
                "id": uuid.uuid4(),
                "title": f"[AbuseIPDB] Malicious IP: {ip}",
                "summary": f"Abuse score: {abuse_score}% | Country: {country or 'Unknown'}",
                "description": f"IP address {ip} reported to AbuseIPDB with {abuse_score}% confidence.",
                "published_at": published_at,
                "ingested_at": self.now_utc(),
                "updated_at": self.now_utc(),
                "severity": severity,
                "risk_score": 0,
                "confidence": min(abuse_score, 100),
                "source_name": "AbuseIPDB",
                "source_url": f"https://www.abuseipdb.com/check/{ip}",
                "source_reliability": self.SOURCE_RELIABILITY,
                "source_ref": ip,
                "feed_type": "ioc",
                "asset_type": "ip",
                "tlp": "TLP:CLEAR",
                "tags": ["malicious_ip", severity],
                "geo": geo,
                "industries": [],
                "cve_ids": [],
                "affected_products": [],
                "related_ioc_count": 1,
                "is_kev": False,
                "exploit_available": False,
                "exploitability_score": None,
                "source_hash": self.generate_hash("abuseipdb", ip),
            })

        return items
