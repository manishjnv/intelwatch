/**
 * @module hooks/demo-data
 * @description Realistic demo data for frontend fallback when backend is unreachable.
 * 25 IOC records spanning all types, severities, and lifecycles so every
 * UI improvement (#1–#15) renders meaningful content.
 */
import type { IOCRecord } from './use-intel-data'

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function ioc(
  n: number, iocType: string, value: string, severity: string,
  confidence: number, lifecycle: string, tlp: string,
  tags: string[], actors: string[], malware: string[],
  firstDays: number, lastDays: number,
): IOCRecord {
  return {
    id: `demo-${n}`, iocType, normalizedValue: value, severity, confidence,
    lifecycle, tlp, tags, threatActors: actors, malwareFamilies: malware,
    firstSeen: daysAgo(firstDays), lastSeen: daysAgo(lastDays),
  }
}

// ─── 25 Demo IOC Records ───────────────────────────────────────

export const DEMO_IOC_RECORDS: IOCRecord[] = [
  // IPs (5)
  ioc(1,  'ip', '185.220.101.34',  'critical', 92, 'active', 'red',
    ['tor-exit', 'c2'], ['APT28'], ['Cobalt Strike'], 28, 0),
  ioc(2,  'ip', '91.219.236.174',  'high', 78, 'active', 'amber',
    ['c2', 'backdoor'], ['Lazarus Group'], ['Emotet'], 21, 1),
  ioc(3,  'ip', '203.0.113.42',    'medium', 61, 'active', 'amber',
    ['scanner', 'recon'], [], [], 14, 2),
  ioc(4,  'ip', '45.33.32.156',    'low', 45, 'aging', 'green',
    ['shodan', 'recon'], [], [], 30, 7),
  ioc(5,  'ip', '198.51.100.23',   'info', 30, 'aging', 'white',
    ['probe', 'benign'], [], [], 25, 10),

  // Domains (5)
  ioc(6,  'domain', 'evil-payload.darknet.ru',     'critical', 95, 'new', 'red',
    ['malware-delivery', 'apt'], ['Sandworm'], ['BlackCat'], 5, 0),
  ioc(7,  'domain', 'c2-beacon.malware.top',       'high', 82, 'active', 'red',
    ['c2', 'botnet'], ['APT41'], ['QakBot'], 18, 1),
  ioc(8,  'domain', 'phishing-login.example.net',  'medium', 65, 'active', 'amber',
    ['phishing', 'credential-theft'], [], [], 12, 2),
  ioc(9,  'domain', 'tracker.adnetwork.info',      'low', 40, 'aging', 'green',
    ['tracking', 'adware'], [], [], 22, 8),
  ioc(10, 'domain', 'test-scanner.research.org',   'info', 25, 'aging', 'white',
    ['research', 'benign'], [], [], 30, 12),

  // URLs (3)
  ioc(11, 'url', 'https://evil-payload.darknet.ru/stage2.bin', 'critical', 98, 'new', 'red',
    ['payload', 'dropper'], ['Sandworm'], ['BlackCat'], 3, 0),
  ioc(12, 'url', 'https://phishing-login.example.net/auth',    'high', 75, 'active', 'amber',
    ['phishing', 'credential-theft'], ['FIN7'], [], 10, 1),
  ioc(13, 'url', 'http://tracker.adnetwork.info/pixel.gif',    'low', 35, 'aging', 'green',
    ['tracking'], [], [], 20, 6),

  // SHA-256 Hashes (5)
  ioc(14, 'hash_sha256',
    'a3b8f2d1e4c7965fab12de345678900cfda1b2c3d4e5f67890abcdef12345679',
    'critical', 90, 'new', 'red',
    ['ransomware', 'encryption'], ['Lazarus Group'], ['LockBit'], 4, 0),
  ioc(15, 'hash_sha256',
    'f7e8d9c0b1a234567890fedcba0987654321fedcba9876543210abcdef012345',
    'high', 80, 'active', 'amber',
    ['trojan', 'persistence'], ['APT28'], ['Cobalt Strike'], 15, 2),
  ioc(16, 'hash_sha256',
    '1234abcdef567890abcdef1234567890abcdef1234567890abcdef1234567890',
    'high', 72, 'active', 'amber',
    ['loader', 'downloader'], ['APT41'], ['Emotet'], 17, 3),
  ioc(17, 'hash_sha256',
    'deadbeef01234567890abcdef1234567890abcdef01234567890abcdef012345',
    'medium', 55, 'new', 'amber',
    ['suspicious', 'packed'], [], [], 6, 1),
  ioc(18, 'hash_sha256',
    'cafebabe98765432fedcba0987654321abcdef567890abcdef1234567890abcd',
    'medium', 50, 'active', 'green',
    ['pup', 'adware'], [], [], 20, 5),

  // CVEs (4)
  ioc(19, 'cve', 'CVE-2024-21762', 'critical', 96, 'new', 'red',
    ['rce', 'exploit', 'fortinet'], [], [], 7, 0),
  ioc(20, 'cve', 'CVE-2024-3400',  'high', 85, 'new', 'amber',
    ['rce', 'palo-alto', 'firewall'], [], [], 8, 1),
  ioc(21, 'cve', 'CVE-2024-1709',  'high', 78, 'active', 'amber',
    ['auth-bypass', 'connectwise'], [], [], 14, 3),
  ioc(22, 'cve', 'CVE-2023-46805', 'medium', 62, 'active', 'amber',
    ['auth-bypass', 'ivanti', 'vpn'], [], [], 25, 4),

  // Emails (3)
  ioc(23, 'email', 'admin@evil-payload.darknet.ru', 'medium', 70, 'new', 'amber',
    ['phishing', 'spear-phishing'], ['FIN7'], [], 6, 0),
  ioc(24, 'email', 'cryptodrainer@fakebank.com',    'medium', 60, 'active', 'amber',
    ['fraud', 'bec', 'financial'], [], [], 12, 2),
  ioc(25, 'email', 'researcher@security.org',       'info', 20, 'aging', 'white',
    ['benign', 'research'], [], [], 30, 15),
]

// ─── Aggregated stats (derived from records) ──────────────────

function computeStats(records: IOCRecord[]) {
  const byType: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  const byLifecycle: Record<string, number> = {}
  for (const r of records) {
    byType[r.iocType] = (byType[r.iocType] ?? 0) + 1
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
    byLifecycle[r.lifecycle] = (byLifecycle[r.lifecycle] ?? 0) + 1
  }
  return { total: records.length, byType, bySeverity, byLifecycle }
}

export const DEMO_IOC_STATS = computeStats(DEMO_IOC_RECORDS)

export const DEMO_IOCS_RESPONSE = {
  data: DEMO_IOC_RECORDS,
  total: DEMO_IOC_RECORDS.length,
  page: 1,
  limit: 50,
}

export const DEMO_DASHBOARD_STATS = {
  totalIOCs: DEMO_IOC_RECORDS.length,
  criticalIOCs: DEMO_IOC_STATS.bySeverity['critical'] ?? 0,
  activeFeeds: 4,
  enrichedToday: 12,
  lastIngestTime: 'Demo',
}
