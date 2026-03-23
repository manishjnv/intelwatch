/**
 * @module hooks/phase4-demo-data
 * @description Realistic demo data for Phase 4 frontend pages:
 * DRP, Threat Graph, Correlation Engine, Threat Hunting.
 * Used as fallback when backend services are unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

// ─── DRP Types & Demo Data ──────────────────────────────────────

export interface DRPAsset {
  id: string; name: string; type: 'domain' | 'brand' | 'executive' | 'ip_range'
  value: string; status: 'active' | 'paused'; lastScanAt: string | null
  alertCount: number; riskScore: number; createdAt: string
}

export interface DRPAlert {
  id: string; assetId: string; type: 'typosquatting' | 'dark_web' | 'credential_leak' | 'attack_surface'
  title: string; description: string; severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  detectedValue: string; confidence: number; assignee: string | null
  createdAt: string; resolvedAt: string | null
  triagedAt: string | null
}

export interface DRPAlertStats {
  total: number; open: number; investigating: number; resolved: number
  bySeverity: Record<string, number>; byType: Record<string, number>
}

export interface DRPAssetStats {
  total: number; byType: Record<string, number>; avgRiskScore: number
}

export interface TyposquatCandidate {
  domain: string; method: string; similarity: number
  editDistance: number; riskScore: number; isRegistered: boolean
  registrationDate: string | null; hostingProvider: string | null
  compositeScore?: number; jaroWinkler?: number; soundexMatch?: boolean
  tldRisk?: number
}

export interface CertStreamStatus {
  enabled: boolean; connected: boolean; matchesLastHour: number
  totalProcessed: number; uptime: string
}

export const DEMO_DRP_ASSETS: DRPAsset[] = [
  { id: 'asset-1', name: 'Primary Domain', type: 'domain', value: 'intelwatch.in', status: 'active', lastScanAt: hoursAgo(2), alertCount: 7, riskScore: 72, createdAt: daysAgo(30) },
  { id: 'asset-2', name: 'Brand Name', type: 'brand', value: 'IntelWatch', status: 'active', lastScanAt: hoursAgo(6), alertCount: 3, riskScore: 45, createdAt: daysAgo(30) },
  { id: 'asset-3', name: 'CEO Identity', type: 'executive', value: 'Manish Kumar', status: 'active', lastScanAt: daysAgo(1), alertCount: 1, riskScore: 28, createdAt: daysAgo(20) },
  { id: 'asset-4', name: 'API Subdomain', type: 'domain', value: 'api.intelwatch.in', status: 'active', lastScanAt: hoursAgo(4), alertCount: 2, riskScore: 55, createdAt: daysAgo(15) },
  { id: 'asset-5', name: 'VPS Range', type: 'ip_range', value: '72.61.227.0/24', status: 'paused', lastScanAt: daysAgo(3), alertCount: 0, riskScore: 15, createdAt: daysAgo(10) },
]

export const DEMO_DRP_ALERTS: DRPAlert[] = [
  { id: 'drp-alert-1', assetId: 'asset-1', type: 'typosquatting', title: 'Typosquat: intelwatch.in → intelvvatch.in', description: 'Homoglyph substitution detected. Domain registered 3 days ago on Namecheap.', severity: 'critical', status: 'open', detectedValue: 'intelvvatch.in', confidence: 94, assignee: null, createdAt: hoursAgo(3), resolvedAt: null, triagedAt: null },
  { id: 'drp-alert-2', assetId: 'asset-1', type: 'typosquatting', title: 'Typosquat: intelwatch.in → intelwatcch.in', description: 'Repetition squatting detected. Domain registered 1 week ago.', severity: 'high', status: 'open', detectedValue: 'intelwatcch.in', confidence: 82, assignee: null, createdAt: hoursAgo(8), resolvedAt: null, triagedAt: null },
  { id: 'drp-alert-3', assetId: 'asset-1', type: 'credential_leak', title: 'Credential leak: 12 accounts on paste site', description: '12 email/password pairs matching @intelwatch.in found on Pastebin.', severity: 'critical', status: 'investigating', detectedValue: 'pastebin.com/abc123', confidence: 88, assignee: 'Manish', createdAt: daysAgo(1), resolvedAt: null, triagedAt: hoursAgo(20) },
  { id: 'drp-alert-4', assetId: 'asset-2', type: 'dark_web', title: 'Brand mention: IntelWatch on dark web forum', description: 'IntelWatch mentioned in dark web marketplace discussing credential sales.', severity: 'high', status: 'investigating', detectedValue: 'forum.onion/thread/8291', confidence: 75, assignee: 'Manish', createdAt: daysAgo(2), resolvedAt: null, triagedAt: daysAgo(1) },
  { id: 'drp-alert-5', assetId: 'asset-4', type: 'attack_surface', title: 'Exposed admin panel: api.intelwatch.in/admin', description: 'Admin panel accessible without authentication on port 8080.', severity: 'high', status: 'open', detectedValue: 'api.intelwatch.in:8080/admin', confidence: 92, assignee: null, createdAt: daysAgo(1), resolvedAt: null, triagedAt: null },
  { id: 'drp-alert-6', assetId: 'asset-1', type: 'typosquatting', title: 'Typosquat: intelwatch.in → intelwatch.com', description: 'TLD swap detected. Domain registered years ago — likely parked.', severity: 'medium', status: 'resolved', detectedValue: 'intelwatch.com', confidence: 60, assignee: 'Manish', createdAt: daysAgo(5), resolvedAt: daysAgo(3), triagedAt: daysAgo(4) },
  { id: 'drp-alert-7', assetId: 'asset-3', type: 'dark_web', title: 'Executive mention: CEO name on breach forum', description: 'Name "Manish Kumar" found in leaked corporate directory dump.', severity: 'medium', status: 'dismissed', detectedValue: 'breach-db.onion/dump/4521', confidence: 45, assignee: null, createdAt: daysAgo(7), resolvedAt: daysAgo(5), triagedAt: daysAgo(6) },
  { id: 'drp-alert-8', assetId: 'asset-1', type: 'typosquatting', title: 'Typosquat: intelwatch.in → intel-watch.in', description: 'Hyphenation squatting. Domain not yet registered.', severity: 'low', status: 'open', detectedValue: 'intel-watch.in', confidence: 55, assignee: null, createdAt: daysAgo(3), resolvedAt: null, triagedAt: null },
]

export const DEMO_DRP_ALERT_STATS: DRPAlertStats = {
  total: 8, open: 4, investigating: 2, resolved: 1,
  bySeverity: { critical: 2, high: 3, medium: 2, low: 1 },
  byType: { typosquatting: 4, dark_web: 2, credential_leak: 1, attack_surface: 1 },
}

export const DEMO_DRP_ASSET_STATS: DRPAssetStats = {
  total: 5, byType: { domain: 2, brand: 1, executive: 1, ip_range: 1 }, avgRiskScore: 43,
}

export const DEMO_TYPOSQUAT_RESULTS: TyposquatCandidate[] = [
  { domain: 'intelvvatch.in', method: 'homoglyph', similarity: 0.94, editDistance: 1, riskScore: 0.92, isRegistered: true, registrationDate: daysAgo(3), hostingProvider: 'Namecheap', compositeScore: 0.91, jaroWinkler: 0.96, soundexMatch: true, tldRisk: 0.7 },
  { domain: 'intelwatcch.in', method: 'repetition', similarity: 0.91, editDistance: 1, riskScore: 0.78, isRegistered: true, registrationDate: daysAgo(7), hostingProvider: 'GoDaddy', compositeScore: 0.82, jaroWinkler: 0.93, soundexMatch: true, tldRisk: 0.7 },
  { domain: 'intelwatch.co', method: 'tld_swap', similarity: 0.85, editDistance: 1, riskScore: 0.65, isRegistered: true, registrationDate: daysAgo(180), hostingProvider: 'Cloudflare', compositeScore: 0.7, jaroWinkler: 0.88, soundexMatch: true, tldRisk: 0.5 },
  { domain: 'intel-watch.in', method: 'hyphenation', similarity: 0.88, editDistance: 1, riskScore: 0.52, isRegistered: false, registrationDate: null, hostingProvider: null, compositeScore: 0.55, jaroWinkler: 0.9, soundexMatch: true, tldRisk: 0.7 },
  { domain: 'intelwetch.in', method: 'vowel_swap', similarity: 0.82, editDistance: 1, riskScore: 0.48, isRegistered: false, registrationDate: null, hostingProvider: null, compositeScore: 0.5, jaroWinkler: 0.85, soundexMatch: false, tldRisk: 0.7 },
]

export const DEMO_CERTSTREAM_STATUS: CertStreamStatus = {
  enabled: true, connected: true, matchesLastHour: 3,
  totalProcessed: 128450, uptime: '14h 23m',
}

// ─── Threat Graph Types & Demo Data ─────────────────────────────

export interface GraphNode {
  id: string; entityType: 'ioc' | 'threat_actor' | 'malware' | 'vulnerability' | 'campaign'
  label: string; riskScore: number; properties: Record<string, unknown>
  createdAt: string
}

export interface GraphEdge {
  id: string; sourceId: string; targetId: string
  relationshipType: string; confidence: number; properties: Record<string, unknown>
}

export interface GraphSubgraph {
  nodes: GraphNode[]; edges: GraphEdge[]
}

export interface GraphStats {
  totalNodes: number; totalEdges: number
  byType: Record<string, number>; avgRiskScore: number
}

const gn = (id: string, type: GraphNode['entityType'], label: string, risk: number, props: Record<string, unknown> = {}): GraphNode => ({
  id, entityType: type, label, riskScore: risk, properties: props, createdAt: daysAgo(Math.floor(Math.random() * 30)),
})

const ge = (id: string, src: string, tgt: string, rel: string, conf: number): GraphEdge => ({
  id, sourceId: src, targetId: tgt, relationshipType: rel, confidence: conf, properties: {},
})

export const DEMO_GRAPH_NODES: GraphNode[] = [
  gn('n1', 'threat_actor', 'APT28', 92, { aliases: ['Fancy Bear', 'Sofacy'], country: 'RU' }),
  gn('n2', 'threat_actor', 'Lazarus Group', 88, { aliases: ['Hidden Cobra'], country: 'KP' }),
  gn('n3', 'malware', 'Cobalt Strike', 85, { malwareType: 'RAT', platforms: ['Windows'] }),
  gn('n4', 'malware', 'Emotet', 80, { malwareType: 'loader', platforms: ['Windows'] }),
  gn('n5', 'ioc', '185.220.101.34', 92, { iocType: 'ip', severity: 'critical' }),
  gn('n6', 'ioc', 'evil-payload.darknet.ru', 95, { iocType: 'domain', severity: 'critical' }),
  gn('n7', 'ioc', '91.219.236.174', 78, { iocType: 'ip', severity: 'high' }),
  gn('n8', 'vulnerability', 'CVE-2024-21762', 96, { cvss: 9.8, exploitAvailable: true }),
  gn('n9', 'vulnerability', 'CVE-2024-3400', 85, { cvss: 9.1, exploitAvailable: true }),
  gn('n10', 'campaign', 'Operation Fancy Storm', 90, { startDate: daysAgo(30), targetSectors: ['government', 'defense'] }),
  gn('n11', 'campaign', 'Dark Seoul 2.0', 82, { startDate: daysAgo(45), targetSectors: ['financial', 'cryptocurrency'] }),
  gn('n12', 'ioc', 'c2-beacon.malware.top', 82, { iocType: 'domain', severity: 'high' }),
  gn('n13', 'malware', 'LockBit', 90, { malwareType: 'ransomware', platforms: ['Windows', 'Linux'] }),
  gn('n14', 'ioc', 'CVE-2024-1709', 78, { iocType: 'cve', severity: 'high' }),
  gn('n15', 'threat_actor', 'FIN7', 75, { aliases: ['Carbanak'], country: 'UA' }),
]

export const DEMO_GRAPH_EDGES: GraphEdge[] = [
  ge('e1', 'n1', 'n3', 'uses', 92),
  ge('e2', 'n1', 'n5', 'controls', 88),
  ge('e3', 'n1', 'n10', 'attributed_to', 85),
  ge('e4', 'n2', 'n4', 'uses', 80),
  ge('e5', 'n2', 'n7', 'controls', 75),
  ge('e6', 'n2', 'n11', 'attributed_to', 82),
  ge('e7', 'n3', 'n5', 'communicates_with', 90),
  ge('e8', 'n3', 'n12', 'communicates_with', 85),
  ge('e9', 'n4', 'n7', 'communicates_with', 78),
  ge('e10', 'n6', 'n3', 'delivers', 92),
  ge('e11', 'n8', 'n1', 'exploited_by', 80),
  ge('e12', 'n9', 'n2', 'exploited_by', 70),
  ge('e13', 'n10', 'n6', 'targets', 88),
  ge('e14', 'n10', 'n8', 'leverages', 82),
  ge('e15', 'n11', 'n13', 'deploys', 78),
  ge('e16', 'n13', 'n14', 'exploits', 72),
  ge('e17', 'n15', 'n4', 'uses', 68),
  ge('e18', 'n15', 'n12', 'controls', 70),
]

export const DEMO_GRAPH_STATS: GraphStats = {
  totalNodes: 15, totalEdges: 18,
  byType: { ioc: 5, threat_actor: 3, malware: 3, vulnerability: 2, campaign: 2 },
  avgRiskScore: 85,
}

// ─── Correlation Engine Types & Demo Data ───────────────────────

export interface CorrelationResult {
  id: string; correlationType: 'cooccurrence' | 'infrastructure' | 'temporal' | 'ttp_similarity' | 'campaign'
  title: string; description: string; severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number; entityIds: string[]; entityLabels: string[]
  suppressed: boolean; createdAt: string
  diamondModel?: { adversary: string; infrastructure: string; capability: string; victim: string }
  killChainPhase?: string
}

export interface CorrelationStats {
  total: number; byType: Record<string, number>; bySeverity: Record<string, number>
  suppressedCount: number; avgConfidence: number
}

export interface CampaignCluster {
  id: string; name: string; description: string
  actorId: string | null; actorName: string | null
  techniques: string[]; confidence: number; iocCount: number
  createdAt: string
}

export const DEMO_CORRELATIONS: CorrelationResult[] = [
  {
    id: 'corr-1', correlationType: 'infrastructure', title: 'Shared C2 Infrastructure: APT28 + Cobalt Strike',
    description: '3 IOCs share hosting on AS-CHOOPA (185.220.x.x range). Common registration pattern within 48h window.',
    severity: 'critical', confidence: 91, entityIds: ['n1', 'n3', 'n5'], entityLabels: ['APT28', 'Cobalt Strike', '185.220.101.34'],
    suppressed: false, createdAt: hoursAgo(2),
    diamondModel: { adversary: 'APT28 (Fancy Bear)', infrastructure: 'AS-CHOOPA 185.220.x.x', capability: 'Cobalt Strike beacon', victim: 'Government/Defense sector' },
    killChainPhase: 'command_and_control',
  },
  {
    id: 'corr-2', correlationType: 'temporal', title: 'Temporal Wave: Emotet → Lazarus activity burst',
    description: 'Emotet loader activity preceded Lazarus C2 connections by 4-6 hours across 5 incidents.',
    severity: 'high', confidence: 82, entityIds: ['n2', 'n4', 'n7'], entityLabels: ['Lazarus Group', 'Emotet', '91.219.236.174'],
    suppressed: false, createdAt: hoursAgo(8),
    diamondModel: { adversary: 'Lazarus Group', infrastructure: '91.219.236.174', capability: 'Emotet loader chain', victim: 'Financial sector' },
    killChainPhase: 'delivery',
  },
  {
    id: 'corr-3', correlationType: 'campaign', title: 'Campaign: Operation Fancy Storm attribution',
    description: 'Cluster of 8 IOCs, 2 malware families, and CVE-2024-21762 linked to APT28 campaign.',
    severity: 'critical', confidence: 88, entityIds: ['n1', 'n6', 'n8', 'n10'], entityLabels: ['APT28', 'evil-payload.darknet.ru', 'CVE-2024-21762', 'Op Fancy Storm'],
    suppressed: false, createdAt: daysAgo(1),
    diamondModel: { adversary: 'APT28', infrastructure: 'evil-payload.darknet.ru', capability: 'CVE-2024-21762 RCE', victim: 'Defense contractors' },
    killChainPhase: 'exploitation',
  },
  {
    id: 'corr-4', correlationType: 'ttp_similarity', title: 'TTP Overlap: FIN7 ↔ Lazarus (credential harvesting)',
    description: 'Both actors using identical phishing kit templates and Emotet delivery chain.',
    severity: 'medium', confidence: 65, entityIds: ['n2', 'n15', 'n4'], entityLabels: ['Lazarus Group', 'FIN7', 'Emotet'],
    suppressed: false, createdAt: daysAgo(2),
    killChainPhase: 'weaponization',
  },
  {
    id: 'corr-5', correlationType: 'cooccurrence', title: 'Co-occurrence: LockBit + CVE-2024-1709',
    description: 'LockBit ransomware consistently deployed after CVE-2024-1709 exploitation (5 incidents).',
    severity: 'high', confidence: 78, entityIds: ['n13', 'n14'], entityLabels: ['LockBit', 'CVE-2024-1709'],
    suppressed: false, createdAt: daysAgo(3),
    diamondModel: { adversary: 'Unknown ransomware group', infrastructure: 'ConnectWise ScreenConnect', capability: 'LockBit 3.0', victim: 'SMB organizations' },
    killChainPhase: 'actions_on_objectives',
  },
  {
    id: 'corr-6', correlationType: 'infrastructure', title: 'False positive: shared CDN infrastructure',
    description: 'Cloudflare IPs co-located — benign shared hosting.',
    severity: 'low', confidence: 25, entityIds: [], entityLabels: [],
    suppressed: true, createdAt: daysAgo(5),
  },
]

export const DEMO_CORRELATION_STATS: CorrelationStats = {
  total: 6, byType: { infrastructure: 2, temporal: 1, campaign: 1, ttp_similarity: 1, cooccurrence: 1 },
  bySeverity: { critical: 2, high: 2, medium: 1, low: 1 },
  suppressedCount: 1, avgConfidence: 72,
}

export const DEMO_CAMPAIGNS: CampaignCluster[] = [
  { id: 'camp-1', name: 'Operation Fancy Storm', description: 'APT28-attributed campaign targeting government and defense orgs via Fortinet CVE exploitation.', actorId: 'n1', actorName: 'APT28', techniques: ['T1190', 'T1071.001', 'T1059.001'], confidence: 88, iocCount: 8, createdAt: daysAgo(15) },
  { id: 'camp-2', name: 'Dark Seoul 2.0', description: 'Lazarus Group financial sector campaign using Emotet delivery chain.', actorId: 'n2', actorName: 'Lazarus Group', techniques: ['T1566.001', 'T1059.005', 'T1486'], confidence: 82, iocCount: 5, createdAt: daysAgo(30) },
]

// ─── Threat Hunting Types & Demo Data ───────────────────────────

export interface HuntSession {
  id: string; name: string; description: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  huntType: 'hypothesis' | 'indicator' | 'behavioral' | 'anomaly'
  createdBy: string; createdAt: string; updatedAt: string
  findingsCount: number; evidenceCount: number; hypothesisCount: number
  score: number
}

export interface HuntHypothesis {
  id: string; huntId: string; statement: string; rationale: string
  verdict: 'proposed' | 'investigating' | 'confirmed' | 'rejected' | 'inconclusive'
  mitreTechniques: string[]; createdAt: string
}

export interface HuntEvidence {
  id: string; huntId: string; type: 'ioc_match' | 'log_entry' | 'network_capture' | 'screenshot' | 'artifact'
  title: string; description: string; entityType?: string; entityValue?: string
  tags: string[]; createdAt: string
}

export interface HuntStats {
  total: number; active: number; completed: number
  totalFindings: number; avgScore: number; byType: Record<string, number>
}

export interface HuntTemplate {
  id: string; name: string; description: string; huntType: string
  category: string; mitreTechniques: string[]; usageCount: number
}

export const DEMO_HUNT_SESSIONS: HuntSession[] = [
  { id: 'hunt-1', name: 'APT28 Lateral Movement Hunt', description: 'Investigating APT28 lateral movement techniques post-Fortinet exploitation in government networks.', status: 'active', huntType: 'hypothesis', createdBy: 'Manish', createdAt: hoursAgo(6), updatedAt: hoursAgo(1), findingsCount: 4, evidenceCount: 7, hypothesisCount: 3, score: 78 },
  { id: 'hunt-2', name: 'Emotet Delivery Chain Analysis', description: 'Tracing Emotet loader distribution chain from phishing emails to final payload delivery.', status: 'active', huntType: 'indicator', createdBy: 'Manish', createdAt: daysAgo(1), updatedAt: hoursAgo(4), findingsCount: 6, evidenceCount: 12, hypothesisCount: 2, score: 85 },
  { id: 'hunt-3', name: 'Credential Leak Impact Assessment', description: 'Assessing impact of leaked @intelwatch.in credentials found on paste sites.', status: 'paused', huntType: 'indicator', createdBy: 'Manish', createdAt: daysAgo(3), updatedAt: daysAgo(1), findingsCount: 2, evidenceCount: 5, hypothesisCount: 1, score: 45 },
  { id: 'hunt-4', name: 'LockBit Ransomware TTPs', description: 'Completed hunt on LockBit deployment patterns after ScreenConnect exploitation.', status: 'completed', huntType: 'behavioral', createdBy: 'Manish', createdAt: daysAgo(10), updatedAt: daysAgo(5), findingsCount: 8, evidenceCount: 15, hypothesisCount: 4, score: 92 },
  { id: 'hunt-5', name: 'DNS Anomaly Detection', description: 'Behavioral analysis of DNS patterns for tunneling and DGA detection.', status: 'completed', huntType: 'anomaly', createdBy: 'Manish', createdAt: daysAgo(15), updatedAt: daysAgo(8), findingsCount: 3, evidenceCount: 8, hypothesisCount: 2, score: 68 },
]

export const DEMO_HUNT_HYPOTHESES: HuntHypothesis[] = [
  { id: 'hyp-1', huntId: 'hunt-1', statement: 'APT28 used PowerShell for lateral movement after Fortinet exploitation', rationale: 'Historical APT28 TTPs show consistent use of T1059.001 post-initial access. Correlates with CVE-2024-21762 exploitation timeline.', verdict: 'investigating', mitreTechniques: ['T1059.001', 'T1021.001'], createdAt: hoursAgo(5) },
  { id: 'hyp-2', huntId: 'hunt-1', statement: 'C2 beacon uses HTTPS on non-standard port', rationale: 'Cobalt Strike profiles commonly use ports 8443 or 8080 for HTTPS callbacks.', verdict: 'confirmed', mitreTechniques: ['T1071.001', 'T1571'], createdAt: hoursAgo(4) },
  { id: 'hyp-3', huntId: 'hunt-1', statement: 'Data exfiltration via DNS tunneling', rationale: 'APT28 has used dns2tcp in previous campaigns for slow data exfiltration.', verdict: 'proposed', mitreTechniques: ['T1048.001'], createdAt: hoursAgo(2) },
  { id: 'hyp-4', huntId: 'hunt-2', statement: 'Emotet uses VBS macro in initial phishing email', rationale: 'Standard Emotet delivery mechanism since 2023 refresh.', verdict: 'confirmed', mitreTechniques: ['T1566.001', 'T1059.005'], createdAt: daysAgo(1) },
  { id: 'hyp-5', huntId: 'hunt-2', statement: 'Second-stage payload downloaded from compromised WordPress site', rationale: 'Emotet frequently uses compromised WordPress as staging infrastructure.', verdict: 'investigating', mitreTechniques: ['T1105', 'T1584.004'], createdAt: daysAgo(1) },
]

export const DEMO_HUNT_EVIDENCE: HuntEvidence[] = [
  { id: 'ev-1', huntId: 'hunt-1', type: 'ioc_match', title: 'C2 IP match: 185.220.101.34', description: 'Known APT28 C2 IP detected in outbound connections.', entityType: 'ip', entityValue: '185.220.101.34', tags: ['c2', 'apt28'], createdAt: hoursAgo(5) },
  { id: 'ev-2', huntId: 'hunt-1', type: 'log_entry', title: 'PowerShell encoded command execution', description: 'Base64-encoded PowerShell detected on endpoint WKSTN-042.', tags: ['t1059', 'powershell'], createdAt: hoursAgo(4) },
  { id: 'ev-3', huntId: 'hunt-1', type: 'network_capture', title: 'HTTPS beacon to 185.220.101.34:8443', description: 'Regular 60s interval HTTPS callbacks captured via packet analysis.', entityType: 'ip', entityValue: '185.220.101.34', tags: ['beacon', 'cobalt-strike'], createdAt: hoursAgo(3) },
  { id: 'ev-4', huntId: 'hunt-2', type: 'artifact', title: 'Emotet dropper SHA-256', description: 'Macro-enabled DOCX delivering Emotet via VBS macro.', entityType: 'hash_sha256', entityValue: 'a3b8f2d1e4c7965fab12de345678900cfda1b2c3d4e5f67890abcdef12345679', tags: ['emotet', 'dropper'], createdAt: daysAgo(1) },
  { id: 'ev-5', huntId: 'hunt-2', type: 'ioc_match', title: 'Emotet C2: 91.219.236.174', description: 'Emotet phone-home detected within 2 min of macro execution.', entityType: 'ip', entityValue: '91.219.236.174', tags: ['emotet', 'c2'], createdAt: daysAgo(1) },
]

export const DEMO_HUNT_STATS: HuntStats = {
  total: 5, active: 2, completed: 2,
  totalFindings: 23, avgScore: 74,
  byType: { hypothesis: 1, indicator: 2, behavioral: 1, anomaly: 1 },
}

export const DEMO_HUNT_TEMPLATES: HuntTemplate[] = [
  { id: 'tpl-1', name: 'APT Lateral Movement', description: 'Hunt for lateral movement techniques commonly used by APT groups.', huntType: 'hypothesis', category: 'APT', mitreTechniques: ['T1021', 'T1059', 'T1047'], usageCount: 12 },
  { id: 'tpl-2', name: 'Ransomware Pre-deployment', description: 'Identify ransomware staging activities before encryption phase.', huntType: 'behavioral', category: 'Ransomware', mitreTechniques: ['T1486', 'T1490', 'T1489'], usageCount: 8 },
  { id: 'tpl-3', name: 'Credential Harvesting', description: 'Hunt for credential theft and exfiltration patterns.', huntType: 'indicator', category: 'Credential Theft', mitreTechniques: ['T1003', 'T1110', 'T1555'], usageCount: 15 },
  { id: 'tpl-4', name: 'DNS Anomaly', description: 'Detect DNS tunneling, DGA domains, and DNS-based C2.', huntType: 'anomaly', category: 'Network', mitreTechniques: ['T1048.001', 'T1568.002'], usageCount: 6 },
]

// ─── Alert Heatmap Data (90 days) ───────────────────────────────

export function generateAlertHeatmap(): { date: string; count: number }[] {
  const data: { date: string; count: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000)
    const day = date.getDay()
    // More alerts on weekdays, occasional spikes
    const base = day === 0 || day === 6 ? 1 : 3
    const spike = Math.random() > 0.9 ? Math.floor(Math.random() * 8) : 0
    data.push({
      date: date.toISOString().split('T')[0]!,
      count: Math.max(0, base + Math.floor(Math.random() * 4) + spike),
    })
  }
  return data
}
