import { randomUUID } from 'node:crypto';

/** Domain enrichment data from RDAP/WHOIS/DNS/SSL probes. */
export interface DomainEnrichment {
  domain: string;
  whois: WhoisData | null;
  dns: DnsData | null;
  ssl: SslData | null;
  enrichedAt: string;
}

export interface WhoisData {
  registrar: string | null;
  registrantOrg: string | null;
  registrationDate: string | null;
  expirationDate: string | null;
  nameservers: string[];
  registrationTermYears: number | null;
}

export interface DnsData {
  aRecords: string[];
  mxRecords: string[];
  nsRecords: string[];
  hasWebsite: boolean;
  hasMail: boolean;
}

export interface SslData {
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  isLetsEncrypt: boolean;
  daysSinceIssued: number | null;
}

export interface DomainEnricherConfig {
  enabled: boolean;
}

/**
 * Domain enrichment adapter — simulated in dev, pluggable for production.
 * Returns WHOIS, DNS, and SSL data for risk scoring.
 */
export class DomainEnricher {
  private readonly config: DomainEnricherConfig;

  constructor(config: DomainEnricherConfig) {
    this.config = config;
  }

  /** Enrich a domain with WHOIS, DNS, and SSL data. */
  async enrich(domain: string): Promise<DomainEnrichment> {
    if (!this.config.enabled) {
      return { domain, whois: null, dns: null, ssl: null, enrichedAt: new Date().toISOString() };
    }

    const [whois, dns, ssl] = await Promise.all([
      this.lookupWhois(domain),
      this.probeDns(domain),
      this.analyzeSsl(domain),
    ]);

    return { domain, whois, dns, ssl, enrichedAt: new Date().toISOString() };
  }

  /** RDAP/WHOIS lookup — simulated in dev. */
  private async lookupWhois(domain: string): Promise<WhoisData> {
    // Simulated — production would use RDAP API
    const registrars = ['GoDaddy', 'Namecheap', 'Cloudflare', 'Tucows', 'PDR Ltd', 'NameSilo'];
    const isRecent = Math.random() < 0.4;
    const daysAgo = isRecent ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 730);
    const regDate = new Date(Date.now() - daysAgo * 86400000);
    const termYears = Math.random() < 0.85 ? 1 : Math.ceil(Math.random() * 5);
    const expDate = new Date(regDate.getTime() + termYears * 365.25 * 86400000);

    return {
      registrar: registrars[Math.floor(Math.random() * registrars.length)] ?? null,
      registrantOrg: Math.random() < 0.7 ? null : `Org-${randomUUID().slice(0, 6)}`,
      registrationDate: regDate.toISOString(),
      expirationDate: expDate.toISOString(),
      nameservers: [`ns1.${domain}`, `ns2.${domain}`],
      registrationTermYears: termYears,
    };
  }

  /** DNS resolution probe — simulated in dev. */
  private async probeDns(domain: string): Promise<DnsData> {
    // Simulated — production would use dns.resolve()
    const hasA = Math.random() < 0.7;
    const hasMx = Math.random() < 0.3;
    return {
      aRecords: hasA ? [`${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`] : [],
      mxRecords: hasMx ? [`mail.${domain}`] : [],
      nsRecords: [`ns1.${domain}`, `ns2.${domain}`],
      hasWebsite: hasA,
      hasMail: hasMx,
    };
  }

  /** SSL certificate analysis — simulated in dev. */
  private async analyzeSsl(_domain: string): Promise<SslData> {
    // Simulated — production would probe TLS handshake
    const hasSsl = Math.random() < 0.6;
    if (!hasSsl) return { issuer: null, validFrom: null, validTo: null, isLetsEncrypt: false, daysSinceIssued: null };

    const isLE = Math.random() < 0.7;
    const daysAgo = Math.floor(Math.random() * 90);
    const validFrom = new Date(Date.now() - daysAgo * 86400000);
    const validTo = new Date(validFrom.getTime() + (isLE ? 90 : 365) * 86400000);

    return {
      issuer: isLE ? "Let's Encrypt" : 'DigiCert',
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      isLetsEncrypt: isLE,
      daysSinceIssued: daysAgo,
    };
  }
}
