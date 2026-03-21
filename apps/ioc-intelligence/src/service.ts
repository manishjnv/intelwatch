import { createHash } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { IOCRepository } from './repository.js';
import type {
  ListIocsQuery, CreateIocBody, UpdateIocBody,
  SearchIocsBody, ExportIocsBody, BulkOperation,
} from './schemas/ioc.js';
import {
  computeConfidenceTrend, computeActionability, computeRelevanceScore,
  computeSearchRelevance, classifyInfrastructureDensity, inferRelationships,
  EXPORT_PROFILES,
  type ConfidenceTrend, type ActionabilityResult, type InfrastructureDensity,
} from './scoring.js';
import { CampaignDetector, type CampaignCluster } from './campaigns.js';

// ── Severity / TLP ranking for escalation ───────────────────────

const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const TLP_RANK: Record<string, number> = { white: 0, green: 1, amber: 2, red: 3 };

// ── Allowed lifecycle transitions (analyst-initiated) ───────────

const ANALYST_TRANSITIONS: Record<string, string[]> = {
  new: ['active', 'false_positive', 'revoked'],
  active: ['false_positive', 'revoked'],
  aging: ['active', 'false_positive', 'revoked'],
  expired: ['active', 'reactivated', 'false_positive', 'revoked'],
  reactivated: ['active', 'false_positive', 'revoked'],
  false_positive: ['archived'],
  revoked: ['archived'],
  archived: [],
};

/** IOC type definition for internal use. */
interface IocRecord {
  id: string; tenantId: string; feedSourceId: string | null;
  iocType: string; value: string; normalizedValue: string; dedupeHash: string;
  severity: string; tlp: string; confidence: number; lifecycle: string;
  tags: string[]; mitreAttack: string[]; malwareFamilies: string[]; threatActors: string[];
  enrichmentData: unknown; enrichedAt: Date | null;
  firstSeen: Date; lastSeen: Date; expiresAt: Date | null;
}

/** Business logic for IOC Intelligence Service. */
export class IOCService {
  constructor(private readonly repo: IOCRepository) {}

  /** Paginated IOC list with filters. */
  async listIocs(tenantId: string, query: ListIocsQuery): Promise<{ items: unknown[]; total: number }> {
    return this.repo.findMany(tenantId, query);
  }

  /** Get single IOC by ID. Throws 404 if not found. */
  async getIoc(tenantId: string, id: string): Promise<IocRecord> {
    const ioc = await this.repo.findById(tenantId, id) as IocRecord | null;
    if (!ioc) throw new AppError(404, 'IOC not found', 'NOT_FOUND');
    return ioc;
  }

  /** Get IOC detail enriched with computed accuracy signals (A1-A5). */
  async getIocDetail(tenantId: string, id: string): Promise<unknown> {
    const ioc = await this.getIoc(tenantId, id);
    const enrichment = (ioc.enrichmentData ?? {}) as Record<string, unknown>;
    const history = (enrichment.confidenceHistory ?? []) as Array<{ date: string; score: number; source: string }>;

    // A1: Infrastructure density (only for IPs)
    let density: InfrastructureDensity | null = null;
    if (ioc.iocType === 'ip') {
      const parts = ioc.normalizedValue.split('.');
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const count = await this.repo.countBySubnet(tenantId, prefix);
        density = classifyInfrastructureDensity(ioc.iocType, ioc.normalizedValue, count);
      }
    }

    // A2: Confidence trend
    const trend: ConfidenceTrend = computeConfidenceTrend(history);

    // A3: Actionability
    const actionability: ActionabilityResult = computeActionability({
      ...ioc,
      enrichmentData: (ioc.enrichmentData ?? null) as Record<string, unknown> | null,
    });

    // A4: Inferred relationships
    const inferred = inferRelationships(ioc.iocType, ioc.normalizedValue);

    // A5: Relevance score
    const relevanceScore = computeRelevanceScore(ioc.confidence, ioc.lastSeen);

    return {
      ...ioc,
      computed: { confidenceTrend: trend, actionability, relevanceScore, infrastructureDensity: density, inferredRelationships: inferred },
    };
  }

  /** Create a manual IOC (analyst-submitted). */
  async createIoc(tenantId: string, body: CreateIocBody): Promise<unknown> {
    const normalizedValue = this.normalizeValue(body.iocType, body.value);
    const dedupeHash = this.computeDedupeHash(body.iocType, normalizedValue, tenantId);

    const existing = await this.repo.findByDedupeHash(dedupeHash);
    if (existing) {
      throw new AppError(409, 'IOC already exists with this type and value', 'DUPLICATE_IOC', {
        existingId: (existing as IocRecord).id,
      });
    }

    const now = new Date();
    return this.repo.create({
      tenantId,
      iocType: body.iocType,
      value: body.value,
      normalizedValue,
      dedupeHash,
      severity: body.severity,
      tlp: body.tlp,
      confidence: body.confidence,
      lifecycle: 'new',
      tags: body.tags,
      threatActors: body.threatActors,
      malwareFamilies: body.malwareFamilies,
      mitreAttack: body.mitreAttack,
      enrichmentData: {
        source: 'manual',
        analystSubmitted: true,
        feedReliability: 0,
        corroboration: 0,
        aiScore: 0,
        sightingCount: 1,
        sourceFeedIds: [],
      },
      firstSeen: now,
      lastSeen: now,
      expiresAt: body.expiresAt ?? null,
    });
  }

  /** Update IOC metadata. Enforces severity/TLP escalation rules. */
  async updateIoc(tenantId: string, id: string, body: UpdateIocBody): Promise<unknown> {
    const existing = await this.getIoc(tenantId, id);
    const data: Record<string, unknown> = {};

    if (body.severity) {
      const newRank = SEVERITY_RANK[body.severity] ?? 0;
      const curRank = SEVERITY_RANK[existing.severity] ?? 0;
      if (newRank >= curRank) {
        data.severity = body.severity;
      }
      // Silently skip downgrade (never-downgrade ratchet)
    }

    if (body.tlp) {
      const newRank = TLP_RANK[body.tlp] ?? 0;
      const curRank = TLP_RANK[existing.tlp] ?? 0;
      if (newRank >= curRank) {
        data.tlp = body.tlp;
      }
    }

    if (body.lifecycle) {
      this.validateLifecycleTransition(existing.lifecycle, body.lifecycle);
      data.lifecycle = body.lifecycle;
    }

    // B2: Analyst confidence override with audit trail
    if (body.analystOverride) {
      await this.repo.setAnalystOverride(tenantId, id, {
        confidence: body.analystOverride.confidence,
        reason: body.analystOverride.reason,
        analyst: 'current-user', // Will be replaced with actual user from JWT
      });
      data.confidence = body.analystOverride.confidence;
    } else if (body.confidence !== undefined) {
      data.confidence = body.confidence;
    }
    if (body.tags) data.tags = body.tags;
    if (body.threatActors) data.threatActors = body.threatActors;
    if (body.malwareFamilies) data.malwareFamilies = body.malwareFamilies;
    if (body.mitreAttack) data.mitreAttack = body.mitreAttack;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt;

    if (Object.keys(data).length === 0) {
      return existing; // Nothing changed (severity/TLP downgrade silently skipped)
    }

    const result = await this.repo.update(tenantId, id, data);
    if (!result) throw new AppError(404, 'IOC not found', 'NOT_FOUND');

    // B1: FP propagation — when marking false_positive, tag related IOCs for review
    if (body.lifecycle === 'false_positive') {
      const relatedIds = await this.repo.findFPRelated(tenantId, existing);
      if (relatedIds.length > 0) {
        await this.repo.tagForReview(tenantId, relatedIds, 'fp_review_suggested');
      }
    }

    return result;
  }

  /** Soft-delete IOC (set lifecycle to 'revoked'). */
  async deleteIoc(tenantId: string, id: string): Promise<void> {
    const result = await this.repo.softDelete(tenantId, id);
    if (!result) throw new AppError(404, 'IOC not found', 'NOT_FOUND');
  }

  /** C1: Full-text search with multi-dimensional relevance ranking. */
  async searchIocs(tenantId: string, body: SearchIocsBody): Promise<{ items: unknown[]; total: number }> {
    const result = await this.repo.search(tenantId, body);
    const now = new Date();
    const ranked = (result.items as IocRecord[]).map((ioc) => {
      const relevance = computeSearchRelevance({
        ...ioc,
        enrichmentData: (ioc.enrichmentData ?? null) as Record<string, unknown> | null,
      }, body.query, now);
      return { ...ioc, relevance };
    });
    ranked.sort((a, b) => b.relevance.relevanceScore - a.relevance.relevanceScore);
    return { items: ranked, total: result.total };
  }

  /** Pivot: find IOCs related to a given IOC (enhanced with A4 inferred relationships). */
  async pivotIoc(tenantId: string, id: string): Promise<unknown> {
    const ioc = await this.getIoc(tenantId, id);
    const dbPivot = await this.repo.findPivotRelated(tenantId, {
      id: ioc.id,
      feedSourceId: ioc.feedSourceId,
      threatActors: ioc.threatActors,
      malwareFamilies: ioc.malwareFamilies,
      iocType: ioc.iocType,
      normalizedValue: ioc.normalizedValue,
    });

    // A4: Add inferred relationships
    const inferred = inferRelationships(ioc.iocType, ioc.normalizedValue);

    return { ...dbPivot, inferredRelationships: inferred };
  }

  /** Get IOC timeline: confidence history + lifecycle events. */
  async getTimeline(tenantId: string, id: string): Promise<unknown> {
    const ioc = await this.getIoc(tenantId, id);
    const enrichment = (ioc.enrichmentData ?? {}) as Record<string, unknown>;
    const confidenceHistory = (enrichment.confidenceHistory ?? []) as Array<{ date: string; score: number; source: string }>;
    const events: Array<{ timestamp: string; type: string; details: Record<string, unknown> }> = [];

    events.push({ timestamp: ioc.firstSeen.toISOString(), type: 'first_seen', details: { confidence: ioc.confidence, severity: ioc.severity } });

    for (const entry of confidenceHistory) {
      events.push({ timestamp: entry.date, type: 'confidence_change', details: { score: entry.score, source: entry.source } });
    }

    if (ioc.enrichedAt) {
      events.push({ timestamp: ioc.enrichedAt.toISOString(), type: 'enriched', details: { status: enrichment.enrichmentStatus ?? 'unknown' } });
    }

    events.push({ timestamp: ioc.lastSeen.toISOString(), type: 'last_seen', details: { lifecycle: ioc.lifecycle } });
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return { iocId: ioc.id, iocType: ioc.iocType, normalizedValue: ioc.normalizedValue, events };
  }

  /** Export IOCs as CSV or JSON. D1: provenance, D2: profiles. */
  async exportIocs(tenantId: string, body: ExportIocsBody): Promise<{ data: string; contentType: string; filename: string }> {
    // D2: Apply profile defaults if specified
    const effectiveBody = { ...body };
    const profileConfig = body.profile ? EXPORT_PROFILES[body.profile] : undefined;
    if (profileConfig) {
      if (!effectiveBody.minConfidence) effectiveBody.minConfidence = profileConfig.minConfidence;
    }

    const iocs = await this.repo.findForExport(tenantId, effectiveBody) as IocRecord[];

    // D2: Filter by profile's excluded lifecycles
    let filtered = iocs;
    if (body.profile) {
      const profile = EXPORT_PROFILES[body.profile];
      if (profile) {
        const excluded = new Set(profile.excludeLifecycles);
        filtered = iocs.filter((ioc) => !excluded.has(ioc.lifecycle));
      }
    }

    if (body.format === 'csv') {
      const provHeader = body.includeProvenance ? ',feedReliability,corroboration,aiScore,decayFactor' : '';
      const header = `id,type,value,severity,confidence,lifecycle,tlp,tags,threatActors,malwareFamilies,firstSeen,lastSeen${provHeader}`;
      const rows = filtered.map((ioc) => {
        const base = [ioc.id, ioc.iocType, this.escapeCsv(ioc.normalizedValue), ioc.severity, ioc.confidence,
          ioc.lifecycle, ioc.tlp, this.escapeCsv(ioc.tags.join(';')),
          this.escapeCsv(ioc.threatActors.join(';')),
          this.escapeCsv(ioc.malwareFamilies.join(';')),
          ioc.firstSeen.toISOString(), ioc.lastSeen.toISOString(),
        ].join(',');
        if (!body.includeProvenance) return base;
        const e = (ioc.enrichmentData ?? {}) as Record<string, unknown>;
        return `${base},${e.feedReliability ?? ''},${e.corroboration ?? ''},${e.aiScore ?? ''},${e.decayFactor ?? ''}`;
      });
      return { data: [header, ...rows].join('\n'), contentType: 'text/csv', filename: `iocs-export-${Date.now()}.csv` };
    }

    const exportData = filtered.map((ioc) => {
      const base: Record<string, unknown> = {
        id: ioc.id, iocType: ioc.iocType, normalizedValue: ioc.normalizedValue,
        severity: ioc.severity, confidence: ioc.confidence, lifecycle: ioc.lifecycle,
        tlp: ioc.tlp, tags: ioc.tags, threatActors: ioc.threatActors,
        malwareFamilies: ioc.malwareFamilies, mitreAttack: ioc.mitreAttack,
        firstSeen: ioc.firstSeen, lastSeen: ioc.lastSeen, enrichedAt: ioc.enrichedAt,
      };
      // D1: Include confidence provenance breakdown
      if (body.includeProvenance && ioc.enrichmentData) {
        const e = ioc.enrichmentData as Record<string, unknown>;
        base.provenance = {
          feedReliability: e.feedReliability, corroboration: e.corroboration,
          aiScore: e.aiScore, decayFactor: e.decayFactor, decayRate: e.decayRate,
          sightingCount: e.sightingCount, sourceFeedIds: e.sourceFeedIds,
          velocityScore: e.velocityScore, batchPenalty: e.batchPenalty,
        };
      }
      return base;
    });
    return { data: JSON.stringify(exportData, null, 2), contentType: 'application/json', filename: `iocs-export-${Date.now()}.json` };
  }

  /** Aggregated stats for the stats bar. */
  async getStats(tenantId: string): Promise<unknown> {
    return this.repo.getStats(tenantId);
  }

  /** Execute a bulk operation (severity, lifecycle, or tags). */
  async bulkOperation(tenantId: string, body: BulkOperation): Promise<{ affected: number }> {
    let affected: number;

    switch (body.action) {
      case 'set_severity':
        affected = await this.repo.bulkUpdateSeverity(tenantId, body.ids, body.severity!);
        break;
      case 'set_lifecycle':
        affected = await this.repo.bulkUpdateLifecycle(tenantId, body.ids, body.lifecycle!);
        break;
      case 'add_tags':
        affected = await this.repo.bulkAddTags(tenantId, body.ids, body.tags!);
        break;
      case 'remove_tags':
        affected = await this.repo.bulkRemoveTags(tenantId, body.ids, body.tags!);
        break;
      case 'set_tags':
        affected = await this.repo.bulkSetTags(tenantId, body.ids, body.tags!);
        break;
      default:
        throw new AppError(400, `Unknown bulk action: ${body.action}`, 'INVALID_ACTION');
    }

    return { affected };
  }

  /** C3: Auto-detect campaign clusters from IOCs sharing threat actors/malware across feeds. */
  async getCampaigns(tenantId: string, minFeeds: number, limit: number): Promise<CampaignCluster[]> {
    const detector = new CampaignDetector(this.repo['prisma'] as import('@prisma/client').PrismaClient);
    return detector.detectCampaigns(tenantId, minFeeds, limit);
  }

  /** B3: Per-feed accuracy report — exposes auto-tuned reliability to analysts. */
  async getFeedAccuracy(tenantId: string): Promise<unknown> {
    const feedStats = await this.repo.getFeedStats(tenantId);
    return feedStats.map((f) => ({
      feedSourceId: f.feedSourceId,
      totalIocs: f.total,
      avgConfidence: f.avgConfidence,
      falsePositiveCount: f.falsePositiveCount,
      falsePositiveRate: f.total > 0 ? Math.round((f.falsePositiveCount / f.total) * 10000) / 100 : 0,
      revokedCount: f.revokedCount,
    }));
  }

  // ── Private helpers ─────────────────────────────────────────────

  /** Basic value normalization for manual IOC creation. */
  private normalizeValue(iocType: string, value: string): string {
    const trimmed = value.trim();
    switch (iocType) {
      case 'ip': case 'ipv6': case 'domain': case 'fqdn': case 'email':
        return trimmed.toLowerCase().replace(/\.+$/, '');
      case 'url':
        return trimmed.toLowerCase();
      case 'hash_md5': case 'hash_sha1': case 'hash_sha256': case 'hash_sha512':
        return trimmed.toLowerCase();
      case 'cve':
        return trimmed.toUpperCase();
      default:
        return trimmed;
    }
  }

  /** Compute dedupe hash: SHA-256 of type:normalizedValue:tenantId. */
  private computeDedupeHash(iocType: string, normalizedValue: string, tenantId: string): string {
    return createHash('sha256').update(`${iocType}:${normalizedValue}:${tenantId}`).digest('hex');
  }

  /** Escape a value for CSV output. */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /** Validate analyst-initiated lifecycle transition. */
  private validateLifecycleTransition(current: string, target: string): void {
    const allowed = ANALYST_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new AppError(400, `Cannot transition from '${current}' to '${target}'`, 'INVALID_LIFECYCLE_TRANSITION', {
        current, target, allowed: allowed ?? [],
      });
    }
  }
}
