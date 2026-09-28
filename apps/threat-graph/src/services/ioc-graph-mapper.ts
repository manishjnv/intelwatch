import { createHash } from 'node:crypto';
import type { NodeType, RelationshipType } from '../schemas/graph.js';
import type { IocRecord } from '../clients/ioc-client.js';

/**
 * Pure IOC → graph-plan mapper (S171 P3b). No I/O — takes one IocRecord,
 * returns a plan the writer applies verbatim. Heavily unit-tested in
 * isolation from Neo4j.
 */

export interface GraphPlanNode {
  label: NodeType;
  id: string;
  props: Record<string, unknown>;
}

export interface GraphPlanEdge {
  fromId: string;
  fromLabel: NodeType;
  type: RelationshipType;
  toId: string;
  toLabel: NodeType;
  props: Record<string, unknown>;
}

export type IocGraphPlan =
  | { action: 'delete'; id: string }
  | {
      action: 'upsert';
      primary: GraphPlanNode;
      entities: GraphPlanNode[];
      edges: GraphPlanEdge[];
      ownedEdges: { primaryId: string; types: RelationshipType[] };
    };

const ENTITY_CAP = 25;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const MITRE_RE = /^T\d{4}(\.\d{3})?$/;

/** Severity → base risk points (unknown severity falls back to 25). */
const SEVERITY_SCORE: Record<string, number> = { critical: 95, high: 75, medium: 50, low: 25, info: 10 };

/** Fixed namespace for deterministic UUIDv5 entity ids — never change once deployed. */
const GRAPH_ENTITY_NAMESPACE = '9e1f9c9a-9c1a-5f4e-8a3b-2b6e6b1c9d40';

// ─── RFC 4122 UUIDv5 (SHA-1) ───────────────────────────────────────

function parseUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** RFC 4122 UUIDv5 — deterministic, namespace + name. */
export function uuidv5(name: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(Buffer.concat([parseUuid(namespace), Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(bytes);
}

// ─── Helpers ────────────────────────────────────────────────────────

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function entityId(tenantId: string, label: NodeType, normalizedKey: string): string {
  return uuidv5(`${tenantId}|${label}|${normalizedKey}`, GRAPH_ENTITY_NAMESPACE);
}

/** Dedupes by normalized key, skips blanks, caps at ENTITY_CAP. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = normalize(v);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(v.trim());
    if (out.length >= ENTITY_CAP) break;
  }
  return out;
}

/**
 * baseRiskScore = round(max(
 *   SEVERITY_SCORE[severity] × (0.6 + 0.4 × confidence01),
 *   externalRiskScore (0-100, from enrichmentData, else 0),
 * ))
 */
function baseRiskScore(severity: string, confidence01: number, enrichmentData: unknown): number {
  const weighted = (SEVERITY_SCORE[severity] ?? 25) * (0.6 + 0.4 * confidence01);
  let externalRisk = 0;
  if (enrichmentData && typeof enrichmentData === 'object') {
    const v = (enrichmentData as Record<string, unknown>)['externalRiskScore'];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) externalRisk = v;
  }
  return Math.round(Math.max(weighted, externalRisk));
}

// ─── Mapper ─────────────────────────────────────────────────────────

/** Maps one IOC record to a graph write plan. Returns null to skip (invalid CVE). */
export function mapIocRecord(rec: IocRecord): IocGraphPlan | null {
  if (rec.lifecycle === 'false_positive' || rec.lifecycle === 'revoked') {
    return { action: 'delete', id: rec.id };
  }

  const confidence01 = rec.confidence / 100;
  const risk = baseRiskScore(rec.severity, confidence01, rec.enrichmentData);
  const commonProps: Record<string, unknown> = {
    severity: rec.severity,
    tlp: rec.tlp,
    lifecycle: rec.lifecycle,
    confidence: confidence01,
    feedSourceId: rec.feedSourceId,
    firstSeen: rec.firstSeen,
    lastSeen: rec.lastSeen,
    sourceUpdatedAt: rec.updatedAt,
    origin: 'ioc-sync',
    baseRiskScore: risk,
  };

  let primary: GraphPlanNode;
  if (rec.iocType === 'cve') {
    const cveId = rec.value.trim().toUpperCase();
    if (!CVE_RE.test(cveId)) return null; // caller logs + skips
    primary = { label: 'Vulnerability', id: rec.id, props: { ...commonProps, cveId } };
  } else {
    primary = { label: 'IOC', id: rec.id, props: { ...commonProps, iocType: rec.iocType, value: rec.value } };
  }

  const actors = dedupe(rec.threatActors).map((name) => ({
    label: 'ThreatActor' as const, id: entityId(rec.tenantId, 'ThreatActor', normalize(name)), props: { name, origin: 'ioc-sync' },
  }));
  const malware = dedupe(rec.malwareFamilies).map((name) => ({
    label: 'Malware' as const, id: entityId(rec.tenantId, 'Malware', normalize(name)), props: { name, origin: 'ioc-sync' },
  }));
  const mitreIds = dedupe(rec.mitreAttack.map((m) => m.trim().toUpperCase()).filter((m) => MITRE_RE.test(m)));
  const patterns = mitreIds.map((mitreId) => ({
    label: 'AttackPattern' as const, id: entityId(rec.tenantId, 'AttackPattern', mitreId), props: { mitreId, name: mitreId, origin: 'ioc-sync' },
  }));

  const entities: GraphPlanNode[] = [...actors, ...malware, ...patterns];
  const edgeProps = { source: 'auto-detected', origin: 'ioc-sync', confidence: confidence01 };
  const edges: GraphPlanEdge[] = [];

  if (primary.label === 'IOC') {
    for (const e of entities) {
      edges.push({ fromId: primary.id, fromLabel: 'IOC', type: 'INDICATES', toId: e.id, toLabel: e.label, props: edgeProps });
    }
  } else {
    for (const a of [...actors, ...malware]) {
      edges.push({ fromId: a.id, fromLabel: a.label, type: 'EXPLOITS', toId: primary.id, toLabel: 'Vulnerability', props: edgeProps });
    }
  }

  for (const a of actors) {
    for (const m of malware) edges.push({ fromId: a.id, fromLabel: 'ThreatActor', type: 'USES', toId: m.id, toLabel: 'Malware', props: edgeProps });
    for (const p of patterns) edges.push({ fromId: a.id, fromLabel: 'ThreatActor', type: 'USES', toId: p.id, toLabel: 'AttackPattern', props: edgeProps });
  }
  for (const m of malware) {
    for (const p of patterns) edges.push({ fromId: m.id, fromLabel: 'Malware', type: 'USES', toId: p.id, toLabel: 'AttackPattern', props: edgeProps });
  }

  const ownedTypes: RelationshipType[] = primary.label === 'IOC' ? ['INDICATES'] : ['EXPLOITS'];

  return { action: 'upsert', primary, entities, edges, ownedEdges: { primaryId: primary.id, types: ownedTypes } };
}
