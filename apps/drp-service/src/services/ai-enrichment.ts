import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert } from '../schemas/drp.js';
import type { AIEnrichmentResult, TakedownContact } from '../schemas/p1-p2.js';
import { AppError } from '@etip/shared-utils';

export interface AIEnrichmentConfig {
  enabled: boolean;
  maxBudgetPerDay: number;
  costPerCall: number;
}

/**
 * #7 AI alert enrichment — simulated Haiku call for hosting provider,
 * takedown contacts, and recommended actions. Budget-gated.
 */
export class AIAlertEnricher {
  private readonly store: DRPStore;
  private readonly config: AIEnrichmentConfig;
  private dailyCalls = 0;
  private dailyResetAt: number = Date.now();

  constructor(store: DRPStore, config: AIEnrichmentConfig) {
    this.store = store;
    this.config = config;
  }

  /** Enrich an alert with AI-derived hosting, contacts, and actions. */
  enrich(tenantId: string, alert: DRPAlert, forceRefresh: boolean): AIEnrichmentResult {
    if (!this.config.enabled) {
      throw new AppError(503, 'AI enrichment is disabled', 'AI_DISABLED');
    }

    // Check cache
    if (!forceRefresh) {
      const cached = this.store.getAIEnrichment(tenantId, alert.id);
      if (cached) return { ...cached, cached: true };
    }

    // Budget gate
    this.resetDailyIfNeeded();
    const dailyCost = this.dailyCalls * this.config.costPerCall;
    if (dailyCost >= this.config.maxBudgetPerDay) {
      throw new AppError(429, 'AI enrichment daily budget exceeded', 'AI_BUDGET_EXCEEDED');
    }

    // Simulated AI enrichment (deterministic based on alert data)
    const result = this.simulateEnrichment(alert);
    this.dailyCalls++;

    // Cache result
    this.store.setAIEnrichment(tenantId, alert.id, result);
    return result;
  }

  /** Get current AI budget usage. */
  getBudgetStatus(): { dailyCalls: number; dailyCost: number; maxBudget: number; remaining: number } {
    this.resetDailyIfNeeded();
    const dailyCost = this.dailyCalls * this.config.costPerCall;
    return {
      dailyCalls: this.dailyCalls,
      dailyCost,
      maxBudget: this.config.maxBudgetPerDay,
      remaining: Math.max(0, this.config.maxBudgetPerDay - dailyCost),
    };
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    if (now - this.dailyResetAt > 86400000) {
      this.dailyCalls = 0;
      this.dailyResetAt = now;
    }
  }

  /** Simulate AI enrichment based on alert type and data. */
  private simulateEnrichment(alert: DRPAlert): AIEnrichmentResult {
    const contacts = this.deriveContacts(alert);
    const actions = this.deriveActions(alert);
    const hosting = this.deriveHostingProvider(alert);
    const registrar = this.deriveRegistrar(alert);

    return {
      alertId: alert.id,
      hostingProvider: hosting,
      registrar,
      takedownContacts: contacts,
      recommendedActions: actions,
      riskAssessment: this.generateRiskAssessment(alert),
      enrichedAt: new Date().toISOString(),
      model: 'claude-haiku-4-5-20251001',
      cached: false,
    };
  }

  private deriveContacts(alert: DRPAlert): TakedownContact[] {
    const contacts: TakedownContact[] = [];

    if (alert.type === 'typosquatting' || alert.type === 'exposed_service') {
      contacts.push({
        type: 'registrar',
        name: 'Domain Registrar Abuse',
        email: 'abuse@registrar.example',
        url: null,
        priority: 1,
      });
      contacts.push({
        type: 'hosting',
        name: 'Hosting Provider Abuse',
        email: 'abuse@hosting.example',
        url: null,
        priority: 2,
      });
    }
    if (alert.type === 'social_impersonation') {
      contacts.push({
        type: 'social_platform',
        name: 'Platform Trust & Safety',
        email: null,
        url: 'https://platform.example/report',
        priority: 1,
      });
    }
    if (alert.type === 'rogue_app') {
      contacts.push({
        type: 'app_store',
        name: 'App Store Review Team',
        email: 'app-review@store.example',
        url: null,
        priority: 1,
      });
    }

    return contacts;
  }

  private deriveActions(alert: DRPAlert): string[] {
    const actions: string[] = [];
    const sev = alert.severity;

    if (sev === 'critical' || sev === 'high') {
      actions.push('Initiate takedown request immediately');
      actions.push('Block domain/IP at firewall level');
    }
    if (alert.type === 'credential_leak') {
      actions.push('Force password reset for affected accounts');
      actions.push('Enable MFA for compromised users');
    }
    if (alert.type === 'typosquatting') {
      actions.push('Monitor domain for phishing page deployment');
      actions.push('Register defensive domain variants');
    }
    if (alert.type === 'dark_web_mention') {
      actions.push('Assess data exposure scope');
      actions.push('Engage incident response team');
    }
    actions.push('Document incident for compliance records');
    return actions;
  }

  private deriveHostingProvider(alert: DRPAlert): string | null {
    // Simulated — extract from evidence if available
    for (const e of alert.evidence) {
      if (e.data['hostingProvider']) return String(e.data['hostingProvider']);
    }
    const providers = ['Cloudflare', 'AWS', 'DigitalOcean', 'OVH', 'Hetzner'];
    const idx = Math.abs(hashCode(alert.detectedValue)) % providers.length;
    return providers[idx] ?? null;
  }

  private deriveRegistrar(alert: DRPAlert): string | null {
    if (alert.type !== 'typosquatting') return null;
    const registrars = ['GoDaddy', 'Namecheap', 'Tucows', 'Gandi', 'Enom'];
    const idx = Math.abs(hashCode(alert.id)) % registrars.length;
    return registrars[idx] ?? null;
  }

  private generateRiskAssessment(alert: DRPAlert): string {
    const conf = (alert.confidence * 100).toFixed(0);
    return `${alert.severity.toUpperCase()} severity ${alert.type.replace(/_/g, ' ')} alert with ${conf}% confidence. ` +
      `Detected value: ${alert.detectedValue}. ${alert.evidence.length} evidence items collected. ` +
      `Recommended priority: ${alert.severity === 'critical' ? 'immediate' : alert.severity === 'high' ? 'urgent' : 'standard'}.`;
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
