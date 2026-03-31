/**
 * @module routes/public/dto
 * @description Field projection/sanitization for public API responses.
 * Strips internal fields (tenantId, enrichmentData, cost tracking, etc.)
 * and converts dates to ISO strings.
 */
import type { PublicIocDto, PublicFeedDto, PublicArticleDto, PublicIocEnrichmentDto } from '@etip/shared-types';

/** Type for raw Prisma IOC row */
interface RawIoc {
  id: string;
  iocType: string;
  value: string;
  severity: string;
  tlp: string;
  confidence: number;
  lifecycle: string;
  tags: string[];
  mitreAttack: string[];
  malwareFamilies: string[];
  threatActors: string[];
  firstSeen: Date;
  lastSeen: Date;
  expiresAt: Date | null;
  createdAt: Date;
  [key: string]: unknown;
}

/** Project a raw IOC row to the public DTO, optionally including enrichment metadata. */
export function toPublicIoc(raw: RawIoc, includeEnrichment = false): PublicIocDto {
  const base: PublicIocDto = {
    id: raw.id,
    type: raw.iocType,
    value: raw.value,
    severity: raw.severity,
    tlp: raw.tlp,
    confidence: raw.confidence,
    lifecycle: raw.lifecycle,
    tags: raw.tags,
    mitreAttack: raw.mitreAttack,
    malwareFamilies: raw.malwareFamilies,
    threatActors: raw.threatActors,
    firstSeen: raw.firstSeen.toISOString(),
    lastSeen: raw.lastSeen.toISOString(),
    expiresAt: raw.expiresAt?.toISOString() ?? null,
    createdAt: raw.createdAt.toISOString(),
  };
  if (includeEnrichment && raw.enrichmentData) {
    const enrichment = mapEnrichmentData(raw.enrichmentData);
    if (enrichment) return { ...base, enrichment } as PublicIocDto;
  }
  return base;
}

/**
 * Map raw enrichmentData JSON blob to a safe public subset.
 * Strips cost data, raw provider blobs, and token counts.
 */
export function mapEnrichmentData(raw: unknown): PublicIocEnrichmentDto | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;

  const sources: string[] = [];
  if (data.vtResult) sources.push('virustotal');
  if (data.abuseipdbResult) sources.push('abuseipdb');
  if (data.haikuResult) sources.push('ai-triage');

  const haiku = data.haikuResult as Record<string, unknown> | null | undefined;
  const geo = data.geolocation as { countryCode?: string; isp?: string; isTor?: boolean } | null | undefined;

  return {
    status: (data.enrichmentStatus as PublicIocEnrichmentDto['status']) ?? 'pending',
    externalRiskScore: typeof data.externalRiskScore === 'number' ? data.externalRiskScore : null,
    sources,
    geolocation: geo
      ? { countryCode: geo.countryCode ?? '', isp: geo.isp ?? '', isTor: geo.isTor ?? false }
      : null,
    aiSummary: (haiku?.reasoning as string) ?? null,
  };
}

/** Type for raw Prisma FeedSource row */
interface RawFeed {
  id: string;
  name: string;
  description: string | null;
  feedType: string;
  status: string;
  lastFetchAt: Date | null;
  feedReliability: number;
  totalItemsIngested: number;
  [key: string]: unknown;
}

/** Project a raw feed row to the public DTO. */
export function toPublicFeed(raw: RawFeed): PublicFeedDto {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    feedType: raw.feedType,
    status: raw.status,
    lastFetchAt: raw.lastFetchAt?.toISOString() ?? null,
    feedReliability: raw.feedReliability,
    totalItemsIngested: raw.totalItemsIngested,
  };
}

/** Type for raw Prisma Article row */
interface RawArticle {
  id: string;
  title: string;
  url: string | null;
  publishedAt: Date | null;
  author: string | null;
  isCtiRelevant: boolean;
  articleType: string;
  iocsExtracted: number;
  [key: string]: unknown;
}

/** Project a raw article row to the public DTO. */
export function toPublicArticle(raw: RawArticle): PublicArticleDto {
  return {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    publishedAt: raw.publishedAt?.toISOString() ?? null,
    author: raw.author,
    isCtiRelevant: raw.isCtiRelevant,
    articleType: raw.articleType,
    iocsExtracted: raw.iocsExtracted,
  };
}

/**
 * Prisma select clause for IOC queries — only fetch public fields.
 * Avoids fetching enrichmentData (potentially large JSON blob).
 */
export const IOC_PUBLIC_SELECT = {
  id: true,
  iocType: true,
  value: true,
  severity: true,
  tlp: true,
  confidence: true,
  lifecycle: true,
  tags: true,
  mitreAttack: true,
  malwareFamilies: true,
  threatActors: true,
  firstSeen: true,
  lastSeen: true,
  expiresAt: true,
  createdAt: true,
} as const;

/** Extended select clause including enrichmentData for ?include=enrichment. */
export const IOC_PUBLIC_SELECT_WITH_ENRICHMENT = {
  ...IOC_PUBLIC_SELECT,
  enrichmentData: true,
} as const;

/** Prisma select clause for feed queries — only public fields. */
export const FEED_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  feedType: true,
  status: true,
  lastFetchAt: true,
  feedReliability: true,
  totalItemsIngested: true,
} as const;

/** Prisma select clause for article queries — only public fields. */
export const ARTICLE_PUBLIC_SELECT = {
  id: true,
  title: true,
  url: true,
  publishedAt: true,
  author: true,
  isCtiRelevant: true,
  articleType: true,
  iocsExtracted: true,
} as const;
