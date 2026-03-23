import { randomUUID } from 'crypto';
import type { StixBundle, StixObject, TaxiiCollection } from '../schemas/integration.js';

/** IOC type to STIX indicator pattern mapping. */
const IOC_TO_STIX_PATTERN: Record<string, (value: string) => string> = {
  ip: (v) => `[ipv4-addr:value = '${v}']`,
  ipv4: (v) => `[ipv4-addr:value = '${v}']`,
  ipv6: (v) => `[ipv6-addr:value = '${v}']`,
  domain: (v) => `[domain-name:value = '${v}']`,
  url: (v) => `[url:value = '${v}']`,
  email: (v) => `[email-addr:value = '${v}']`,
  md5: (v) => `[file:hashes.MD5 = '${v}']`,
  sha1: (v) => `[file:hashes.'SHA-1' = '${v}']`,
  sha256: (v) => `[file:hashes.'SHA-256' = '${v}']`,
  hash_md5: (v) => `[file:hashes.MD5 = '${v}']`,
  hash_sha1: (v) => `[file:hashes.'SHA-1' = '${v}']`,
  hash_sha256: (v) => `[file:hashes.'SHA-256' = '${v}']`,
};

/** Map ETIP severity to STIX TLP marking. */
const SEVERITY_TO_TLP: Record<string, string> = {
  critical: 'marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed', // TLP:RED
  high: 'marking-definition--f88d31f6-486f-44da-b317-01333bde0b82',     // TLP:AMBER
  medium: 'marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da',   // TLP:GREEN
  low: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',      // TLP:WHITE
  info: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',     // TLP:WHITE
};

/**
 * STIX 2.1 export service. Converts ETIP entities to STIX bundles
 * and serves them via TAXII 2.1-compatible endpoints.
 */
export class StixExportService {
  /** TAXII discovery response. */
  getDiscovery(baseUrl: string): { title: string; default: string; api_roots: string[] } {
    return {
      title: 'ETIP TAXII Server',
      default: `${baseUrl}/api/v1/integrations/taxii/api1/`,
      api_roots: [`${baseUrl}/api/v1/integrations/taxii/api1/`],
    };
  }

  /** List available TAXII collections for a tenant. */
  getCollections(tenantId: string): { collections: TaxiiCollection[] } {
    return {
      collections: [
        {
          id: `etip-iocs-${tenantId}`,
          title: 'ETIP IOC Feed',
          description: 'Threat indicators from ETIP platform',
          canRead: true,
          canWrite: false,
          mediaTypes: ['application/stix+json;version=2.1'],
        },
        {
          id: `etip-alerts-${tenantId}`,
          title: 'ETIP Alert Feed',
          description: 'Security alerts from ETIP platform',
          canRead: true,
          canWrite: false,
          mediaTypes: ['application/stix+json;version=2.1'],
        },
      ],
    };
  }

  /** Convert an array of IOC records to a STIX 2.1 bundle. */
  iocToStixBundle(
    iocs: Array<{
      id: string;
      type: string;
      value: string;
      severity?: string;
      confidence?: number;
      description?: string;
      createdAt?: string;
      updatedAt?: string;
      feedName?: string;
      tags?: string[];
    }>,
    tenantId: string,
  ): StixBundle {
    const identity = this.createIdentity(tenantId);
    const objects: StixObject[] = [identity];

    for (const ioc of iocs) {
      const indicator = this.iocToIndicator(ioc, identity.id);
      if (indicator) objects.push(indicator);
    }

    return {
      type: 'bundle',
      id: `bundle--${randomUUID()}`,
      objects,
    };
  }

  /** Convert an alert to a STIX 2.1 sighting object. */
  alertToStixSighting(
    alert: {
      id: string;
      title: string;
      severity: string;
      description?: string;
      createdAt: string;
      indicatorIds?: string[];
    },
    tenantId: string,
  ): StixObject {
    const now = new Date().toISOString();
    return {
      type: 'sighting',
      spec_version: '2.1',
      id: `sighting--${alert.id}`,
      created: alert.createdAt || now,
      modified: now,
      first_seen: alert.createdAt || now,
      description: alert.description ?? alert.title,
      sighting_of_ref: alert.indicatorIds?.[0]
        ? `indicator--${alert.indicatorIds[0]}`
        : `identity--${tenantId}`,
      where_sighted_refs: [`identity--${tenantId}`],
      confidence: this.severityToConfidence(alert.severity),
      object_marking_refs: [SEVERITY_TO_TLP[alert.severity] ?? SEVERITY_TO_TLP.medium],
    };
  }

  /** Convert a single IOC to a STIX indicator. */
  private iocToIndicator(
    ioc: {
      id: string;
      type: string;
      value: string;
      severity?: string;
      confidence?: number;
      description?: string;
      createdAt?: string;
      updatedAt?: string;
      tags?: string[];
    },
    identityRef: string,
  ): StixObject | null {
    const patternFn = IOC_TO_STIX_PATTERN[ioc.type];
    if (!patternFn) return null;

    const now = new Date().toISOString();
    return {
      type: 'indicator',
      spec_version: '2.1',
      id: `indicator--${ioc.id}`,
      created: ioc.createdAt ?? now,
      modified: ioc.updatedAt ?? now,
      name: `${ioc.type}:${ioc.value}`,
      description: ioc.description ?? `${ioc.type} indicator: ${ioc.value}`,
      pattern: patternFn(ioc.value),
      pattern_type: 'stix',
      valid_from: ioc.createdAt ?? now,
      indicator_types: ['malicious-activity'],
      confidence: ioc.confidence ?? 50,
      created_by_ref: identityRef,
      labels: ioc.tags ?? [],
      object_marking_refs: [
        SEVERITY_TO_TLP[ioc.severity ?? 'medium'] ?? SEVERITY_TO_TLP.medium,
      ],
    };
  }

  /** Create a STIX identity for the tenant. */
  private createIdentity(tenantId: string): StixObject {
    const now = new Date().toISOString();
    return {
      type: 'identity',
      spec_version: '2.1',
      id: `identity--${tenantId}`,
      created: now,
      modified: now,
      name: 'ETIP Platform',
      identity_class: 'organization',
    };
  }

  /** Map severity string to STIX confidence score (0-100). */
  private severityToConfidence(severity: string): number {
    const map: Record<string, number> = {
      critical: 95,
      high: 80,
      medium: 60,
      low: 40,
      info: 20,
    };
    return map[severity?.toLowerCase()] ?? 50;
  }
}
