/**
 * @module routes/public/stix-mapper
 * @description Converts ETIP IOCs to STIX 2.1 bundles for public API export.
 * Maps IOCs to Indicators (SDO) + Cyber Observables (SCO) + Relationships.
 * Uses existing STIX type mappings from @etip/shared-types/stix.
 */
import { randomUUID, createHash } from 'crypto';
import {
  IOC_TO_STIX_SCO,
  TLP_TO_STIX_MARKING,
  type StixBundle,
} from '@etip/shared-types';
import type { PublicIocDto } from '@etip/shared-types';

interface StixObject { [key: string]: unknown; }

/** Deterministic UUID from a string (for SCO deduplication). */
function deterministicUuid(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return [
    hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16),
    hash.slice(16, 20), hash.slice(20, 32),
  ].join('-');
}

/** Build a STIX 2.1 pattern string from IOC type + value. */
function buildStixPattern(iocType: string, value: string): string {
  const escaped = value.replace(/'/g, "\\'");
  switch (iocType) {
    case 'ip':           return `[ipv4-addr:value = '${escaped}']`;
    case 'ipv6':         return `[ipv6-addr:value = '${escaped}']`;
    case 'domain':
    case 'fqdn':         return `[domain-name:value = '${escaped}']`;
    case 'url':          return `[url:value = '${escaped}']`;
    case 'email':        return `[email-addr:value = '${escaped}']`;
    case 'md5':          return `[file:hashes.MD5 = '${escaped}']`;
    case 'sha1':         return `[file:hashes.'SHA-1' = '${escaped}']`;
    case 'sha256':       return `[file:hashes.'SHA-256' = '${escaped}']`;
    case 'sha512':       return `[file:hashes.'SHA-512' = '${escaped}']`;
    case 'asn':          return `[autonomous-system:number = ${value}]`;
    case 'cidr':         return `[ipv4-addr:value = '${escaped}']`;
    case 'cve':          return `[vulnerability:name = '${escaped}']`;
    default:             return `[x-etip-indicator:value = '${escaped}']`;
  }
}

/** Build a STIX Cyber Observable (SCO) object. */
function buildSco(scoType: string, scoId: string, iocType: string, value: string): StixObject {
  const base = { type: scoType, id: scoId, spec_version: '2.1' };

  switch (scoType) {
    case 'ipv4-addr':
    case 'ipv6-addr':
      return { ...base, value };
    case 'domain-name':
      return { ...base, value };
    case 'url':
      return { ...base, value };
    case 'email-addr':
      return { ...base, value };
    case 'file':
      return { ...base, hashes: { [hashAlgoFromType(iocType)]: value } };
    case 'autonomous-system':
      return { ...base, number: parseInt(value, 10) || 0 };
    default:
      return { ...base, value };
  }
}

function hashAlgoFromType(iocType: string): string {
  switch (iocType) {
    case 'md5':    return 'MD5';
    case 'sha1':   return 'SHA-1';
    case 'sha256': return 'SHA-256';
    case 'sha512': return 'SHA-512';
    default:       return 'SHA-256';
  }
}

/**
 * Convert an array of PublicIocDto to a STIX 2.1 Bundle.
 * Generates: Identity, Indicators, SCOs, Relationships, Malware SDOs, ThreatActor SDOs.
 */
export function iocsToStixBundle(iocs: PublicIocDto[]): StixBundle {
  const objects: StixObject[] = [];
  const now = new Date().toISOString();
  const seenMalware = new Map<string, string>();
  const seenActors = new Map<string, string>();

  // Platform identity
  const identityId = `identity--${deterministicUuid('intelwatch-etip')}`;
  objects.push({
    type: 'identity',
    spec_version: '2.1',
    id: identityId,
    created: now,
    modified: now,
    name: 'IntelWatch ETIP',
    identity_class: 'system',
  });

  for (const ioc of iocs) {
    const indicatorId = `indicator--${ioc.id}`;
    const tlpMarking = TLP_TO_STIX_MARKING[ioc.tlp.toUpperCase()];

    // STIX Indicator (SDO)
    objects.push({
      type: 'indicator',
      spec_version: '2.1',
      id: indicatorId,
      created: ioc.createdAt,
      modified: ioc.lastSeen,
      name: `${ioc.type}: ${ioc.value}`,
      pattern: buildStixPattern(ioc.type, ioc.value),
      pattern_type: 'stix',
      valid_from: ioc.firstSeen,
      ...(ioc.expiresAt && { valid_until: ioc.expiresAt }),
      confidence: ioc.confidence,
      labels: ioc.tags.length > 0 ? ioc.tags : undefined,
      created_by_ref: identityId,
      ...(tlpMarking && { object_marking_refs: [tlpMarking] }),
      indicator_types: ['malicious-activity'],
      ...(ioc.mitreAttack.length > 0 && {
        kill_chain_phases: ioc.mitreAttack.map((t: string) => ({
          kill_chain_name: 'mitre-attack',
          phase_name: t,
        })),
      }),
    });

    // STIX Cyber Observable (SCO) + relationship
    const scoType = IOC_TO_STIX_SCO[ioc.type as keyof typeof IOC_TO_STIX_SCO];
    if (scoType) {
      const scoId = `${scoType}--${deterministicUuid(ioc.value)}`;
      objects.push(buildSco(scoType, scoId, ioc.type, ioc.value));
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: `relationship--${randomUUID()}`,
        relationship_type: 'based-on',
        source_ref: indicatorId,
        target_ref: scoId,
        created: ioc.createdAt,
        modified: ioc.lastSeen,
      });
    }

    // Malware SDOs (deduplicated)
    for (const family of ioc.malwareFamilies) {
      let malwareId = seenMalware.get(family);
      if (!malwareId) {
        malwareId = `malware--${deterministicUuid(family)}`;
        seenMalware.set(family, malwareId);
        objects.push({
          type: 'malware',
          spec_version: '2.1',
          id: malwareId,
          created: now,
          modified: now,
          name: family,
          is_family: true,
          malware_types: ['unknown'],
        });
      }
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: `relationship--${randomUUID()}`,
        relationship_type: 'indicates',
        source_ref: indicatorId,
        target_ref: malwareId,
        created: ioc.createdAt,
        modified: ioc.lastSeen,
      });
    }

    // Threat Actor SDOs (deduplicated)
    for (const actor of ioc.threatActors) {
      let actorId = seenActors.get(actor);
      if (!actorId) {
        actorId = `threat-actor--${deterministicUuid(actor)}`;
        seenActors.set(actor, actorId);
        objects.push({
          type: 'threat-actor',
          spec_version: '2.1',
          id: actorId,
          created: now,
          modified: now,
          name: actor,
          threat_actor_types: ['unknown'],
        });
      }
      objects.push({
        type: 'relationship',
        spec_version: '2.1',
        id: `relationship--${randomUUID()}`,
        relationship_type: 'indicates',
        source_ref: indicatorId,
        target_ref: actorId,
        created: ioc.createdAt,
        modified: ioc.lastSeen,
      });
    }
  }

  return {
    type: 'bundle',
    id: `bundle--${randomUUID()}`,
    objects,
  };
}
