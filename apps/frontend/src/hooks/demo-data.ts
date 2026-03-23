/**
 * @module hooks/demo-data
 * @description Realistic demo data for frontend fallback when backend is unreachable.
 * 25 IOC records spanning all types, severities, and lifecycles so every
 * UI improvement (#1–#15) renders meaningful content.
 */
import type { IOCRecord, FeedRecord, ActorRecord, MalwareRecord, VulnRecord } from './use-intel-data'

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

// ─── Enrichment demo data ─────────────────────────────────────

export const DEMO_ENRICHMENT_STATS = {
  total: 25,
  enriched: 18,
  pending: 5,
  failed: 2,
  enrichedToday: 12,
  avgQualityScore: 74,
  cacheHitRate: 0.82,
}

export const DEMO_COST_STATS = {
  headline: '18 IOCs enriched for $0.08',
  totalIOCsEnriched: 18,
  totalCostUsd: 0.08,
  totalTokens: 32400,
  byProvider: {
    virustotal: { count: 18, costUsd: 0, tokens: 0 },
    abuseipdb: { count: 12, costUsd: 0, tokens: 0 },
    haiku_triage: { count: 18, costUsd: 0.08, tokens: 32400 },
  } as Record<string, { count: number; costUsd: number; tokens: number }>,
  byIOCType: {
    ip: { count: 5, costUsd: 0.02 },
    domain: { count: 5, costUsd: 0.02 },
    hash_sha256: { count: 4, costUsd: 0.02 },
    cve: { count: 2, costUsd: 0.01 },
    url: { count: 2, costUsd: 0.01 },
  } as Record<string, { count: number; costUsd: number }>,
  since: daysAgo(7),
}

export const DEMO_BUDGET = {
  tenantId: 'demo-tenant',
  currentSpendUsd: 0.08,
  dailyLimitUsd: 5.00,
  percentUsed: 1.6,
  isOverBudget: false,
}

/** Demo enrichment result for IOC detail panel */
export const DEMO_ENRICHMENT_RESULT = {
  enrichmentStatus: 'enriched' as const,
  enrichedAt: daysAgo(1),
  externalRiskScore: 82,
  enrichmentQuality: 78,
  failureReason: null,
  geolocation: { countryCode: 'RU', isp: 'AS-CHOOPA', usageType: 'hosting', isTor: true },
  haikuResult: {
    riskScore: 85, confidence: 88, severity: 'HIGH',
    threatCategory: 'C2 Infrastructure',
    reasoning: 'This IP is associated with known C2 infrastructure used by APT28 for Cobalt Strike beacon communication.',
    scoreJustification: 'High VT detection rate (72/90), multiple AbuseIPDB reports from distinct users, and known association with APT28 C2 infrastructure.',
    evidenceSources: [
      { provider: 'VirusTotal', dataPoint: '72/90 engines flagged as malicious', interpretation: 'Strong consensus on malicious nature' },
      { provider: 'AbuseIPDB', dataPoint: '147 reports from 89 distinct users', interpretation: 'Widespread abuse reporting confirms malicious activity' },
      { provider: 'MITRE ATT&CK', dataPoint: 'T1071.001 — Web Protocols', interpretation: 'C2 communication over HTTP/HTTPS' },
    ],
    uncertaintyFactors: ['Shared hosting infrastructure may include legitimate services', 'Tor exit node status complicates attribution'],
    mitreTechniques: [
      { techniqueId: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' },
      { techniqueId: 'T1059.001', name: 'PowerShell', tactic: 'Execution' },
      { techniqueId: 'T1105', name: 'Ingress Tool Transfer', tactic: 'Command and Control' },
    ],
    isFalsePositive: false, falsePositiveReason: null,
    malwareFamilies: ['Cobalt Strike', 'Emotet'],
    attributedActors: ['APT28'],
    recommendedActions: [
      { action: 'Block IP at perimeter firewall immediately', priority: 'immediate' as const },
      { action: 'Search SIEM for historical connections to this IP', priority: 'immediate' as const },
      { action: 'Update IDS/IPS signatures for associated C2 patterns', priority: 'short_term' as const },
      { action: 'Review and harden network segmentation policies', priority: 'long_term' as const },
    ],
    stixLabels: ['malicious-activity', 'c2', 'attribution-APT28'],
    tags: ['tor-exit', 'c2', 'apt28'],
    cacheReadTokens: 1200, cacheCreationTokens: 0,
    inputTokens: 1800, outputTokens: 600, costUsd: 0.004, durationMs: 1250,
  },
  vtResult: {
    malicious: 72, suspicious: 3, harmless: 10, undetected: 5,
    totalEngines: 90, detectionRate: 80, tags: ['c2', 'cobalt-strike', 'apt28'],
    lastAnalysisDate: daysAgo(1),
  },
  abuseipdbResult: {
    abuseConfidenceScore: 95, totalReports: 147, numDistinctUsers: 89,
    lastReportedAt: daysAgo(0), isp: 'AS-CHOOPA', countryCode: 'RU',
    usageType: 'Data Center/Web Hosting/Transit', isWhitelisted: false, isTor: true,
  },
}

// ─── Demo Feed Records ────────────────────────────────────────

export const DEMO_FEEDS_RESPONSE: { data: FeedRecord[]; total: number; page: number; limit: number } = {
  data: [
    {
      id: 'demo-feed-1',
      name: 'AlienVault OTX',
      description: 'Open Threat Exchange — community-driven threat intelligence',
      feedType: 'rss',
      url: 'https://otx.alienvault.com/feeds/pulses',
      schedule: '0 */4 * * *',
      status: 'active',
      enabled: true,
      lastFetchAt: daysAgo(2 / 24),
      lastErrorAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      totalItemsIngested: 8420,
      feedReliability: 98,
      createdAt: daysAgo(90),
      updatedAt: daysAgo(2 / 24),
    },
    {
      id: 'demo-feed-2',
      name: 'Abuse.ch URLhaus',
      description: 'URLhaus malicious URL database',
      feedType: 'rest_api',
      url: 'https://urlhaus-api.abuse.ch/v1/urls/recent/',
      schedule: '0 */2 * * *',
      status: 'active',
      enabled: true,
      lastFetchAt: daysAgo(1 / 24),
      lastErrorAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      totalItemsIngested: 12300,
      feedReliability: 99,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(1 / 24),
    },
    {
      id: 'demo-feed-3',
      name: 'Emerging Threats',
      description: 'Proofpoint Emerging Threats open ruleset',
      feedType: 'rss',
      url: 'https://rules.emergingthreats.net/open/suricata/emerging-all.rules',
      schedule: '0 6 * * *',
      status: 'active',
      enabled: true,
      lastFetchAt: daysAgo(3 / 24),
      lastErrorAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      totalItemsIngested: 5100,
      feedReliability: 96,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(3 / 24),
    },
    {
      id: 'demo-feed-4',
      name: 'CISA KEV',
      description: 'CISA Known Exploited Vulnerabilities catalog',
      feedType: 'rest_api',
      url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      schedule: '0 0 * * *',
      status: 'error',
      enabled: true,
      lastFetchAt: daysAgo(1),
      lastErrorAt: daysAgo(3 / 24),
      lastErrorMessage: 'Connection timeout after 30000ms',
      consecutiveFailures: 3,
      totalItemsIngested: 890,
      feedReliability: 82,
      createdAt: daysAgo(45),
      updatedAt: daysAgo(3 / 24),
    },
    {
      id: 'demo-feed-5',
      name: 'MalwareBazaar',
      description: 'Abuse.ch MalwareBazaar malware sample database',
      feedType: 'rest_api',
      url: 'https://mb-api.abuse.ch/api/v1/',
      schedule: '0 */6 * * *',
      status: 'disabled',
      enabled: false,
      lastFetchAt: daysAgo(2),
      lastErrorAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      totalItemsIngested: 3200,
      feedReliability: 94,
      createdAt: daysAgo(75),
      updatedAt: daysAgo(2),
    },
  ],
  total: 5,
  page: 1,
  limit: 50,
}

// ─── Demo Threat Actor Records ────────────────────────────────

export const DEMO_ACTORS_RESPONSE: { data: ActorRecord[]; total: number; page: number; limit: number } = {
  data: [
    {
      id: 'demo-actor-1', name: 'APT28', aliases: ['Fancy Bear', 'Sofacy', 'Pawn Storm'],
      actorType: 'nation_state', motivation: 'espionage', sophistication: 'expert',
      country: 'RU', confidence: 95, tlp: 'red', tags: ['russia', 'gru', 'apt'],
      active: true, firstSeen: daysAgo(3650), lastSeen: daysAgo(3),
      mitreTechniques: ['T1071', 'T1059', 'T1078', 'T1566'],
    },
    {
      id: 'demo-actor-2', name: 'Lazarus Group', aliases: ['Hidden Cobra', 'Guardians of Peace'],
      actorType: 'nation_state', motivation: 'financial', sophistication: 'expert',
      country: 'KP', confidence: 90, tlp: 'red', tags: ['dprk', 'crypto', 'apt'],
      active: true, firstSeen: daysAgo(4380), lastSeen: daysAgo(5),
      mitreTechniques: ['T1055', 'T1071', 'T1105', 'T1082'],
    },
    {
      id: 'demo-actor-3', name: 'FIN7', aliases: ['Carbanak', 'Navigator Group'],
      actorType: 'criminal', motivation: 'financial', sophistication: 'high',
      country: null, confidence: 85, tlp: 'amber', tags: ['ransomware', 'pos', 'financial'],
      active: true, firstSeen: daysAgo(2920), lastSeen: daysAgo(10),
      mitreTechniques: ['T1566', 'T1059', 'T1486'],
    },
    {
      id: 'demo-actor-4', name: 'Sandworm', aliases: ['Voodoo Bear', 'TeleBots'],
      actorType: 'nation_state', motivation: 'sabotage', sophistication: 'expert',
      country: 'RU', confidence: 92, tlp: 'red', tags: ['russia', 'ics', 'destructive'],
      active: true, firstSeen: daysAgo(5475), lastSeen: daysAgo(7),
      mitreTechniques: ['T1486', 'T1561', 'T1071'],
    },
    {
      id: 'demo-actor-5', name: 'Scattered Spider', aliases: ['UNC3944', 'Muddled Libra'],
      actorType: 'criminal', motivation: 'financial', sophistication: 'high',
      country: null, confidence: 80, tlp: 'amber', tags: ['social-engineering', 'sim-swap', 'cloud'],
      active: true, firstSeen: daysAgo(730), lastSeen: daysAgo(14),
      mitreTechniques: ['T1566', 'T1078', 'T1530'],
    },
    {
      id: 'demo-actor-6', name: 'Anonymous Sudan', aliases: ['Storm-1359'],
      actorType: 'hacktivist', motivation: 'political', sophistication: 'intermediate',
      country: 'SD', confidence: 72, tlp: 'amber', tags: ['ddos', 'hacktivist', 'pro-russia'],
      active: false, firstSeen: daysAgo(1095), lastSeen: daysAgo(90),
      mitreTechniques: ['T1498', 'T1499'],
    },
  ],
  total: 6,
  page: 1,
  limit: 50,
}

// ─── Demo Malware Records ─────────────────────────────────────

export const DEMO_MALWARE_RESPONSE: { data: MalwareRecord[]; total: number; page: number; limit: number } = {
  data: [
    {
      id: 'demo-malware-1', name: 'LockBit', aliases: ['LockBit 3.0', 'LockBit Black'],
      malwareType: 'ransomware', platforms: ['Windows', 'Linux', 'macOS'],
      capabilities: ['encryption', 'lateral-movement', 'exfiltration', 'defense-evasion'],
      confidence: 97, tlp: 'red', tags: ['raas', 'extortion', 'high-volume'],
      active: true, firstSeen: daysAgo(1460), lastSeen: daysAgo(2),
    },
    {
      id: 'demo-malware-2', name: 'Cobalt Strike', aliases: ['CS Beacon'],
      malwareType: 'backdoor', platforms: ['Windows', 'Linux'],
      capabilities: ['c2-communication', 'lateral-movement', 'credential-dumping', 'post-exploitation'],
      confidence: 95, tlp: 'amber', tags: ['pen-test-tool', 'cracked', 'apt'],
      active: true, firstSeen: daysAgo(2190), lastSeen: daysAgo(1),
    },
    {
      id: 'demo-malware-3', name: 'Emotet', aliases: ['Heodo', 'Geodo'],
      malwareType: 'trojan', platforms: ['Windows'],
      capabilities: ['email-spam', 'download', 'credential-theft', 'banking-fraud'],
      confidence: 93, tlp: 'amber', tags: ['botnet', 'dropper', 'polymorphic'],
      active: true, firstSeen: daysAgo(3650), lastSeen: daysAgo(5),
    },
    {
      id: 'demo-malware-4', name: 'BlackCat', aliases: ['ALPHV', 'Noberus'],
      malwareType: 'ransomware', platforms: ['Windows', 'Linux'],
      capabilities: ['encryption', 'exfiltration', 'double-extortion', 'intermittent-encryption'],
      confidence: 91, tlp: 'red', tags: ['raas', 'rust', 'east-europe'],
      active: true, firstSeen: daysAgo(900), lastSeen: daysAgo(8),
    },
    {
      id: 'demo-malware-5', name: 'Sliver', aliases: ['BishopFox Sliver'],
      malwareType: 'rat', platforms: ['Windows', 'Linux', 'macOS'],
      capabilities: ['c2-communication', 'shellcode-execution', 'pivoting', 'file-operations'],
      confidence: 82, tlp: 'amber', tags: ['open-source', 'go', 'red-team'],
      active: true, firstSeen: daysAgo(1095), lastSeen: daysAgo(12),
    },
    {
      id: 'demo-malware-6', name: 'QakBot', aliases: ['Qbot', 'Pinkslipbot'],
      malwareType: 'trojan', platforms: ['Windows'],
      capabilities: ['banking-fraud', 'credential-theft', 'network-propagation', 'ransomware-delivery'],
      confidence: 88, tlp: 'amber', tags: ['banking-trojan', 'worm', 'persistent'],
      active: false, firstSeen: daysAgo(4380), lastSeen: daysAgo(180),
    },
  ],
  total: 6,
  page: 1,
  limit: 50,
}

// ─── Demo Vulnerability Records ───────────────────────────────

export const DEMO_VULNS_RESPONSE: { data: VulnRecord[]; total: number; page: number; limit: number } = {
  data: [
    {
      id: 'demo-vuln-1', cveId: 'CVE-2024-21762',
      description: 'Fortinet FortiOS out-of-bounds write allows unauthenticated RCE via crafted HTTP requests.',
      cvssV3Score: 9.8, cvssV3Severity: 'CRITICAL', epssScore: 0.9741, epssPercentile: 0.9997,
      cisaKev: true, exploitedInWild: true, exploitAvailable: true, priorityScore: 98,
      affectedProducts: ['FortiOS 6.0', 'FortiOS 7.0', 'FortiProxy'], affectedVendors: ['Fortinet'],
      weaknessType: 'CWE-787', confidence: 97, tlp: 'red', tags: ['rce', 'fortinet', 'vpn', 'cisa-kev'],
      active: true, publishedDate: daysAgo(60), firstSeen: daysAgo(58), lastSeen: daysAgo(0),
    },
    {
      id: 'demo-vuln-2', cveId: 'CVE-2024-3400',
      description: 'Palo Alto PAN-OS command injection in GlobalProtect allows unauthenticated RCE.',
      cvssV3Score: 10.0, cvssV3Severity: 'CRITICAL', epssScore: 0.9650, epssPercentile: 0.9995,
      cisaKev: true, exploitedInWild: true, exploitAvailable: true, priorityScore: 100,
      affectedProducts: ['PAN-OS 10.2', 'PAN-OS 11.0', 'PAN-OS 11.1'], affectedVendors: ['Palo Alto Networks'],
      weaknessType: 'CWE-77', confidence: 98, tlp: 'red', tags: ['rce', 'palo-alto', 'firewall', 'cisa-kev'],
      active: true, publishedDate: daysAgo(75), firstSeen: daysAgo(73), lastSeen: daysAgo(1),
    },
    {
      id: 'demo-vuln-3', cveId: 'CVE-2024-1709',
      description: 'ConnectWise ScreenConnect authentication bypass allows unauthenticated admin access.',
      cvssV3Score: 10.0, cvssV3Severity: 'CRITICAL', epssScore: 0.9720, epssPercentile: 0.9996,
      cisaKev: true, exploitedInWild: true, exploitAvailable: true, priorityScore: 99,
      affectedProducts: ['ScreenConnect 23.9.7', 'ScreenConnect 23.9.8'], affectedVendors: ['ConnectWise'],
      weaknessType: 'CWE-288', confidence: 96, tlp: 'red', tags: ['auth-bypass', 'connectwise', 'rmm', 'cisa-kev'],
      active: true, publishedDate: daysAgo(90), firstSeen: daysAgo(88), lastSeen: daysAgo(2),
    },
    {
      id: 'demo-vuln-4', cveId: 'CVE-2023-46805',
      description: 'Ivanti Connect Secure authentication bypass allows remote access to restricted resources.',
      cvssV3Score: 8.2, cvssV3Severity: 'HIGH', epssScore: 0.9530, epssPercentile: 0.9991,
      cisaKev: true, exploitedInWild: true, exploitAvailable: true, priorityScore: 90,
      affectedProducts: ['Ivanti Connect Secure 9.x', 'Ivanti Policy Secure 9.x'], affectedVendors: ['Ivanti'],
      weaknessType: 'CWE-287', confidence: 94, tlp: 'amber', tags: ['auth-bypass', 'ivanti', 'vpn', 'cisa-kev'],
      active: true, publishedDate: daysAgo(120), firstSeen: daysAgo(118), lastSeen: daysAgo(4),
    },
    {
      id: 'demo-vuln-5', cveId: 'CVE-2024-27198',
      description: 'JetBrains TeamCity authentication bypass in the web UI allows unauthenticated admin access.',
      cvssV3Score: 9.8, cvssV3Severity: 'CRITICAL', epssScore: 0.8920, epssPercentile: 0.9980,
      cisaKev: false, exploitedInWild: true, exploitAvailable: true, priorityScore: 94,
      affectedProducts: ['TeamCity 2023.11.3'], affectedVendors: ['JetBrains'],
      weaknessType: 'CWE-288', confidence: 90, tlp: 'amber', tags: ['auth-bypass', 'jetbrains', 'ci-cd', 'supply-chain'],
      active: true, publishedDate: daysAgo(55), firstSeen: daysAgo(53), lastSeen: daysAgo(3),
    },
    {
      id: 'demo-vuln-6', cveId: 'CVE-2023-44487',
      description: 'HTTP/2 Rapid Reset Attack enables distributed denial of service at record scale.',
      cvssV3Score: 7.5, cvssV3Severity: 'HIGH', epssScore: 0.7840, epssPercentile: 0.9940,
      cisaKev: true, exploitedInWild: true, exploitAvailable: true, priorityScore: 82,
      affectedProducts: ['nginx', 'Apache httpd', 'Kubernetes ingress', 'AWS ALB'], affectedVendors: ['Multiple'],
      weaknessType: 'CWE-400', confidence: 88, tlp: 'amber', tags: ['dos', 'http2', 'infrastructure', 'cisa-kev'],
      active: true, publishedDate: daysAgo(180), firstSeen: daysAgo(178), lastSeen: daysAgo(7),
    },
  ],
  total: 6,
  page: 1,
  limit: 50,
}

/** Demo per-IOC cost breakdown */
export const DEMO_IOC_COST = {
  iocId: 'demo-1',
  providers: [
    { provider: 'virustotal', model: null, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 450, timestamp: daysAgo(1) },
    { provider: 'abuseipdb', model: null, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 320, timestamp: daysAgo(1) },
    { provider: 'haiku_triage', model: 'haiku', inputTokens: 1800, outputTokens: 600, costUsd: 0.004, durationMs: 1250, timestamp: daysAgo(1) },
  ],
  totalTokens: 2400,
  totalCostUsd: 0.004,
  providerCount: 3,
}
