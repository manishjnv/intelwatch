import type { ReportTemplate, TemplateSection } from './template-store.js';
import type { AggregatedData } from './data-aggregator.js';
import type { ReportRecord } from './report-store.js';
import type { ReportFormat } from '../schemas/report.js';
import { AppError } from '@etip/shared-utils';
import { getLogger } from '../logger.js';

export interface RenderedSection {
  title: string;
  type: TemplateSection['type'];
  content: unknown;
  order: number;
}

export interface RenderedReport {
  metadata: {
    id: string;
    title: string;
    type: string;
    format: string;
    dateRange: { from: string; to: string };
    generatedAt: string;
    configVersion: number;
  };
  sections: RenderedSection[];
  riskScore: number;
}

export class TemplateEngine {
  private _logger = getLogger();

  render(report: ReportRecord, template: ReportTemplate, data: AggregatedData, format: ReportFormat): unknown {
    this._logger.info({ reportId: report.id, format, templateId: template.id }, 'Rendering report');

    const sections = template.sections
      .sort((a, b) => a.order - b.order)
      .map((section) => this._renderSection(section, data));

    const rendered: RenderedReport = {
      metadata: {
        id: report.id,
        title: report.title,
        type: report.type,
        format,
        dateRange: report.dateRange,
        generatedAt: new Date().toISOString(),
        configVersion: report.configVersion,
      },
      sections,
      riskScore: data.riskScore,
    };

    switch (format) {
      case 'json':
        return rendered;
      case 'html':
        return this._renderHtml(rendered);
      case 'pdf':
        return this._renderPdfPlaceholder(rendered);
      default:
        return rendered;
    }
  }

  validateFormat(format: ReportFormat): void {
    const supported: ReportFormat[] = ['json', 'html', 'pdf'];
    if (!supported.includes(format)) {
      throw new AppError(400, `Unsupported format: ${format}`, 'UNSUPPORTED_FORMAT');
    }
  }

  private _renderSection(section: TemplateSection, data: AggregatedData): RenderedSection {
    return {
      title: section.title,
      type: section.type,
      content: this._getSectionContent(section, data),
      order: section.order,
    };
  }

  private _getSectionContent(section: TemplateSection, data: AggregatedData): unknown {
    switch (section.dataSource) {
      case 'ioc_stats':
        return {
          total: data.iocStats.total,
          newInPeriod: data.iocStats.newInPeriod,
          bySeverity: data.iocStats.bySeverity,
        };
      case 'ioc_new':
      case 'ioc_filtered':
        return {
          byType: data.iocStats.byType,
          total: data.iocStats.newInPeriod,
        };
      case 'severity_dist':
        return data.iocStats.bySeverity;
      case 'top_threats':
      case 'top_risks':
        return data.iocStats.topThreats;
      case 'ioc_trends':
        return data.iocStats.trends;
      case 'ioc_timeline':
        return data.iocStats.trends;
      case 'feed_health':
        return data.feedStats;
      case 'actors_new':
        return data.actorStats;
      case 'coverage':
        return {
          feedCoverage: data.feedStats.healthScore,
          activeSources: data.feedStats.activeFeeds,
          totalSources: data.feedStats.totalFeeds,
        };
      case 'cost_stats':
        return data.costStats;
      case 'coverage_gaps':
        return {
          inactiveFeeds: data.feedStats.totalFeeds - data.feedStats.activeFeeds,
          lowHealthFeeds: data.feedStats.byStatus['error'] || 0,
        };
      case 'risk_score':
        return { score: data.riskScore, level: this._riskLevel(data.riskScore) };
      case 'threat_landscape':
        return {
          totalIOCs: data.iocStats.total,
          activeActors: data.actorStats.total,
          malwareFamilies: data.malwareStats.total,
          criticalVulns: data.vulnStats.critical,
        };
      case 'key_metrics':
        return {
          riskScore: data.riskScore,
          iocCount: data.iocStats.total,
          feedHealth: data.feedStats.healthScore,
          exploitedVulns: data.vulnStats.exploited,
        };
      case 'auto':
        return this._generateRecommendations(data);
      default:
        return { message: `No data available for source: ${section.dataSource}` };
    }
  }

  private _riskLevel(score: number): string {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'info';
  }

  private _generateRecommendations(data: AggregatedData): string[] {
    const recs: string[] = [];

    if (data.vulnStats.exploited > 0) {
      recs.push(`Patch ${data.vulnStats.exploited} actively exploited vulnerability(ies) immediately`);
    }
    if ((data.iocStats.bySeverity['critical'] || 0) > 10) {
      recs.push('Review and block critical IOCs — elevated count detected');
    }
    if (data.feedStats.healthScore < 80) {
      recs.push('Investigate degraded feed health — some sources may need reconfiguration');
    }
    if (data.actorStats.newInPeriod > 0) {
      recs.push(`${data.actorStats.newInPeriod} new threat actor(s) identified — review attribution`);
    }
    if (data.feedStats.activeFeeds < data.feedStats.totalFeeds) {
      recs.push(`${data.feedStats.totalFeeds - data.feedStats.activeFeeds} feed(s) inactive — check configuration`);
    }
    if (recs.length === 0) {
      recs.push('No critical recommendations — continue monitoring');
    }

    return recs;
  }

  private _renderHtml(report: RenderedReport): string {
    const sectionsHtml = report.sections
      .map(
        (s) =>
          `<section class="report-section">
  <h2>${s.title}</h2>
  <div class="section-content"><pre>${JSON.stringify(s.content, null, 2)}</pre></div>
</section>`,
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.metadata.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 2rem; background: #0a0e1a; color: #e0e0e0; }
    h1 { color: #00e5ff; border-bottom: 2px solid #00e5ff; padding-bottom: 0.5rem; }
    h2 { color: #7c4dff; }
    .metadata { background: #1a1f36; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
    .report-section { background: #141829; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid #7c4dff; }
    .risk-score { font-size: 2rem; font-weight: bold; color: ${report.riskScore >= 60 ? '#ff1744' : '#00e676'}; }
    pre { background: #0d1025; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>${report.metadata.title}</h1>
  <div class="metadata">
    <p><strong>Type:</strong> ${report.metadata.type} | <strong>Period:</strong> ${report.metadata.dateRange.from} — ${report.metadata.dateRange.to}</p>
    <p><strong>Generated:</strong> ${report.metadata.generatedAt} | <strong>Config v${report.metadata.configVersion}</strong></p>
    <p class="risk-score">Risk Score: ${report.riskScore}/100</p>
  </div>
  ${sectionsHtml}
</body>
</html>`;
  }

  private _renderPdfPlaceholder(report: RenderedReport): unknown {
    return {
      format: 'pdf',
      status: 'placeholder',
      message: 'PDF generation requires a rendering engine (e.g., Puppeteer). JSON data included for future implementation.',
      data: report,
    };
  }
}
