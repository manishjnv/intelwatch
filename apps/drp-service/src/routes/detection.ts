import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { AssetManager } from '../services/asset-manager.js';
import type { AlertManager } from '../services/alert-manager.js';
import type { TyposquatDetector } from '../services/typosquat-detector.js';
import type { DarkWebMonitor } from '../services/dark-web-monitor.js';
import type { CredentialLeakDetector } from '../services/credential-leak-detector.js';
import type { AttackSurfaceScanner } from '../services/attack-surface-scanner.js';
import type { DRPGraphIntegration } from '../services/graph-integration.js';
import type { CertStreamMonitor } from '../services/certstream-monitor.js';
import type { DRPStore } from '../schemas/store.js';
import type { ScanResult } from '../schemas/drp.js';
import {
  TyposquatScanSchema,
  DarkWebScanSchema,
  CredentialCheckSchema,
  SurfaceScanSchema,
} from '../schemas/drp.js';

export interface DetectionRouteDeps {
  assetManager: AssetManager;
  alertManager: AlertManager;
  typosquatDetector: TyposquatDetector;
  darkWebMonitor: DarkWebMonitor;
  credentialLeakDetector: CredentialLeakDetector;
  attackSurfaceScanner: AttackSurfaceScanner;
  graphIntegration: DRPGraphIntegration;
  certStreamMonitor: CertStreamMonitor;
  store: DRPStore;
}

/** Detection routes — typosquat, darkweb, credentials, surface. */
export function detectionRoutes(deps: DetectionRouteDeps) {
  const {
    alertManager, typosquatDetector,
    darkWebMonitor, credentialLeakDetector, attackSurfaceScanner,
    graphIntegration, certStreamMonitor, store,
  } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {

    // POST /detect/typosquat — Run typosquatting scan
    app.post(
      '/detect/typosquat',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = TyposquatScanSchema.parse(req.body);
        const startTime = Date.now();

        const candidates = typosquatDetector.scan(input.domain, input.methods);

        // Create alerts for high-risk candidates
        let alertsCreated = 0;
        const riskyCandiates = candidates.filter((c) => c.riskScore >= 0.4 && c.isRegistered);
        for (const candidate of riskyCandiates) {
          const alert = alertManager.create(user.tenantId, {
            assetId: input.domain,
            type: 'typosquatting',
            title: `Typosquat detected: ${candidate.domain} (${candidate.method})`,
            description: `Domain ${candidate.domain} detected via ${candidate.method} method. Similarity: ${(candidate.similarity * 100).toFixed(1)}%. Registered: ${candidate.isRegistered}. Hosting: ${candidate.hostingProvider ?? 'unknown'}.`,
            detectedValue: candidate.domain,
            evidence: [{
              id: randomUUID(),
              type: 'dns_record',
              title: `Typosquat: ${candidate.domain}`,
              data: { method: candidate.method, similarity: candidate.similarity, editDistance: candidate.editDistance, registrationDate: candidate.registrationDate, hostingProvider: candidate.hostingProvider },
              collectedAt: new Date().toISOString(),
            }],
            signals: [
              { signalType: `${candidate.method}_similarity`, rawValue: candidate.similarity, description: `${candidate.method} match: ${candidate.domain}` },
              { signalType: 'domain_registered', rawValue: candidate.isRegistered ? 0.9 : 0.1, description: candidate.isRegistered ? 'Domain is registered' : 'Domain not registered' },
              ...(candidate.registrationDate ? [{ signalType: 'recent_registration', rawValue: recencyScore(candidate.registrationDate), description: `Registered: ${candidate.registrationDate.split('T')[0]}` }] : []),
            ],
          });
          if (alert) alertsCreated++;
        }

        const scan = createScanResult(user.tenantId, input.domain, 'typosquatting', candidates.length, alertsCreated, startTime);
        store.setScan(user.tenantId, scan);

        return reply.send({
          data: {
            scanId: scan.id,
            domain: input.domain,
            candidatesFound: candidates.length,
            registeredCount: candidates.filter((c) => c.isRegistered).length,
            alertsCreated,
            topCandidates: candidates.slice(0, 10),
            durationMs: scan.durationMs,
          },
        });
      },
    );

    // POST /detect/darkweb — Run dark web scan
    app.post(
      '/detect/darkweb',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = DarkWebScanSchema.parse(req.body);
        const startTime = Date.now();

        const mentions = darkWebMonitor.scan(user.tenantId, input.keywords, input.sources);
        const alertInputs = darkWebMonitor.mentionsToAlertInputs(input.keywords[0] ?? '', mentions);

        let alertsCreated = 0;
        for (const alertInput of alertInputs) {
          const alert = alertManager.create(user.tenantId, alertInput);
          if (alert) alertsCreated++;
        }

        const scan = createScanResult(user.tenantId, input.keywords.join(','), 'dark_web_mention', mentions.length, alertsCreated, startTime);
        store.setScan(user.tenantId, scan);

        return reply.send({
          data: {
            scanId: scan.id,
            keywords: input.keywords,
            mentionsFound: mentions.length,
            alertsCreated,
            mentions: mentions.slice(0, 20),
            durationMs: scan.durationMs,
          },
        });
      },
    );

    // POST /detect/credentials — Run credential leak check
    app.post(
      '/detect/credentials',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = CredentialCheckSchema.parse(req.body);
        const startTime = Date.now();

        const leaks = input.emails
          ? credentialLeakDetector.checkEmails(user.tenantId, input.emails)
          : credentialLeakDetector.checkDomain(user.tenantId, input.emailDomain);

        const alertInputs = credentialLeakDetector.leaksToAlertInputs(input.emailDomain, leaks);

        let alertsCreated = 0;
        for (const alertInput of alertInputs) {
          const alert = alertManager.create(user.tenantId, alertInput);
          if (alert) alertsCreated++;
        }

        const scan = createScanResult(user.tenantId, input.emailDomain, 'credential_leak', leaks.length, alertsCreated, startTime);
        store.setScan(user.tenantId, scan);

        return reply.send({
          data: {
            scanId: scan.id,
            emailDomain: input.emailDomain,
            breachesFound: leaks.length,
            alertsCreated,
            leaks,
            durationMs: scan.durationMs,
          },
        });
      },
    );

    // POST /detect/surface — Run attack surface scan
    app.post(
      '/detect/surface',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = SurfaceScanSchema.parse(req.body);
        const startTime = Date.now();

        const result = attackSurfaceScanner.scanDomain(user.tenantId, input.domain, {
          portRange: input.portRange,
          checkCerts: input.checkCerts,
          checkDns: input.checkDns,
        });

        const alertInputs = attackSurfaceScanner.servicesToAlertInputs(input.domain, result.services);

        let alertsCreated = 0;
        for (const alertInput of alertInputs) {
          const alert = alertManager.create(user.tenantId, alertInput);
          if (alert) alertsCreated++;
        }

        const scan = createScanResult(user.tenantId, input.domain, 'exposed_service', result.services.length, alertsCreated, startTime);
        store.setScan(user.tenantId, scan);

        // Push to graph if enabled
        const alerts = Array.from(store.getTenantAlerts(user.tenantId).values())
          .filter((a) => a.type === 'exposed_service')
          .slice(-alertsCreated);
        if (alerts.length > 0) {
          graphIntegration.pushAlerts(user.tenantId, alerts).catch(() => { /* fire and forget */ });
        }

        return reply.send({
          data: {
            scanId: scan.id,
            domain: input.domain,
            servicesFound: result.services.length,
            certificatesFound: result.certificates.length,
            dnsRecordsFound: result.dnsRecords.length,
            alertsCreated,
            services: result.services,
            certificates: result.certificates,
            dnsRecords: result.dnsRecords,
            durationMs: scan.durationMs,
          },
        });
      },
    );

    // GET /detect/results/:scanId — Get scan results
    app.get(
      '/detect/results/:scanId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { scanId } = req.params as { scanId: string };
        const scan = store.getScan(user.tenantId, scanId);
        if (!scan) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Scan not found' } });
        }
        return reply.send({ data: scan });
      },
    );

    // GET /certstream/status — CertStream monitor health + stats
    app.get(
      '/certstream/status',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (_req: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ data: certStreamMonitor.getStats() });
      },
    );
  };
}

function createScanResult(
  tenantId: string,
  assetId: string,
  scanType: ScanResult['scanType'],
  findingsCount: number,
  alertsCreated: number,
  startTime: number,
): ScanResult {
  return {
    id: randomUUID(),
    tenantId,
    assetId,
    scanType,
    status: 'completed',
    findingsCount,
    alertsCreated,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}

function recencyScore(dateStr: string): number {
  const age = Date.now() - new Date(dateStr).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 30) return 0.95;
  if (days < 90) return 0.75;
  if (days < 180) return 0.50;
  return 0.25;
}
