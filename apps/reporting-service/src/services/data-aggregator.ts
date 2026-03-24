import type { ReportType } from '../schemas/report.js';
import type { ReportRecord } from './report-store.js';
import { getLogger } from '../logger.js';

export interface AggregatedData {
  iocStats: IocStats;
  feedStats: FeedStats;
  actorStats: ActorStats;
  malwareStats: MalwareStats;
  vulnStats: VulnStats;
  costStats: CostStats;
  riskScore: number;
  generatedAt: string;
}

export interface IocStats {
  total: number;
  newInPeriod: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  topThreats: Array<{ name: string; count: number; severity: string }>;
  trends: Array<{ date: string; count: number }>;
}

export interface FeedStats {
  totalFeeds: number;
  activeFeeds: number;
  healthScore: number;
  byStatus: Record<string, number>;
  recentFetches: number;
}

export interface ActorStats {
  total: number;
  newInPeriod: number;
  topActors: Array<{ name: string; iocCount: number; sophistication: string }>;
}

export interface MalwareStats {
  total: number;
  newInPeriod: number;
  topFamilies: Array<{ name: string; sampleCount: number; type: string }>;
}

export interface VulnStats {
  total: number;
  critical: number;
  exploited: number;
  topVulns: Array<{ cveId: string; cvss: number; exploitedInWild: boolean }>;
}

export interface CostStats {
  totalApiCalls: number;
  totalCost: number;
  costByModel: Record<string, number>;
  avgCostPerReport: number;
}

export class DataAggregator {
  private _logger = getLogger();

  async aggregate(report: ReportRecord): Promise<AggregatedData> {
    const { type, dateRange } = report;
    this._logger.info({ reportId: report.id, type, dateRange }, 'Aggregating data for report');

    const [iocStats, feedStats, actorStats, malwareStats, vulnStats, costStats] = await Promise.all([
      this._collectIocStats(type, dateRange),
      this._collectFeedStats(),
      this._collectActorStats(type, dateRange),
      this._collectMalwareStats(type, dateRange),
      this._collectVulnStats(type, dateRange),
      this._collectCostStats(dateRange),
    ]);

    const riskScore = this._computeRiskScore(iocStats, vulnStats, actorStats);

    return {
      iocStats,
      feedStats,
      actorStats,
      malwareStats,
      vulnStats,
      costStats,
      riskScore,
      generatedAt: new Date().toISOString(),
    };
  }

  private async _collectIocStats(
    type: ReportType,
    dateRange: { from: string; to: string },
  ): Promise<IocStats> {
    const multiplier = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
    return {
      total: 1250 * multiplier,
      newInPeriod: 45 * multiplier,
      bySeverity: {
        critical: 12 * multiplier,
        high: 28 * multiplier,
        medium: 65 * multiplier,
        low: 120 * multiplier,
        info: 25 * multiplier,
      },
      byType: {
        'ipv4-addr': 80 * multiplier,
        'domain-name': 60 * multiplier,
        url: 45 * multiplier,
        'file:hashes.SHA-256': 35 * multiplier,
        'email-addr': 15 * multiplier,
      },
      topThreats: [
        { name: 'APT29 C2 Infrastructure', count: 23, severity: 'critical' },
        { name: 'Emotet Distribution Network', count: 18, severity: 'high' },
        { name: 'Cobalt Strike Beacons', count: 15, severity: 'critical' },
        { name: 'Phishing Campaign #4521', count: 12, severity: 'medium' },
        { name: 'Cryptominer Pool Domains', count: 8, severity: 'low' },
      ],
      trends: this._generateTrends(multiplier, dateRange),
    };
  }

  private async _collectFeedStats(): Promise<FeedStats> {
    return {
      totalFeeds: 24,
      activeFeeds: 20,
      healthScore: 87,
      byStatus: { active: 20, paused: 3, error: 1 },
      recentFetches: 156,
    };
  }

  private async _collectActorStats(
    _type: ReportType,
    _dateRange: { from: string; to: string },
  ): Promise<ActorStats> {
    return {
      total: 145,
      newInPeriod: 3,
      topActors: [
        { name: 'APT29 (Cozy Bear)', iocCount: 89, sophistication: 'nation-state' },
        { name: 'FIN7', iocCount: 67, sophistication: 'organized-crime' },
        { name: 'Lazarus Group', iocCount: 54, sophistication: 'nation-state' },
      ],
    };
  }

  private async _collectMalwareStats(
    _type: ReportType,
    _dateRange: { from: string; to: string },
  ): Promise<MalwareStats> {
    return {
      total: 234,
      newInPeriod: 7,
      topFamilies: [
        { name: 'Emotet', sampleCount: 45, type: 'trojan' },
        { name: 'Cobalt Strike', sampleCount: 38, type: 'rat' },
        { name: 'QakBot', sampleCount: 29, type: 'banking-trojan' },
      ],
    };
  }

  private async _collectVulnStats(
    _type: ReportType,
    _dateRange: { from: string; to: string },
  ): Promise<VulnStats> {
    return {
      total: 892,
      critical: 45,
      exploited: 12,
      topVulns: [
        { cveId: 'CVE-2024-21887', cvss: 9.1, exploitedInWild: true },
        { cveId: 'CVE-2024-1709', cvss: 10.0, exploitedInWild: true },
        { cveId: 'CVE-2024-3400', cvss: 10.0, exploitedInWild: true },
      ],
    };
  }

  private async _collectCostStats(
    _dateRange: { from: string; to: string },
  ): Promise<CostStats> {
    return {
      totalApiCalls: 4520,
      totalCost: 12.45,
      costByModel: { 'haiku-3.5': 3.20, 'sonnet-3.5': 9.25 },
      avgCostPerReport: 0.15,
    };
  }

  private _computeRiskScore(ioc: IocStats, vuln: VulnStats, actor: ActorStats): number {
    const criticalWeight = (ioc.bySeverity['critical'] || 0) * 10;
    const highWeight = (ioc.bySeverity['high'] || 0) * 5;
    const exploitedWeight = vuln.exploited * 15;
    const actorWeight = actor.newInPeriod * 20;

    const raw = criticalWeight + highWeight + exploitedWeight + actorWeight;
    return Math.min(100, Math.round((raw / 500) * 100));
  }

  private _generateTrends(
    multiplier: number,
    _dateRange: { from: string; to: string },
  ): Array<{ date: string; count: number }> {
    const trends: Array<{ date: string; count: number }> = [];
    const days = Math.min(multiplier, 30);
    const now = new Date();

    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      trends.push({
        date: date.toISOString().split('T')[0]!,
        count: Math.floor(30 + Math.random() * 20),
      });
    }

    return trends;
  }
}
