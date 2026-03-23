import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert } from '../schemas/drp.js';
import type { TakedownRequest } from '../schemas/p1-p2.js';
import { AppError } from '@etip/shared-utils';

const TEMPLATES: Record<string, Record<string, { subject: string; body: string }>> = {
  en: {
    registrar: {
      subject: 'Takedown Request — Phishing/Typosquatting Domain',
      body: `Dear Abuse Team,

We are writing to report a domain that infringes on our brand and is being used for malicious purposes.

**Infringing Domain:** {{detectedValue}}
**Our Brand:** {{assetId}}
**Alert Type:** {{alertType}}
**Severity:** {{severity}}
**Confidence:** {{confidence}}%

**Evidence Summary:**
{{evidenceSummary}}

We request immediate suspension of this domain as it poses a risk to our customers and brand reputation.

Please confirm receipt of this request and provide an estimated timeline for action.

Regards,
{{tenantId}} Security Team`,
    },
    hosting: {
      subject: 'Abuse Report — Malicious Content Hosted',
      body: `Dear Abuse Team,

We are reporting malicious content hosted on your infrastructure that impersonates our organization.

**Target:** {{detectedValue}}
**Our Brand:** {{assetId}}
**Alert Type:** {{alertType}}
**Severity:** {{severity}}

**Evidence Summary:**
{{evidenceSummary}}

We request removal of this content in accordance with your acceptable use policy.

Regards,
{{tenantId}} Security Team`,
    },
    social: {
      subject: 'Impersonation Report — Fake Profile',
      body: `Dear Trust & Safety Team,

We are reporting a profile that impersonates our brand/organization.

**Impersonating Profile:** {{detectedValue}}
**Our Official Brand:** {{assetId}}
**Platform Evidence:**
{{evidenceSummary}}

This profile is misleading our customers. We request prompt review and removal.

Regards,
{{tenantId}} Security Team`,
    },
    app_store: {
      subject: 'Rogue App Report — Unauthorized Use of Brand',
      body: `Dear App Review Team,

We are reporting an unauthorized application using our brand name/assets.

**App Identifier:** {{detectedValue}}
**Our Brand:** {{assetId}}

**Evidence:**
{{evidenceSummary}}

This app is not affiliated with our organization and may pose security risks to users.

Regards,
{{tenantId}} Security Team`,
    },
  },
};

/** #11 Takedown request generation — templated docs for registrar/hosting/social platforms. */
export class TakedownGenerator {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Generate a takedown request document for an alert. */
  generate(
    tenantId: string,
    alert: DRPAlert,
    platform: string,
    contactOverride?: { email?: string; name?: string },
    includeEvidence: boolean = true,
    language: string = 'en',
  ): TakedownRequest {
    const lang = TEMPLATES[language] ?? TEMPLATES['en']!;
    const template = lang[platform] ?? lang['registrar']!;

    const evidenceSummary = includeEvidence
      ? alert.evidence.map((e, i) => `${i + 1}. [${e.type}] ${e.title} (${e.collectedAt})`).join('\n')
      : '(Evidence available upon request)';

    const body = template.body
      .replace('{{detectedValue}}', alert.detectedValue)
      .replace('{{assetId}}', alert.assetId)
      .replace('{{alertType}}', alert.type.replace(/_/g, ' '))
      .replace('{{severity}}', alert.severity.toUpperCase())
      .replace('{{confidence}}', (alert.confidence * 100).toFixed(0))
      .replace(/\{\{evidenceSummary\}\}/g, evidenceSummary)
      .replace(/\{\{tenantId\}\}/g, tenantId);

    const contact = this.resolveContact(platform, contactOverride);

    const takedown: TakedownRequest = {
      id: randomUUID(),
      alertId: alert.id,
      tenantId,
      platform,
      status: 'draft',
      subject: template.subject,
      body,
      contactName: contact.name,
      contactEmail: contact.email,
      evidence: alert.evidence.map((e) => ({ type: e.type, description: e.title })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.store.setTakedown(tenantId, takedown);
    return takedown;
  }

  /** List takedown requests for an alert. */
  getByAlert(tenantId: string, alertId: string): TakedownRequest[] {
    return this.store.getTakedownsByAlert(tenantId, alertId);
  }

  /** Update takedown status. */
  updateStatus(tenantId: string, takedownId: string, status: TakedownRequest['status']): TakedownRequest {
    const map = this.store.getTenantTakedowns(tenantId);
    const takedown = map.get(takedownId);
    if (!takedown) throw new AppError(404, 'Takedown request not found', 'TAKEDOWN_NOT_FOUND');
    takedown.status = status;
    takedown.updatedAt = new Date().toISOString();
    this.store.setTakedown(tenantId, takedown);
    return takedown;
  }

  private resolveContact(
    platform: string,
    override?: { email?: string; name?: string },
  ): { name: string; email: string } {
    if (override?.email) {
      return { name: override.name ?? 'Abuse Team', email: override.email };
    }
    const defaults: Record<string, { name: string; email: string }> = {
      registrar: { name: 'Registrar Abuse', email: 'abuse@registrar.example' },
      hosting: { name: 'Hosting Abuse', email: 'abuse@hosting.example' },
      social: { name: 'Trust & Safety', email: 'trust@platform.example' },
      app_store: { name: 'App Review', email: 'review@store.example' },
    };
    return defaults[platform] ?? defaults['registrar']!;
  }
}
