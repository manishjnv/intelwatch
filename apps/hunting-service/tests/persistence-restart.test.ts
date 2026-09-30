/**
 * Step 3 S159 — proves every hunting-service doc survives a "restart" (a fresh
 * service instance built on the same underlying MemoryDocRepos), that mutations
 * made through service methods are visible to the new instance, and that
 * deleting a hunt session cascades to its child docs (comments, shares,
 * evidence, hypotheses, correlation leads).
 */
import { describe, it, expect } from 'vitest';
import { HuntingStore } from '../src/schemas/store.js';
import type { LeadDoc } from '../src/schemas/store.js';
import { MemoryDocRepo } from '../src/doc-repo.js';
import { HuntSessionManager } from '../src/services/hunt-session-manager.js';
import { SavedHuntLibrary } from '../src/services/saved-hunt-library.js';
import { CorrelationIntegration } from '../src/services/correlation-integration.js';
import { Collaboration, type CommentDoc, type ShareDoc } from '../src/services/collaboration.js';
import { EvidenceCollection, type EvidenceDoc } from '../src/services/evidence-collection.js';
import { HypothesisEngine, type HypothesisDoc } from '../src/services/hypothesis-engine.js';
import { HuntPlaybooks, type ExecutionDoc } from '../src/services/hunt-playbooks.js';
import type { HuntSession, HuntTemplate } from '../src/schemas/hunting.js';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const USER = 'user-1';

describe('Hunting Service — Step 3 S159 persistence restart', () => {
  it('every doc kind survives a restart, mutations through service methods persist, and deleting a session cascades', async () => {
    // Shared repos — stand in for the shared Postgres table across "restarts".
    const sessionsRepo = new MemoryDocRepo<HuntSession>();
    const templatesRepo = new MemoryDocRepo<HuntTemplate>();
    const leadsRepo = new MemoryDocRepo<LeadDoc>();
    const commentsRepo = new MemoryDocRepo<CommentDoc>();
    const sharesRepo = new MemoryDocRepo<ShareDoc>();
    const evidenceRepo = new MemoryDocRepo<EvidenceDoc>();
    const hypothesisRepo = new MemoryDocRepo<HypothesisDoc>();
    const playbookRepo = new MemoryDocRepo<ExecutionDoc>();

    // ─── Instance #1: write everything ────────────────────────

    const store1 = new HuntingStore({ sessions: sessionsRepo, templates: templatesRepo, leads: leadsRepo });
    const sessionManager1 = new HuntSessionManager(store1, { sessionTimeoutHours: 72, maxActiveSessions: 20 });
    const huntLibrary1 = new SavedHuntLibrary(store1);
    const correlation1 = new CorrelationIntegration(store1, {
      correlationServiceUrl: 'http://localhost:3013', enabled: true,
    });
    const collab1 = new Collaboration(store1, { comments: commentsRepo, shares: sharesRepo });
    const evidence1 = new EvidenceCollection(store1, evidenceRepo);
    const hypothesis1 = new HypothesisEngine(store1, hypothesisRepo);
    const playbooks1 = new HuntPlaybooks(playbookRepo);

    const hunt = await sessionManager1.create(TENANT, USER, {
      title: 'Restart Test Hunt',
      hypothesis: 'Testing persistence across restarts',
    });
    const template = await huntLibrary1.create(TENANT, USER, {
      name: 'Restart Template',
      description: 'Template for restart test',
      category: 'apt',
      hypothesis: 'Test',
      defaultQuery: {
        fields: [{ field: 'type', operator: 'eq', value: 'ip' }],
        limit: 100, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc',
      },
    });
    const lead = await correlation1.linkCorrelationToHunt(TENANT, hunt.id, {
      id: 'corr-1', type: 'co-occurrence', confidence: 0.9,
      entities: [{ type: 'ip', value: '10.0.0.1' }], description: 'test correlation',
    });
    const comment = await collab1.addComment(TENANT, hunt.id, USER, 'Restart test comment');
    const share = await collab1.share(TENANT, hunt.id, USER, 'user-2', 'edit');
    const ev = await evidence1.add(TENANT, hunt.id, USER, {
      type: 'note', title: 'Restart evidence', description: 'D',
    });
    const hyp = await hypothesis1.create(TENANT, hunt.id, USER, {
      statement: 'Restart hypothesis', rationale: 'R',
    });
    const exec = await playbooks1.startExecution(TENANT, 'playbook-phishing', hunt.id);

    // Mutations made through service methods — must be visible after "restart".
    await sessionManager1.changeStatus(TENANT, hunt.id, USER, 'active');
    const confirmed = await hypothesis1.setVerdict(TENANT, hunt.id, hyp.id, USER, 'confirmed');
    await evidence1.get(TENANT, hunt.id, ev.id); // sanity read, no mutation
    await playbooks1.completeStep(TENANT, hunt.id, exec.steps[0]!.id, 'done');

    // ─── Instance #2: fresh service objects, same repos ───────

    const store2 = new HuntingStore({ sessions: sessionsRepo, templates: templatesRepo, leads: leadsRepo });
    const sessionManager2 = new HuntSessionManager(store2, { sessionTimeoutHours: 72, maxActiveSessions: 20 });
    const huntLibrary2 = new SavedHuntLibrary(store2);
    const correlation2 = new CorrelationIntegration(store2, {
      correlationServiceUrl: 'http://localhost:3013', enabled: true,
    });
    const collab2 = new Collaboration(store2, { comments: commentsRepo, shares: sharesRepo });
    const evidence2 = new EvidenceCollection(store2, evidenceRepo);
    const hypothesis2 = new HypothesisEngine(store2, hypothesisRepo);
    const playbooks2 = new HuntPlaybooks(playbookRepo);

    const fetchedHunt = await sessionManager2.get(TENANT, hunt.id);
    expect(fetchedHunt.status).toBe('active'); // mutation via changeStatus visible

    const fetchedTemplate = await huntLibrary2.get(TENANT, template.id);
    expect(fetchedTemplate.id).toBe(template.id);

    const fetchedLeads = await correlation2.getHuntLeads(TENANT, hunt.id);
    expect(fetchedLeads).toHaveLength(1);
    expect(fetchedLeads[0]!.correlationId).toBe(lead.correlationId);

    const fetchedComments = await collab2.listComments(TENANT, hunt.id);
    expect(fetchedComments).toHaveLength(1);
    expect(fetchedComments[0]!.id).toBe(comment.id);

    const fetchedShares = await collab2.listShares(TENANT, hunt.id);
    expect(fetchedShares).toHaveLength(1);
    expect(fetchedShares[0]!.sharedWith).toBe(share.sharedWith);

    const fetchedEvidence = await evidence2.get(TENANT, hunt.id, ev.id);
    expect(fetchedEvidence.id).toBe(ev.id);

    const fetchedHyp = await hypothesis2.get(TENANT, hunt.id, hyp.id);
    expect(fetchedHyp.verdict).toBe('confirmed'); // mutation via setVerdict visible
    expect(fetchedHyp.confidence).toBe(confirmed.confidence);

    const fetchedExec = await playbooks2.getExecution(TENANT, hunt.id);
    expect(fetchedExec).toBeDefined();
    expect(fetchedExec!.completedSteps).toBe(1); // mutation via completeStep visible

    // Cross-tenant isolation.
    expect(await sessionManager2.list(OTHER_TENANT, 1, 50)).toEqual({ data: [], total: 0 });
    expect(await correlation2.getHuntLeads(OTHER_TENANT, hunt.id).catch((e) => e.statusCode)).toBe(404);

    // ─── Deleting a session cascades to its child docs ────────

    await store2.deleteSession(TENANT, hunt.id);

    expect(await commentsRepo.list(TENANT, hunt.id)).toHaveLength(0);
    expect(await sharesRepo.list(TENANT, hunt.id)).toHaveLength(0);
    expect(await evidenceRepo.list(TENANT, hunt.id)).toHaveLength(0);
    expect(await hypothesisRepo.list(TENANT, hunt.id)).toHaveLength(0);
    expect(await leadsRepo.list(TENANT, hunt.id)).toHaveLength(0);
    expect(await store2.getSession(TENANT, hunt.id)).toBeUndefined();
  });
});
