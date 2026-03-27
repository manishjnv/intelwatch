/**
 * @module scripts/check-global-pipeline
 * @description Health check for global feed processing pipeline.
 * Run: npx tsx scripts/check-global-pipeline.ts
 * Exit 0 = healthy, exit 1 = critical
 */

export interface PipelineHealthReport {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'critical';
  feeds: {
    total: number;
    active: number;
    stale: number;
    disabledByFailure: number;
    staleFeedNames: string[];
  };
  articles: {
    created24h: number;
    normalized24h: number;
    pending: number;
    stuck: number;
    throughputRate: number;
  };
  iocs: {
    created24h: number;
    enriched24h: number;
    unenriched: number;
    warninglistFiltered: number;
    avgConfidence: number;
    highConfidenceCount: number;
  };
  subscriptions: {
    total: number;
    uniqueTenants: number;
  };
  alerts: string[];
}

export function determineOverallStatus(report: Omit<PipelineHealthReport, 'status' | 'timestamp' | 'alerts'>): 'healthy' | 'degraded' | 'critical' {
  if (report.feeds.active > 0 && report.feeds.stale > report.feeds.active * 0.5) return 'critical';
  if (report.articles.stuck > 100) return 'critical';
  if (report.feeds.stale > 0 || report.articles.stuck > 0) return 'degraded';
  return 'healthy';
}

export async function checkGlobalPipeline(prisma: any): Promise<PipelineHealthReport> {
  const last24h = new Date(Date.now() - 86_400_000);
  const stuckCutoff = new Date(Date.now() - 3_600_000);

  // 1. Feed catalog status
  const feeds = await prisma.globalFeedCatalog.findMany();
  const activeFeeds = feeds.filter((f: any) => f.enabled);
  const staleFeeds = feeds.filter((f: any) => {
    if (!f.enabled || !f.lastFetchAt) return false;
    // Consider stale if 2x overdue from a reasonable default (1h)
    return Date.now() - new Date(f.lastFetchAt).getTime() > 2 * 3_600_000;
  });
  const disabledByFailure = feeds.filter((f: any) => !f.enabled && f.consecutiveFailures >= 5);

  // 2. Article pipeline
  const [articlesCreated, articlesNormalized, articlesPending, articlesStuck] = await Promise.all([
    prisma.globalArticle.count({ where: { createdAt: { gte: last24h } } }),
    prisma.globalArticle.count({ where: { pipelineStatus: 'normalized', createdAt: { gte: last24h } } }),
    prisma.globalArticle.count({ where: { pipelineStatus: 'pending' } }),
    prisma.globalArticle.count({ where: { pipelineStatus: 'normalizing', createdAt: { lt: stuckCutoff } } }),
  ]);

  // 3. IOC pipeline
  const [iocsCreated, iocsEnriched, iocsUnenriched, warninglistFiltered] = await Promise.all([
    prisma.globalIoc.count({ where: { createdAt: { gte: last24h } } }),
    prisma.globalIoc.count({ where: { enrichedAt: { gte: last24h } } }),
    prisma.globalIoc.count({ where: { enrichedAt: null } }),
    prisma.globalIoc.count({ where: { warninglistMatch: { not: null } } }),
  ]);

  // 4. Confidence distribution
  const avgConfResult = await prisma.globalIoc.aggregate({
    _avg: { confidence: true },
    where: { warninglistMatch: null },
  });
  const highConfidence = await prisma.globalIoc.count({
    where: { confidence: { gte: 70 }, warninglistMatch: null },
  });

  // 5. Subscriptions
  const totalSubscriptions = await prisma.tenantFeedSubscription.count();
  const uniqueTenantGroups = await prisma.tenantFeedSubscription.groupBy({ by: ['tenantId'] });

  // 6. Build report
  const partial = {
    feeds: {
      total: feeds.length,
      active: activeFeeds.length,
      stale: staleFeeds.length,
      disabledByFailure: disabledByFailure.length,
      staleFeedNames: staleFeeds.map((f: any) => f.name),
    },
    articles: {
      created24h: articlesCreated,
      normalized24h: articlesNormalized,
      pending: articlesPending,
      stuck: articlesStuck,
      throughputRate: articlesCreated > 0 ? articlesNormalized / articlesCreated : 0,
    },
    iocs: {
      created24h: iocsCreated,
      enriched24h: iocsEnriched,
      unenriched: iocsUnenriched,
      warninglistFiltered,
      avgConfidence: avgConfResult._avg?.confidence ?? 0,
      highConfidenceCount: highConfidence,
    },
    subscriptions: {
      total: totalSubscriptions,
      uniqueTenants: uniqueTenantGroups.length,
    },
  };

  const status = determineOverallStatus(partial);
  const alerts: string[] = [];
  if (staleFeeds.length > 0) alerts.push(`${staleFeeds.length} stale feed(s)`);
  if (articlesStuck > 0) alerts.push(`${articlesStuck} stuck article(s)`);
  if (disabledByFailure.length > 0) alerts.push(`${disabledByFailure.length} feed(s) disabled by failure`);

  return { timestamp: new Date().toISOString(), status, ...partial, alerts };
}
