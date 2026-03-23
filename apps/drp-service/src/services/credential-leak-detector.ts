import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type { CredentialLeak, DRPSeverity, AlertEvidence } from '../schemas/drp.js';

/** Simulated breach database. */
const KNOWN_BREACHES = [
  { name: 'MegaBreach2024', date: '2024-06-15', dataTypes: ['email', 'password_hash', 'phone'], records: 50_000_000 },
  { name: 'SocialLeaks2024', date: '2024-08-22', dataTypes: ['email', 'username', 'ip_address'], records: 12_000_000 },
  { name: 'CloudDumpQ3', date: '2024-09-10', dataTypes: ['email', 'password_plaintext', 'ssn'], records: 3_500_000 },
  { name: 'ForumScrape2024', date: '2024-11-05', dataTypes: ['email', 'username'], records: 8_200_000 },
  { name: 'RetailBreach2025', date: '2025-01-18', dataTypes: ['email', 'password_hash', 'credit_card'], records: 22_000_000 },
  { name: 'HealthData2025', date: '2025-02-28', dataTypes: ['email', 'phone', 'medical_id'], records: 1_800_000 },
  { name: 'GovLeaks2025', date: '2025-03-05', dataTypes: ['email', 'password_hash', 'employee_id'], records: 500_000 },
  { name: 'TechStartup2025', date: '2025-03-12', dataTypes: ['email', 'api_key', 'oauth_token'], records: 250_000 },
  { name: 'FinanceBreach2025', date: '2025-03-15', dataTypes: ['email', 'password_hash', 'account_number'], records: 15_000_000 },
  { name: 'ComboList2025', date: '2025-03-20', dataTypes: ['email', 'password_plaintext'], records: 100_000_000 },
];

/** Credential leak detection with simulated breach database. */
export class CredentialLeakDetector {
  constructor(_store: DRPStore) {
    // Store reserved for future persistence
  }

  /** Check if a domain appears in any known breaches. */
  checkDomain(_tenantId: string, emailDomain: string): CredentialLeak[] {
    const normalizedDomain = emailDomain.toLowerCase();
    const leaks: CredentialLeak[] = [];

    for (const breach of KNOWN_BREACHES) {
      // Simulate whether this domain was in this breach
      if (!this.isDomainInBreach(normalizedDomain, breach.name)) continue;

      const exposedCount = Math.floor(breach.records * (0.001 + Math.random() * 0.01));
      leaks.push({
        id: randomUUID(),
        breachName: breach.name,
        breachDate: breach.date,
        emailDomain: normalizedDomain,
        exposedCount,
        dataTypes: breach.dataTypes,
        severity: this.classifySeverity(breach.dataTypes, exposedCount),
        source: 'simulated-breach-db',
        detectedAt: new Date().toISOString(),
      });
    }

    return leaks;
  }

  /** Check specific emails against breaches. */
  checkEmails(_tenantId: string, emails: string[]): CredentialLeak[] {
    const leaks: CredentialLeak[] = [];
    const domainsChecked = new Set<string>();

    for (const email of emails) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain || domainsChecked.has(domain)) continue;
      domainsChecked.add(domain);

      const domainLeaks = this.checkDomain(_tenantId, domain);
      leaks.push(...domainLeaks);
    }

    return leaks;
  }

  /** Classify severity based on data types and exposure count. */
  classifySeverity(dataTypes: string[], exposedCount: number): DRPSeverity {
    const hasPlaintext = dataTypes.includes('password_plaintext');
    const hasFinancial = dataTypes.includes('credit_card') || dataTypes.includes('account_number');
    const hasSensitive = dataTypes.includes('ssn') || dataTypes.includes('medical_id');

    if (hasPlaintext || hasFinancial || hasSensitive) return 'critical';
    if (dataTypes.includes('password_hash') && exposedCount > 100_000) return 'critical';
    if (dataTypes.includes('password_hash')) return 'high';
    if (exposedCount > 1_000_000) return 'high';
    if (dataTypes.includes('api_key') || dataTypes.includes('oauth_token')) return 'high';
    if (exposedCount > 10_000) return 'medium';
    return 'low';
  }

  /** Convert leaks to alert inputs. */
  leaksToAlertInputs(
    assetId: string,
    leaks: CredentialLeak[],
  ): Array<{
    assetId: string;
    type: 'credential_leak';
    title: string;
    description: string;
    detectedValue: string;
    sourceUrl: string;
    evidence: AlertEvidence[];
    signals: Array<{ signalType: string; rawValue: number; description: string }>;
  }> {
    return leaks.map((leak) => ({
      assetId,
      type: 'credential_leak' as const,
      title: `Credential leak: ${leak.breachName} (${leak.exposedCount.toLocaleString()} accounts)`,
      description: `Domain ${leak.emailDomain} found in breach "${leak.breachName}" (${leak.breachDate}). Data types: ${leak.dataTypes.join(', ')}. ${leak.exposedCount.toLocaleString()} accounts exposed.`,
      detectedValue: `${leak.emailDomain}:${leak.breachName}`,
      sourceUrl: `breach-db://${leak.breachName}`,
      evidence: [{
        id: randomUUID(),
        type: 'breach_record' as const,
        title: `Breach: ${leak.breachName}`,
        data: {
          breachName: leak.breachName,
          breachDate: leak.breachDate,
          dataTypes: leak.dataTypes,
          exposedCount: leak.exposedCount,
        },
        collectedAt: leak.detectedAt,
      }],
      signals: [
        { signalType: 'breach_severity', rawValue: this.severityToScore(leak.severity), description: `Breach severity: ${leak.severity}` },
        { signalType: 'exposed_count', rawValue: Math.min(1, leak.exposedCount / 1_000_000), description: `${leak.exposedCount.toLocaleString()} accounts exposed` },
        { signalType: 'password_included', rawValue: leak.dataTypes.some((d) => d.includes('password')) ? 0.9 : 0.2, description: leak.dataTypes.includes('password_plaintext') ? 'Plaintext passwords included' : 'Password hashes or no passwords' },
        { signalType: 'breach_recency', rawValue: this.recencyScore(leak.breachDate), description: `Breach date: ${leak.breachDate}` },
      ],
    }));
  }

  /** Simulated domain-in-breach check (deterministic-ish for consistency). */
  private isDomainInBreach(domain: string, breachName: string): boolean {
    // Use a simple hash-like check for simulation
    const hash = (domain.length * 7 + breachName.length * 13) % 10;
    return hash < 4; // ~40% match rate
  }

  /** Convert severity to a numeric score. */
  private severityToScore(severity: DRPSeverity): number {
    const map: Record<string, number> = { critical: 0.95, high: 0.75, medium: 0.50, low: 0.25, info: 0.10 };
    return map[severity] ?? 0.5;
  }

  /** Compute recency score (newer = higher). */
  private recencyScore(dateStr: string): number {
    const age = Date.now() - new Date(dateStr).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    if (days < 30) return 0.95;
    if (days < 90) return 0.75;
    if (days < 180) return 0.50;
    if (days < 365) return 0.30;
    return 0.15;
  }
}
