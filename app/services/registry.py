"""Feed connector registry — maps feed names to connector classes."""

from __future__ import annotations

from app.services.feeds.nvd import NVDConnector
from app.services.feeds.kev import KEVConnector
from app.services.feeds.urlhaus import URLhausConnector
from app.services.feeds.otx import OTXConnector
from app.services.feeds.threatfox import ThreatFoxConnector
from app.services.feeds.malwarebazaar import MalwareBazaarConnector
from app.services.feeds.virustotal import VirusTotalConnector
from app.services.feeds.shodan import ShodanConnector
from app.services.feeds.abuseipdb import AbuseIPDBConnector
from app.services.feeds.cisa_advisories import CISAAdvisoriesConnector
from app.services.feeds.exploitdb import ExploitDBConnector
from app.services.feeds.mitre_attack import MITREAttackConnector

# Registry: feed_name → connector class
CONNECTOR_REGISTRY: dict[str, type] = {
    "nvd":              NVDConnector,
    "kev":              KEVConnector,
    "urlhaus":          URLhausConnector,
    "otx":              OTXConnector,
    "threatfox":        ThreatFoxConnector,
    "malwarebazaar":    MalwareBazaarConnector,
    "virustotal":       VirusTotalConnector,
    "shodan":           ShodanConnector,
    "abuseipdb":        AbuseIPDBConnector,
    "cisa_advisories":  CISAAdvisoriesConnector,
    "exploitdb":        ExploitDBConnector,
    "mitre_attack":     MITREAttackConnector,
}
