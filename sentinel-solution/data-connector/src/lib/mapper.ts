/**
 * Maps ETIP IOC objects to Microsoft Graph Security tiIndicator format.
 * Reference: https://learn.microsoft.com/en-us/graph/api/resources/tiindicator
 */

import { EtipIOC } from './etip-client.js';

export interface GraphTiIndicator {
  action: string;
  activityGroupNames: string[];
  confidence: number;
  description: string;
  expirationDateTime: string;
  externalId: string;
  firstSeenDateTime: string;
  isActive: boolean;
  killChain: Array<{ name: string }>;
  lastSeenDateTime: string;
  malwareFamilyNames: string[];
  severity: number;
  tags: string[];
  targetProduct: string;
  threatIntelligencePlatforms: string[];
  threatType: string;
  tlpLevel: string;
  [key: string]: unknown;
}

const SEVERITY_TO_THREAT_TYPE: Record<string, string> = {
  critical: 'MalwareC2',
  high: 'MalwareC2',
  medium: 'Suspicious',
  low: 'Benign',
  info: 'Benign',
};

const SEVERITY_TO_INT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const DEFAULT_EXPIRY_DAYS = 90;

/**
 * Map ETIP IOC type to the correct Graph tiIndicator field.
 * - ip -> networkIPv4 (or networkIPv6 if value contains ':')
 * - domain -> networkDomainName
 * - url -> url
 * - hash -> fileSha256
 * - email -> emailSenderAddress
 */
function mapIocTypeFields(ioc: EtipIOC): Record<string, string> {
  switch (ioc.type) {
    case 'ip':
      return ioc.value.includes(':')
        ? { networkIPv6: ioc.value }
        : { networkIPv4: ioc.value };
    case 'domain':
      return { networkDomainName: ioc.value };
    case 'url':
      return { url: ioc.value };
    case 'hash':
      return { fileSha256: ioc.value };
    case 'email':
      return { emailSenderAddress: ioc.value };
    default:
      return { networkDomainName: ioc.value };
  }
}

/**
 * Build a human-readable description including IOC metadata.
 */
function buildDescription(ioc: EtipIOC): string {
  const parts = [
    `ETIP IOC: ${ioc.type} indicator [${ioc.value}]`,
    `Severity: ${ioc.severity}`,
    `TLP: ${ioc.tlp}`,
    `Confidence: ${ioc.confidence}%`,
    `Lifecycle: ${ioc.lifecycle}`,
  ];

  if (ioc.threatActors.length > 0) {
    parts.push(`Threat Actors: ${ioc.threatActors.join(', ')}`);
  }
  if (ioc.malwareFamilies.length > 0) {
    parts.push(`Malware Families: ${ioc.malwareFamilies.join(', ')}`);
  }
  if (ioc.mitreAttack.length > 0) {
    parts.push(`MITRE ATT&CK: ${ioc.mitreAttack.join(', ')}`);
  }
  if (ioc.tags.length > 0) {
    parts.push(`Tags: ${ioc.tags.join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * Map a single ETIP IOC to a Microsoft Graph tiIndicator object.
 */
export function mapIocToIndicator(ioc: EtipIOC): GraphTiIndicator {
  const expirationDateTime = ioc.expiresAt
    ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return {
    action: ioc.lifecycle === 'active' ? 'alert' : 'block',
    activityGroupNames: ioc.threatActors,
    confidence: Math.max(0, Math.min(100, ioc.confidence)),
    description: buildDescription(ioc),
    expirationDateTime,
    externalId: ioc.id,
    firstSeenDateTime: ioc.firstSeen,
    isActive: ioc.lifecycle === 'active',
    killChain: ioc.mitreAttack.map((technique) => ({ name: technique })),
    lastSeenDateTime: ioc.lastSeen,
    malwareFamilyNames: ioc.malwareFamilies,
    severity: SEVERITY_TO_INT[ioc.severity] ?? 1,
    tags: ioc.tags,
    targetProduct: 'Azure Sentinel',
    threatIntelligencePlatforms: ['IntelWatch ETIP'],
    threatType: SEVERITY_TO_THREAT_TYPE[ioc.severity] ?? 'Suspicious',
    tlpLevel: ioc.tlp,
    ...mapIocTypeFields(ioc),
  };
}

/**
 * Map a batch of ETIP IOCs to Graph tiIndicator objects.
 */
export function mapIocBatch(iocs: EtipIOC[]): GraphTiIndicator[] {
  return iocs.map(mapIocToIndicator);
}
