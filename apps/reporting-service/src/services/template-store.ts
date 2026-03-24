import type { ReportType } from '../schemas/report.js';

export interface ReportTemplate {
  id: string;
  name: string;
  reportType: ReportType;
  description: string;
  sections: TemplateSection[];
}

export interface TemplateSection {
  id: string;
  title: string;
  type: 'summary' | 'table' | 'chart_data' | 'recommendations' | 'metrics' | 'timeline';
  dataSource: string;
  order: number;
}

const DEFAULT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl-daily',
    name: 'Daily Threat Intelligence',
    reportType: 'daily',
    description: 'Last 24h IOC summary, top threats, new actors and malware',
    sections: [
      { id: 'ds-1', title: 'Executive Summary', type: 'summary', dataSource: 'ioc_stats', order: 1 },
      { id: 'ds-2', title: 'New IOCs', type: 'table', dataSource: 'ioc_new', order: 2 },
      { id: 'ds-3', title: 'Severity Distribution', type: 'chart_data', dataSource: 'severity_dist', order: 3 },
      { id: 'ds-4', title: 'Top Threats', type: 'table', dataSource: 'top_threats', order: 4 },
      { id: 'ds-5', title: 'Recommendations', type: 'recommendations', dataSource: 'auto', order: 5 },
    ],
  },
  {
    id: 'tpl-weekly',
    name: 'Weekly Threat Summary',
    reportType: 'weekly',
    description: '7-day trends, severity distribution, feed health',
    sections: [
      { id: 'ws-1', title: 'Week Overview', type: 'summary', dataSource: 'ioc_stats', order: 1 },
      { id: 'ws-2', title: 'Trend Analysis', type: 'chart_data', dataSource: 'ioc_trends', order: 2 },
      { id: 'ws-3', title: 'Severity Breakdown', type: 'chart_data', dataSource: 'severity_dist', order: 3 },
      { id: 'ws-4', title: 'Feed Health', type: 'table', dataSource: 'feed_health', order: 4 },
      { id: 'ws-5', title: 'New Threat Actors', type: 'table', dataSource: 'actors_new', order: 5 },
      { id: 'ws-6', title: 'Recommendations', type: 'recommendations', dataSource: 'auto', order: 6 },
    ],
  },
  {
    id: 'tpl-monthly',
    name: 'Monthly Executive Report',
    reportType: 'monthly',
    description: '30-day executive summary, cost analysis, coverage gaps',
    sections: [
      { id: 'ms-1', title: 'Executive Summary', type: 'summary', dataSource: 'ioc_stats', order: 1 },
      { id: 'ms-2', title: 'Monthly Trends', type: 'chart_data', dataSource: 'ioc_trends', order: 2 },
      { id: 'ms-3', title: 'Coverage Analysis', type: 'metrics', dataSource: 'coverage', order: 3 },
      { id: 'ms-4', title: 'Cost Analysis', type: 'metrics', dataSource: 'cost_stats', order: 4 },
      { id: 'ms-5', title: 'Coverage Gaps', type: 'table', dataSource: 'coverage_gaps', order: 5 },
      { id: 'ms-6', title: 'Recommendations', type: 'recommendations', dataSource: 'auto', order: 6 },
    ],
  },
  {
    id: 'tpl-custom',
    name: 'Custom Report',
    reportType: 'custom',
    description: 'User-defined date range with selected filters',
    sections: [
      { id: 'cs-1', title: 'Summary', type: 'summary', dataSource: 'ioc_stats', order: 1 },
      { id: 'cs-2', title: 'IOC Details', type: 'table', dataSource: 'ioc_filtered', order: 2 },
      { id: 'cs-3', title: 'Severity Distribution', type: 'chart_data', dataSource: 'severity_dist', order: 3 },
      { id: 'cs-4', title: 'Timeline', type: 'timeline', dataSource: 'ioc_timeline', order: 4 },
    ],
  },
  {
    id: 'tpl-executive',
    name: 'Executive Risk Posture',
    reportType: 'executive',
    description: 'High-level risk posture for CISO audience',
    sections: [
      { id: 'es-1', title: 'Risk Score', type: 'metrics', dataSource: 'risk_score', order: 1 },
      { id: 'es-2', title: 'Threat Landscape', type: 'summary', dataSource: 'threat_landscape', order: 2 },
      { id: 'es-3', title: 'Key Metrics', type: 'metrics', dataSource: 'key_metrics', order: 3 },
      { id: 'es-4', title: 'Top Risks', type: 'table', dataSource: 'top_risks', order: 4 },
      { id: 'es-5', title: 'Strategic Recommendations', type: 'recommendations', dataSource: 'auto', order: 5 },
    ],
  },
];

export class TemplateStore {
  private _templates: Map<string, ReportTemplate> = new Map();

  constructor() {
    for (const tpl of DEFAULT_TEMPLATES) {
      this._templates.set(tpl.id, tpl);
    }
  }

  list(): ReportTemplate[] {
    return Array.from(this._templates.values());
  }

  getById(id: string): ReportTemplate | undefined {
    return this._templates.get(id);
  }

  getByType(type: ReportType): ReportTemplate | undefined {
    return Array.from(this._templates.values()).find((t) => t.reportType === type);
  }
}
