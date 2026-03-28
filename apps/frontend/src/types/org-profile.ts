/**
 * @module types/org-profile
 * @description Organization profile types for personalized threat intelligence.
 * Used by SettingsTab (org profile form) and DashboardPage (relevance scoring).
 */

export type Industry =
  | 'Finance' | 'Healthcare' | 'Government' | 'Energy' | 'Telecom'
  | 'Retail' | 'Manufacturing' | 'Education' | 'Technology' | 'Defense'

export type BusinessRisk =
  | 'DataBreach' | 'Ransomware' | 'IPTheft' | 'ServiceDisruption'
  | 'RegulatoryCompliance' | 'SupplyChain'

export type OrgSize = 'startup' | 'smb' | 'enterprise' | 'large_enterprise'

export interface TechStack {
  os: string[]
  cloud: string[]
  network: string[]
  database: string[]
  web: string[]
}

export interface Geography {
  country: string
  region: string
}

export interface OrgProfile {
  industry: Industry
  techStack: TechStack
  businessRisk: BusinessRisk[]
  orgSize: OrgSize
  geography: Geography
}

export type AlertSensitivity = 'low' | 'balanced' | 'aggressive'

export type DigestFrequency = 'daily' | 'weekly' | 'off'

export interface NotificationPrefs {
  digestFrequency: DigestFrequency
  realTimeAlerts: boolean
  quietHoursStart: string // HH:mm
  quietHoursEnd: string   // HH:mm
}

export interface OnboardingProgress {
  profile: boolean
  firstFeed: boolean
  inviteTeam: boolean
  configureAlerts: boolean
}

// ─── Constants ────────────────────────────────────────────────

export const INDUSTRIES: Industry[] = [
  'Finance', 'Healthcare', 'Government', 'Energy', 'Telecom',
  'Retail', 'Manufacturing', 'Education', 'Technology', 'Defense',
]

export const BUSINESS_RISKS: { value: BusinessRisk; label: string }[] = [
  { value: 'DataBreach', label: 'Data Breach' },
  { value: 'Ransomware', label: 'Ransomware' },
  { value: 'IPTheft', label: 'IP Theft' },
  { value: 'ServiceDisruption', label: 'Service Disruption' },
  { value: 'RegulatoryCompliance', label: 'Regulatory Compliance' },
  { value: 'SupplyChain', label: 'Supply Chain' },
]

export const ORG_SIZES: { value: OrgSize; label: string }[] = [
  { value: 'startup', label: 'Startup (1-50)' },
  { value: 'smb', label: 'SMB (50-500)' },
  { value: 'enterprise', label: 'Enterprise (500-5,000)' },
  { value: 'large_enterprise', label: 'Large Enterprise (5,000+)' },
]

export const TECH_STACK_OPTIONS: Record<keyof TechStack, string[]> = {
  os: ['Windows', 'Linux', 'macOS', 'iOS', 'Android'],
  cloud: ['AWS', 'Azure', 'GCP', 'Oracle Cloud', 'On-Prem'],
  network: ['Cisco', 'Palo Alto', 'Fortinet', 'Juniper', 'F5'],
  database: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch'],
  web: ['Apache', 'Nginx', 'IIS', 'Node.js', 'WordPress'],
}

export const DEMO_ORG_PROFILE: OrgProfile = {
  industry: 'Technology',
  techStack: {
    os: ['Windows', 'Linux'],
    cloud: ['AWS'],
    network: ['Palo Alto'],
    database: ['PostgreSQL', 'Redis'],
    web: ['Nginx', 'Node.js'],
  },
  businessRisk: ['DataBreach', 'Ransomware'],
  orgSize: 'smb',
  geography: { country: 'India', region: 'Asia' },
}
