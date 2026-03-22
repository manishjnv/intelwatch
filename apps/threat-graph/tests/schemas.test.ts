import { describe, it, expect } from 'vitest';
import {
  NodeTypeSchema, RelationshipTypeSchema, CreateNodeInputSchema,
  CreateRelationshipSchema, NHopQuerySchema, PathQuerySchema,
  ClusterQuerySchema, PropagateInputSchema,
  IOCNodeSchema, ThreatActorNodeSchema, MalwareNodeSchema,
  CampaignNodeSchema, InfrastructureNodeSchema, VulnerabilityNodeSchema,
  VictimNodeSchema, GraphNodeSchema,
  RELATIONSHIP_RULES,
} from '../src/schemas/graph.js';

describe('Threat Graph — Schemas', () => {
  describe('NodeTypeSchema', () => {
    it('accepts all 7 node types', () => {
      const types = ['IOC', 'ThreatActor', 'Malware', 'Campaign', 'Infrastructure', 'Vulnerability', 'Victim'];
      for (const t of types) {
        expect(NodeTypeSchema.parse(t)).toBe(t);
      }
    });

    it('rejects invalid node type', () => {
      expect(() => NodeTypeSchema.parse('InvalidType')).toThrow();
    });
  });

  describe('RelationshipTypeSchema', () => {
    it('accepts all 9 relationship types', () => {
      const types = ['USES', 'CONDUCTS', 'TARGETS', 'CONTROLS', 'RESOLVES_TO', 'HOSTED_ON', 'EXPLOITS', 'INDICATES', 'OBSERVED_IN'];
      for (const t of types) {
        expect(RelationshipTypeSchema.parse(t)).toBe(t);
      }
    });

    it('rejects invalid relationship type', () => {
      expect(() => RelationshipTypeSchema.parse('INVALID')).toThrow();
    });
  });

  describe('RELATIONSHIP_RULES', () => {
    it('USES: ThreatActor → Malware', () => {
      expect(RELATIONSHIP_RULES.USES.from).toContain('ThreatActor');
      expect(RELATIONSHIP_RULES.USES.to).toContain('Malware');
    });

    it('RESOLVES_TO: IOC → IOC', () => {
      expect(RELATIONSHIP_RULES.RESOLVES_TO.from).toContain('IOC');
      expect(RELATIONSHIP_RULES.RESOLVES_TO.to).toContain('IOC');
    });

    it('EXPLOITS: ThreatActor → Vulnerability', () => {
      expect(RELATIONSHIP_RULES.EXPLOITS.from).toContain('ThreatActor');
      expect(RELATIONSHIP_RULES.EXPLOITS.to).toContain('Vulnerability');
    });
  });

  describe('Node-specific schemas', () => {
    const baseNode = {
      id: '00000000-0000-0000-0000-000000000099',
      tenantId: '00000000-0000-0000-0000-000000000001',
      riskScore: 75, confidence: 0.8,
    };

    it('validates IOC node with value and type', () => {
      const node = { ...baseNode, nodeType: 'IOC', iocType: 'ip', value: '1.2.3.4' };
      expect(IOCNodeSchema.parse(node).value).toBe('1.2.3.4');
    });

    it('validates ThreatActor node with name', () => {
      const node = { ...baseNode, nodeType: 'ThreatActor', name: 'APT28', aliases: ['Fancy Bear'] };
      expect(ThreatActorNodeSchema.parse(node).name).toBe('APT28');
    });

    it('validates Malware node with family', () => {
      const node = { ...baseNode, nodeType: 'Malware', name: 'Emotet', family: 'Banking Trojan' };
      expect(MalwareNodeSchema.parse(node).family).toBe('Banking Trojan');
    });

    it('validates Campaign node with status', () => {
      const node = { ...baseNode, nodeType: 'Campaign', name: 'Operation X', status: 'active' };
      expect(CampaignNodeSchema.parse(node).status).toBe('active');
    });

    it('validates Infrastructure node', () => {
      const node = { ...baseNode, nodeType: 'Infrastructure', infraType: 'c2', value: '10.0.0.1', asn: 'AS12345' };
      expect(InfrastructureNodeSchema.parse(node).asn).toBe('AS12345');
    });

    it('validates Vulnerability node with CVE', () => {
      const node = { ...baseNode, nodeType: 'Vulnerability', cveId: 'CVE-2024-1234', cvss: 9.8 };
      expect(VulnerabilityNodeSchema.parse(node).cvss).toBe(9.8);
    });

    it('rejects Vulnerability with invalid CVE format', () => {
      const node = { ...baseNode, nodeType: 'Vulnerability', cveId: 'not-a-cve' };
      expect(() => VulnerabilityNodeSchema.parse(node)).toThrow();
    });

    it('validates Victim node', () => {
      const node = { ...baseNode, nodeType: 'Victim', name: 'ACME Corp', industry: 'Finance', country: 'US' };
      expect(VictimNodeSchema.parse(node).industry).toBe('Finance');
    });

    it('discriminated union resolves correct schema', () => {
      const ioc = { ...baseNode, nodeType: 'IOC', iocType: 'domain', value: 'evil.com' };
      const parsed = GraphNodeSchema.parse(ioc);
      expect(parsed.nodeType).toBe('IOC');
    });
  });

  describe('CreateNodeInputSchema', () => {
    it('accepts IOC with value property', () => {
      const input = { nodeType: 'IOC', properties: { value: '1.2.3.4', iocType: 'ip' } };
      expect(CreateNodeInputSchema.parse(input).nodeType).toBe('IOC');
    });

    it('rejects IOC without value property', () => {
      const input = { nodeType: 'IOC', properties: { iocType: 'ip' } };
      expect(() => CreateNodeInputSchema.parse(input)).toThrow('Missing required property');
    });

    it('accepts ThreatActor with name property', () => {
      const input = { nodeType: 'ThreatActor', properties: { name: 'APT28' } };
      expect(CreateNodeInputSchema.parse(input).nodeType).toBe('ThreatActor');
    });

    it('accepts Vulnerability with cveId property', () => {
      const input = { nodeType: 'Vulnerability', properties: { cveId: 'CVE-2024-1234' } };
      expect(CreateNodeInputSchema.parse(input).nodeType).toBe('Vulnerability');
    });
  });

  describe('CreateRelationshipSchema', () => {
    it('accepts valid relationship', () => {
      const input = {
        fromNodeId: '00000000-0000-0000-0000-000000000001',
        toNodeId: '00000000-0000-0000-0000-000000000002',
        type: 'USES',
        confidence: 0.9,
      };
      const parsed = CreateRelationshipSchema.parse(input);
      expect(parsed.confidence).toBe(0.9);
    });

    it('defaults confidence to 0.5', () => {
      const input = {
        fromNodeId: '00000000-0000-0000-0000-000000000001',
        toNodeId: '00000000-0000-0000-0000-000000000002',
        type: 'USES',
      };
      const parsed = CreateRelationshipSchema.parse(input);
      expect(parsed.confidence).toBe(0.5);
    });

    it('rejects confidence > 1', () => {
      const input = {
        fromNodeId: '00000000-0000-0000-0000-000000000001',
        toNodeId: '00000000-0000-0000-0000-000000000002',
        type: 'USES',
        confidence: 1.5,
      };
      expect(() => CreateRelationshipSchema.parse(input)).toThrow();
    });
  });

  describe('Query schemas', () => {
    it('NHopQuery — defaults hops to 2', () => {
      expect(NHopQuerySchema.parse({}).hops).toBe(2);
    });

    it('NHopQuery — rejects hops > 5', () => {
      expect(() => NHopQuerySchema.parse({ hops: 10 })).toThrow();
    });

    it('PathQuery — requires from and to UUIDs', () => {
      const q = { from: '00000000-0000-0000-0000-000000000001', to: '00000000-0000-0000-0000-000000000002' };
      const parsed = PathQuerySchema.parse(q);
      expect(parsed.maxDepth).toBe(5);
    });

    it('ClusterQuery — defaults depth to 2', () => {
      expect(ClusterQuerySchema.parse({}).depth).toBe(2);
    });

    it('PropagateInput — requires nodeId UUID', () => {
      const input = { nodeId: '00000000-0000-0000-0000-000000000001' };
      expect(PropagateInputSchema.parse(input).maxDepth).toBe(3);
    });
  });
});
