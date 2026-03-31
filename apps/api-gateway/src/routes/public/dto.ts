/**
 * @module routes/public/dto
 * @description Field projection/sanitization for public API responses.
 * Strips internal fields (tenantId, enrichmentData, cost tracking, etc.)
 * and converts dates to ISO strings.
 */
import type { PublicIocDto, PublicFeedDto, PublicArticleDto } from '@etip/shared-types';

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

/** Project a raw IOC row to the public DTO. */
export function toPublicIoc(raw: RawIoc): PublicIocDto {
  return {
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
