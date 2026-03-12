"""MITRE ATT&CK feed connector — threat actors & campaigns from STIX data.

Free, no API key. Uses the public MITRE CTI GitHub repository.
Updates ~quarterly, but we check daily for incremental additions.
Docs: https://github.com/mitre/cti
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import logging`r`nfrom app.services.feeds.base import BaseFeedConnector

logger = logging.getLogger(__name__)

ATTACK_URL = (
    "https://raw.githubusercontent.com/mitre/cti/master/"
    "enterprise-attack/enterprise-attack.json"
)


class MITREAttackConnector(BaseFeedConnector):
    FEED_NAME = "mitre_attack"
    SOURCE_RELIABILITY = 95

    async def fetch(self, last_cursor: str | None = None) -> list[dict]:
        """Fetch the full MITRE ATT&CK STIX bundle and extract groups + campaigns."""
        response = await self.client.get(ATTACK_URL, timeout=120)
        response.raise_for_status()
        bundle = response.json()
        objects = bundle.get("objects", [])

        # Extract intrusion-sets (threat actors) and campaigns
        items: list[dict] = []
        for obj in objects:
            obj_type = obj.get("type")
            if obj_type not in ("intrusion-set", "campaign"):
                continue
            # Skip revoked / deprecated
            if obj.get("revoked") or obj.get("x_mitre_deprecated"):
                continue
            items.append(obj)

        logger.info("mitre_attack_fetch", total=len(items))

        # Incremental: filter by modified date > last_cursor
        if last_cursor:
            try:
                cursor_dt = datetime.fromisoformat(last_cursor.replace("Z", "+00:00"))
                items = [
                    i for i in items
                    if self._parse_stix_date(i.get("modified", i.get("created", "")))
                    and self._parse_stix_date(i.get("modified", i.get("created", ""))) > cursor_dt
                ]
            except (ValueError, TypeError):
                pass

        # Track cursor
        if items:
            dates = [
                self._parse_stix_date(i.get("modified", i.get("created", "")))
                for i in items
            ]
            valid = [d for d in dates if d]
            if valid:
                self._next_cursor = max(valid).isoformat()

        return items

    def _parse_stix_date(self, date_str: str | None) -> datetime | None:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    def normalize(self, raw_items: list[dict]) -> list[dict]:
        items = []
        for raw in raw_items:
            obj_type = raw.get("type")
            name = raw.get("name", "Unknown")
            description = raw.get("description", "")
            stix_id = raw.get("id", "")
            aliases = raw.get("aliases", [])

            created = self._parse_stix_date(raw.get("created"))
            modified = self._parse_stix_date(raw.get("modified"))

            # Build tags
            tags = ["mitre_attack"]
            if obj_type == "intrusion-set":
                feed_type = "threat_actor"
                tags.append("threat_actor")
                title = f"[MITRE] Threat Actor: {name}"
                for alias in aliases[:5]:
                    if alias.lower() != name.lower():
                        tags.append(alias.lower().replace(" ", "_"))
            else:
                feed_type = "campaign"
                tags.append("campaign")
                title = f"[MITRE] Campaign: {name}"
                first_seen = raw.get("first_seen")
                last_seen = raw.get("last_seen")
                if first_seen:
                    tags.append(f"active_{first_seen[:4]}")

            # Determine severity from description keywords
            severity = self._severity_from_description(description, obj_type)

            # Extract geographic targeting from description
            geo = self._extract_geo(description)

            # Extract targeted industries
            industries = self._extract_industries(description)

            summary_parts = []
            if aliases:
                summary_parts.append(f"Aliases: {', '.join(aliases[:5])}")
            if obj_type == "campaign":
                fs = raw.get("first_seen", "")
                ls = raw.get("last_seen", "")
                if fs:
                    summary_parts.append(f"Active: {fs[:10]} to {ls[:10] if ls else 'present'}")
            summary = " | ".join(summary_parts) if summary_parts else f"{feed_type.replace('_', ' ').title()} from MITRE ATT&CK"

            items.append({
                "id": uuid.uuid4(),
                "title": title,
                "summary": summary[:500],
                "description": description[:2000] if description else None,
                "published_at": created,
                "ingested_at": self.now_utc(),
                "updated_at": self.now_utc(),
                "severity": severity,
                "risk_score": 0,
                "confidence": 90,
                "source_name": "MITRE ATT&CK",
                "source_url": f"https://attack.mitre.org/{'groups' if obj_type == 'intrusion-set' else 'campaigns'}/{self._extract_attack_id(raw)}/",
                "source_reliability": self.SOURCE_RELIABILITY,
                "source_ref": stix_id,
                "feed_type": feed_type,
                "asset_type": "other",
                "tlp": "TLP:CLEAR",
                "tags": tags[:15],
                "geo": geo[:10],
                "industries": industries[:10],
                "cve_ids": self._extract_cves(description),
                "affected_products": [],
                "related_ioc_count": 0,
                "is_kev": False,
                "exploit_available": False,
                "exploitability_score": None,
                "source_hash": self.generate_hash("mitre_attack", stix_id),
            })

        logger.info("mitre_attack_normalize", count=len(items))
        return items

    def _extract_attack_id(self, obj: dict) -> str:
        """Extract ATT&CK ID like G0007 or C0001 from external_references."""
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack":
                return ref.get("external_id", "")
        return ""

    def _extract_cves(self, description: str) -> list[str]:
        """Extract CVE IDs from description text."""
        import re
        if not description:
            return []
        return list(set(re.findall(r"CVE-\d{4}-\d{4,7}", description)))[:10]

    def _severity_from_description(self, description: str, obj_type: str) -> str:
        """Heuristic severity based on description keywords."""
        if not description:
            return "high" if obj_type == "intrusion-set" else "medium"
        desc_lower = description.lower()
        critical_kw = {"nation-state", "nation state", "espionage", "destructive", "wiper", "ransomware", "critical infrastructure"}
        high_kw = {"apt", "advanced persistent", "financial", "banking", "government", "defense", "military"}
        if any(kw in desc_lower for kw in critical_kw):
            return "critical"
        if any(kw in desc_lower for kw in high_kw):
            return "high"
        return "high" if obj_type == "intrusion-set" else "medium"

    def _extract_geo(self, description: str) -> list[str]:
        """Extract country/region references from description."""
        if not description:
            return []
        geo_map = {
            "russia": "Russia", "china": "China", "iran": "Iran",
            "north korea": "North Korea", "dprk": "North Korea",
            "united states": "United States", "ukraine": "Ukraine",
            "israel": "Israel", "south korea": "South Korea",
            "japan": "Japan", "india": "India", "pakistan": "Pakistan",
            "turkey": "Turkey", "vietnam": "Vietnam", "europe": "Europe",
            "middle east": "Middle East", "southeast asia": "Southeast Asia",
        }
        desc_lower = description.lower()
        found = []
        for keyword, label in geo_map.items():
            if keyword in desc_lower and label not in found:
                found.append(label)
        return found

    def _extract_industries(self, description: str) -> list[str]:
        """Extract targeted industry sectors from description."""
        if not description:
            return []
        industry_map = {
            "financial": "Financial", "banking": "Financial",
            "government": "Government", "defense": "Defense",
            "military": "Defense", "energy": "Energy",
            "healthcare": "Healthcare", "education": "Education",
            "telecommunications": "Telecommunications", "telecom": "Telecommunications",
            "technology": "Technology", "aerospace": "Aerospace",
            "manufacturing": "Manufacturing", "retail": "Retail",
            "media": "Media", "critical infrastructure": "Critical Infrastructure",
            "transportation": "Transportation", "oil and gas": "Energy",
        }
        desc_lower = description.lower()
        found = []
        for keyword, label in industry_map.items():
            if keyword in desc_lower and label not in found:
                found.append(label)
        return found
