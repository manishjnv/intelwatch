/**
 * @module lib/relevance-scoring
 * @description Pure client-side relevance scoring for org-aware dashboard.
 * Boosts IOCs, actors, CVEs, malware based on org profile matches.
 */
import type { OrgProfile } from '@/types/org-profile'

/** Weights for each match dimension */
const WEIGHTS = {
  industry: 30,
  techStack: 25,
  businessRisk: 20,
  geography: 15,
  orgSize: 10,
} as const

/** Generic intel item shape — works with IOCs, actors, CVEs, malware */
interface IntelItem {
  tags?: string[]
  sectors?: string[]
  platforms?: string[]
  threatActors?: string[]
  malwareFamilies?: string[]
  severity?: string
  iocType?: string
  [key: string]: unknown
}

/** Industry → keywords that appear in tags/sectors */
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  Finance: ['financial', 'banking', 'finance', 'fintech', 'payment'],
  Healthcare: ['healthcare', 'medical', 'health', 'pharma', 'hospital'],
  Government: ['government', 'gov', 'military', 'defense', 'public-sector'],
  Energy: ['energy', 'power', 'oil', 'gas', 'utility', 'grid'],
  Telecom: ['telecom', 'telecommunications', 'isp', 'mobile', '5g'],
  Retail: ['retail', 'ecommerce', 'pos', 'payment', 'shopping'],
  Manufacturing: ['manufacturing', 'industrial', 'ics', 'scada', 'ot'],
  Education: ['education', 'university', 'academic', 'school', 'research'],
  Technology: ['technology', 'tech', 'software', 'saas', 'cloud'],
  Defense: ['defense', 'military', 'government', 'intelligence', 'nato'],
}

/** Risk category → tags that indicate this risk */
const RISK_KEYWORDS: Record<string, string[]> = {
  DataBreach: ['data-breach', 'exfiltration', 'credential-theft', 'phishing'],
  Ransomware: ['ransomware', 'encryption', 'ransom', 'lockbit', 'blackcat'],
  IPTheft: ['ip-theft', 'espionage', 'apt', 'state-sponsored'],
  ServiceDisruption: ['ddos', 'disruption', 'dos', 'wiper', 'destruction'],
  RegulatoryCompliance: ['compliance', 'gdpr', 'hipaa', 'pci', 'regulation'],
  SupplyChain: ['supply-chain', 'dependency', 'package', 'npm', 'pypi'],
}

/** Tech stack → platform/product keywords */
const TECH_KEYWORDS: Record<string, string[]> = {
  Windows: ['windows', 'win32', 'win64', 'microsoft', 'active-directory'],
  Linux: ['linux', 'ubuntu', 'centos', 'debian', 'rhel'],
  macOS: ['macos', 'osx', 'apple', 'darwin'],
  AWS: ['aws', 'amazon', 's3', 'ec2', 'lambda'],
  Azure: ['azure', 'microsoft-cloud', 'office365', 'o365'],
  GCP: ['gcp', 'google-cloud', 'gke'],
  PostgreSQL: ['postgresql', 'postgres'],
  MySQL: ['mysql', 'mariadb'],
  MongoDB: ['mongodb', 'nosql'],
  Redis: ['redis'],
  Elasticsearch: ['elasticsearch', 'elastic', 'kibana'],
  Apache: ['apache', 'httpd'],
  Nginx: ['nginx'],
  IIS: ['iis', 'microsoft-iis'],
  'Node.js': ['node', 'nodejs', 'npm', 'express'],
  WordPress: ['wordpress', 'wp-'],
  Cisco: ['cisco'],
  'Palo Alto': ['paloalto', 'palo-alto', 'pan-os'],
  Fortinet: ['fortinet', 'fortigate'],
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchesAny(haystack: string[], needles: string[]): boolean {
  const normalizedHay = haystack.map(normalize)
  return needles.some(n => normalizedHay.some(h => h.includes(normalize(n))))
}

function getAllItemText(item: IntelItem): string[] {
  const result: string[] = []
  if (item.tags) result.push(...item.tags)
  if (item.sectors) result.push(...item.sectors)
  if (item.platforms) result.push(...item.platforms)
  if (item.threatActors) result.push(...item.threatActors)
  if (item.malwareFamilies) result.push(...item.malwareFamilies)
  if (item.iocType) result.push(item.iocType)
  return result
}

/**
 * Calculate relevance boost for an intel item based on org profile.
 * Returns a number 0-100 representing the total boost.
 */
export function calculateRelevanceBoost(item: IntelItem, profile: OrgProfile | null): number {
  if (!profile) return 0

  let boost = 0
  const allText = getAllItemText(item)
  if (allText.length === 0) return 0

  // Industry match (+30)
  const industryKeywords = INDUSTRY_KEYWORDS[profile.industry] ?? []
  if (matchesAny(allText, industryKeywords)) {
    boost += WEIGHTS.industry
  }

  // Tech stack match (+25)
  const techValues = [
    ...profile.techStack.os,
    ...profile.techStack.cloud,
    ...profile.techStack.network,
    ...profile.techStack.database,
    ...profile.techStack.web,
  ]
  const techKeywords = techValues.flatMap(t => TECH_KEYWORDS[t] ?? [t.toLowerCase()])
  if (matchesAny(allText, techKeywords)) {
    boost += WEIGHTS.techStack
  }

  // Business risk match (+20)
  const riskKeywords = profile.businessRisk.flatMap(r => RISK_KEYWORDS[r] ?? [])
  if (matchesAny(allText, riskKeywords)) {
    boost += WEIGHTS.businessRisk
  }

  // Geography match (+15) — check for country/region in tags
  const geoTerms = [profile.geography.country, profile.geography.region].filter(Boolean)
  if (matchesAny(allText, geoTerms)) {
    boost += WEIGHTS.geography
  }

  // Org size match (+10) — larger orgs match APT/state-sponsored, smaller match opportunistic
  const sizeKeywords = profile.orgSize === 'enterprise' || profile.orgSize === 'large_enterprise'
    ? ['apt', 'state-sponsored', 'targeted']
    : ['opportunistic', 'spray-and-pray', 'botnet', 'scanner']
  if (matchesAny(allText, sizeKeywords)) {
    boost += WEIGHTS.orgSize
  }

  return Math.min(boost, 100)
}

/**
 * Sort items by relevance boost descending, then by original order.
 */
export function sortByRelevance<T extends IntelItem>(items: T[], profile: OrgProfile | null): T[] {
  if (!profile) return items
  return [...items].sort((a, b) => calculateRelevanceBoost(b, profile) - calculateRelevanceBoost(a, profile))
}

/**
 * Get top priority items that match the org profile.
 */
export function getPriorityItems<T extends IntelItem>(items: T[], profile: OrgProfile | null, limit = 5): T[] {
  if (!profile) return items.slice(0, limit)
  return sortByRelevance(items, profile)
    .filter(item => calculateRelevanceBoost(item, profile) > 0)
    .slice(0, limit)
}
