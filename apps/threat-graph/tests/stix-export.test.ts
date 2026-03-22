import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StixExportService } from '../src/services/stix-export.js';
import { GraphRepository } from '../src/repository.js';
import type { GraphNodeResponse, GraphEdgeResponse } from '../src/schemas/graph.js';

vi.mock('../src/repository.js');

const mockRepo = {
  getNode: vi.fn(),
  getNHopNeighbors: vi.fn(),
} as unknown as GraphRepository;

const TENANT = 'tenant-1';
const NOW = '2026-01-01T00:00:00.000Z';

// ─── Node Helpers ─────────────────────────────────────────────────

function makeIocNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'ioc-uuid-0001',
    nodeType: 'IOC',
    riskScore: 75,
    confidence: 0.85,
    properties: { value: '1.2.3.4', iocType: 'ip', firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeThreatActorNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'actor-uuid-0001',
    nodeType: 'ThreatActor',
    riskScore: 90,
    confidence: 0.9,
    properties: { name: 'APT28', aliases: ['Fancy Bear'], motivation: 'espionage', firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeMalwareNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'malware-uuid-0001',
    nodeType: 'Malware',
    riskScore: 80,
    confidence: 0.8,
    properties: { name: 'Emotet', malwareType: 'trojan', family: 'Emotet', firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeCampaignNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'campaign-uuid-0001',
    nodeType: 'Campaign',
    riskScore: 70,
    confidence: 0.75,
    properties: {
      name: 'Operation Moonlight',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-06-01T00:00:00.000Z',
      firstSeen: NOW,
      lastSeen: NOW,
    },
    ...overrides,
  };
}

function makeInfrastructureNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'infra-uuid-0001',
    nodeType: 'Infrastructure',
    riskScore: 60,
    confidence: 0.7,
    properties: { value: 'evil-c2.example.com', infraType: 'c2', firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeVulnerabilityNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'vuln-uuid-0001',
    nodeType: 'Vulnerability',
    riskScore: 85,
    confidence: 0.95,
    properties: { cveId: 'CVE-2024-1234', cvss: 9.8, firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeVictimNode(overrides: Partial<GraphNodeResponse> = {}): GraphNodeResponse {
  return {
    id: 'victim-uuid-0001',
    nodeType: 'Victim',
    riskScore: 40,
    confidence: 0.6,
    properties: { name: 'Acme Corp', industry: 'finance', country: 'US', firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdgeResponse> = {}): GraphEdgeResponse {
  return {
    id: 'edge-001',
    type: 'USES',
    fromNodeId: 'actor-uuid-0001',
    toNodeId: 'malware-uuid-0001',
    confidence: 0.8,
    properties: { firstSeen: NOW, lastSeen: NOW },
    ...overrides,
  };
}

function makeEmptySubgraph() {
  return { nodes: [], edges: [] };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Threat Graph — StixExportService', () => {
  let service: StixExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StixExportService(mockRepo);
  });

  // ── Test 1: Bundle type and spec_version ──────────────────────
  it('bundle has type "bundle" and spec_version "2.1"', async () => {
    const node = makeIocNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);

    expect(bundle.type).toBe('bundle');
    expect(bundle.spec_version).toBe('2.1');
  });

  // ── Test 2: Bundle id starts with 'bundle--' ─────────────────
  it('bundle id starts with "bundle--"', async () => {
    const node = makeIocNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);

    expect(bundle.id).toMatch(/^bundle--[0-9a-f-]{36}$/);
  });

  // ── Test 3: IOC node → STIX 'indicator' with pattern ─────────
  it('IOC node converts to STIX "indicator" with pattern', async () => {
    const node = makeIocNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'indicator');

    expect(obj).toBeDefined();
    expect(obj!.type).toBe('indicator');
    expect(obj!.pattern).toBeDefined();
    expect(typeof obj!.pattern).toBe('string');
  });

  // ── Test 4: ThreatActor node → STIX 'threat-actor' with name ─
  it('ThreatActor node converts to STIX "threat-actor" with name', async () => {
    const node = makeThreatActorNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'threat-actor');

    expect(obj).toBeDefined();
    expect(obj!.name).toBe('APT28');
  });

  // ── Test 5: Malware node → STIX 'malware' with malware_types ─
  it('Malware node converts to STIX "malware" with malware_types', async () => {
    const node = makeMalwareNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'malware');

    expect(obj).toBeDefined();
    expect(obj!.malware_types).toEqual(['trojan']);
  });

  // ── Test 6: Campaign node → STIX 'campaign' with first/last_seen
  it('Campaign node converts to STIX "campaign" with first_seen and last_seen', async () => {
    const node = makeCampaignNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'campaign');

    expect(obj).toBeDefined();
    expect(obj!.first_seen).toBe('2025-01-01T00:00:00.000Z');
    expect(obj!.last_seen).toBe('2025-06-01T00:00:00.000Z');
  });

  // ── Test 7: Infrastructure node → STIX 'infrastructure' ──────
  it('Infrastructure node converts to STIX "infrastructure"', async () => {
    const node = makeInfrastructureNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'infrastructure');

    expect(obj).toBeDefined();
    expect(obj!.type).toBe('infrastructure');
    expect(obj!.name).toBe('evil-c2.example.com');
  });

  // ── Test 8: Vulnerability node → STIX 'vulnerability' with external_references
  it('Vulnerability node converts to STIX "vulnerability" with external_references', async () => {
    const node = makeVulnerabilityNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'vulnerability');

    expect(obj).toBeDefined();
    const refs = obj!.external_references as Array<{ source_name: string; external_id: string }>;
    expect(refs).toBeDefined();
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.source_name).toBe('cve');
    expect(refs[0]!.external_id).toBe('CVE-2024-1234');
  });

  // ── Test 9: Victim node → STIX 'identity' with identity_class 'organization'
  it('Victim node converts to STIX "identity" with identity_class "organization"', async () => {
    const node = makeVictimNode();
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'identity');

    expect(obj).toBeDefined();
    expect(obj!.identity_class).toBe('organization');
    expect(obj!.name).toBe('Acme Corp');
  });

  // ── Test 10: Relationships → STIX SRO with correct relationship_type
  it('relationships convert to STIX SRO with correct relationship_type', async () => {
    const actorNode = makeThreatActorNode();
    const malwareNode = makeMalwareNode();
    const edge = makeEdge({ type: 'USES', fromNodeId: actorNode.id, toNodeId: malwareNode.id });

    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({
      nodes: [malwareNode],
      edges: [edge],
    });
    vi.mocked(mockRepo.getNode).mockResolvedValue(actorNode);

    const bundle = await service.exportBundle(TENANT, actorNode.id, undefined, 2);
    const sro = bundle.objects.find((o) => o.type === 'relationship');

    expect(sro).toBeDefined();
    expect(sro!.relationship_type).toBe('uses');
    expect(sro!.source_ref).toBe(actorNode.id);
    expect(sro!.target_ref).toBe(malwareNode.id);
  });

  // ── Test 11: IP IOC generates correct STIX pattern ────────────
  it('IP IOC generates pattern [ipv4-addr:value = \'...\']', async () => {
    const node = makeIocNode({ properties: { value: '192.168.1.1', iocType: 'ip' } });
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'indicator');

    expect(obj!.pattern).toBe("[ipv4-addr:value = '192.168.1.1']");
  });

  // ── Test 12: Domain IOC generates correct STIX pattern ────────
  it('Domain IOC generates pattern [domain-name:value = \'...\']', async () => {
    const node = makeIocNode({
      id: 'ioc-uuid-0002',
      properties: { value: 'evil.example.com', iocType: 'domain' },
    });
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'indicator');

    expect(obj!.pattern).toBe("[domain-name:value = 'evil.example.com']");
  });

  // ── Test 13: SHA-256 hash IOC generates correct STIX pattern ──
  it("Hash IOC generates pattern [file:hashes.'SHA-256' = '...']", async () => {
    const hashValue = 'a'.repeat(64);
    const node = makeIocNode({
      id: 'ioc-uuid-0003',
      properties: { value: hashValue, iocType: 'hash_sha256' },
    });
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue({ nodes: [node], edges: [] });
    vi.mocked(mockRepo.getNode).mockResolvedValue(node);

    const bundle = await service.exportBundle(TENANT, node.id, undefined, 2);
    const obj = bundle.objects.find((o) => o.type === 'indicator');

    expect(obj!.pattern).toBe(`[file:hashes.'SHA-256' = '${hashValue}']`);
  });

  // ── Test 14: Export with nodeIds fetches multiple specific nodes
  it('export with nodeIds fetches multiple specific nodes', async () => {
    const node1 = makeThreatActorNode({ id: 'actor-uuid-0001' });
    const node2 = makeMalwareNode({ id: 'malware-uuid-0001' });
    const edge = makeEdge({ fromNodeId: node1.id, toNodeId: node2.id });

    vi.mocked(mockRepo.getNode)
      .mockResolvedValueOnce(node1)
      .mockResolvedValueOnce(node2);

    vi.mocked(mockRepo.getNHopNeighbors)
      .mockResolvedValueOnce({ nodes: [node2], edges: [edge] })
      .mockResolvedValueOnce({ nodes: [node1], edges: [edge] });

    const bundle = await service.exportBundle(TENANT, undefined, [node1.id, node2.id], 1);

    expect(mockRepo.getNode).toHaveBeenCalledWith(TENANT, node1.id);
    expect(mockRepo.getNode).toHaveBeenCalledWith(TENANT, node2.id);
    const nodeTypes = bundle.objects.filter((o) => o.type !== 'relationship').map((o) => o.type);
    expect(nodeTypes).toContain('threat-actor');
    expect(nodeTypes).toContain('malware');
  });

  // ── Test 15: Empty subgraph returns bundle with no objects ─────
  it('empty subgraph returns bundle with no objects', async () => {
    vi.mocked(mockRepo.getNHopNeighbors).mockResolvedValue(makeEmptySubgraph());
    vi.mocked(mockRepo.getNode).mockResolvedValue(null);

    const bundle = await service.exportBundle(TENANT, 'nonexistent-id', undefined, 2);

    expect(bundle.type).toBe('bundle');
    expect(bundle.objects).toHaveLength(0);
  });
});
