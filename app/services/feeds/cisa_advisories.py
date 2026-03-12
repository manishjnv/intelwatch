"""GitHub Advisory Database feed connector — advisory feed.

Free, no API key required.  Fetches reviewed security advisories from
the GitHub Advisory Database REST API.
https://docs.github.com/en/rest/security-advisories/global-advisories

Populates feed_type: "advisory".
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import logging`r`nfrom app.services.feeds.base import BaseFeedConnector

logger = logging.getLogger(__name__)

GHSA_API_URL = "https://api.github.com/advisories"


class CISAAdvisoriesConnector(BaseFeedConnector):
    """Fetches from GitHub Advisory Database (class name kept for registry compat)."""

    FEED_NAME = "cisa_advisories"
    SOURCE_RELIABILITY = 90

    async def fetch(self, last_cursor: str | None = None) -> list[dict]:
        """Fetch recent reviewed advisories from GitHub Advisory DB."""
        params: dict = {
            "per_page": 100,
            "type": "reviewed",
            "direction": "desc",
            "sort": "updated",
        }
        if last_cursor:
            params["updated"] = last_cursor

        response = await self.client.get(
            GHSA_API_URL,
            params=params,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "IntelWatch/1.0 TI-Platform",
            },
        )
        response.raise_for_status()
        items = response.json()

        logger.info("github_advisories_fetch", total=len(items))

        if items:
            dates = [self._parse_iso(i.get("updated_at")) for i in items]
            valid = [d for d in dates if d]
            if valid:
                self._next_cursor = max(valid).isoformat()

        return items

    def _parse_iso(self, s: str | None) -> datetime | None:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    def _map_severity(self, severity: str | None) -> str:
        return {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}.get(
            (severity or "").lower(), "medium"
        )

    def _extract_cves(self, advisory: dict) -> list[str]:
        cves = []
        for ident in advisory.get("identifiers", []):
            if ident.get("type") == "CVE":
                cves.append(ident["value"])
        # Also check cve_id field
        cve_id = advisory.get("cve_id")
        if cve_id and cve_id not in cves:
            cves.append(cve_id)
        return cves[:15]

    def _extract_products(self, advisory: dict) -> list[str]:
        products = set()
        for vuln in advisory.get("vulnerabilities", []) or []:
            pkg = vuln.get("package", {})
            name = pkg.get("name", "")
            ecosystem = pkg.get("ecosystem", "")
            if name:
                products.add(f"{ecosystem}/{name}" if ecosystem else name)
        return list(products)[:10]

    def _extract_cwes(self, advisory: dict) -> list[str]:
        cwes = []
        for cwe in advisory.get("cwes", []) or []:
            cwe_id = cwe.get("cwe_id", "")
            if cwe_id:
                cwes.append(cwe_id)
        return cwes[:5]

    def normalize(self, raw_items: list[dict]) -> list[dict]:
        items = []
        for raw in raw_items:
            ghsa_id = raw.get("ghsa_id", "")
            title = raw.get("summary", "") or ghsa_id
            description = raw.get("description", "") or title
            severity = self._map_severity(raw.get("severity"))
            cves = self._extract_cves(raw)
            products = self._extract_products(raw)
            cwes = self._extract_cwes(raw)
            published = self._parse_iso(raw.get("published_at"))
            updated = self._parse_iso(raw.get("updated_at"))

            tags = ["advisory", "github_advisory"]
            if raw.get("type"):
                tags.append(raw["type"].lower())
            for cwe in cwes:
                tags.append(cwe.lower())
            ecosystem_set = set()
            for vuln in raw.get("vulnerabilities", []) or []:
                eco = (vuln.get("package", {}) or {}).get("ecosystem", "")
                if eco:
                    ecosystem_set.add(eco.lower())
            tags.extend(list(ecosystem_set)[:3])

            source_url = raw.get("html_url", f"https://github.com/advisories/{ghsa_id}")

            items.append({
                "id": uuid.uuid4(),
                "title": f"[Advisory] {title[:120]}",
                "summary": f"GHSA: {ghsa_id} | CVEs: {', '.join(cves) if cves else 'N/A'} | Products: {', '.join(products[:3]) if products else 'N/A'}",
                "description": description[:2000],
                "published_at": published,
                "ingested_at": self.now_utc(),
                "updated_at": updated or self.now_utc(),
                "severity": severity,
                "risk_score": 0,
                "confidence": 85,
                "source_name": "GitHub Advisory DB",
                "source_url": source_url,
                "source_reliability": self.SOURCE_RELIABILITY,
                "source_ref": ghsa_id,
                "feed_type": "advisory",
                "asset_type": "cve" if cves else "other",
                "tlp": "TLP:CLEAR",
                "tags": tags[:15],
                "geo": [],
                "industries": [],
                "cve_ids": cves,
                "affected_products": products[:5],
                "related_ioc_count": 0,
                "is_kev": False,
                "exploit_available": False,
                "exploitability_score": None,
                "source_hash": self.generate_hash("cisa_advisories", ghsa_id),
            })

        logger.info("github_advisories_normalize", count=len(items))
        return items
