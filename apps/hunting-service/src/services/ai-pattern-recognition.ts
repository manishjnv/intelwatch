import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, EntityType } from '../schemas/hunting.js';

export interface AIPatternConfig {
  enabled: boolean;
  apiKey?: string;
  model: string;
  maxTokens: number;
  budgetCentsPerDay: number;
}

export interface DetectedPattern {
  id: string;
  name: string;
  type: 'attack_chain' | 'campaign' | 'ttp_cluster' | 'infrastructure' | 'behavioral';
  confidence: number;
  description: string;
  entities: Array<{ type: EntityType; value: string; role: string }>;
  mitreTechniques: string[];
  suggestedActions: string[];
  detectedAt: string;
}

export interface PatternAnalysisResult {
  huntId: string;
  patterns: DetectedPattern[];
  source: 'ai' | 'heuristic';
  analysisTime: number;
  entityCount: number;
}

/** Heuristic pattern templates keyed by entity co-occurrence. */
const HEURISTIC_PATTERNS: Array<{
  name: string;
  type: DetectedPattern['type'];
  requiredTypes: EntityType[];
  minEntities: number;
  description: string;
  mitreTechniques: string[];
  suggestedActions: string[];
}> = [
  {
    name: 'Phishing Infrastructure',
    type: 'attack_chain',
    requiredTypes: ['email', 'domain', 'url'],
    minEntities: 3,
    description: 'Email, domain, and URL co-occurrence suggests a phishing campaign infrastructure',
    mitreTechniques: ['T1566.001', 'T1566.002'],
    suggestedActions: ['Check domain registration date', 'Look for email template patterns', 'Search for related URLs'],
  },
  {
    name: 'C2 Infrastructure',
    type: 'infrastructure',
    requiredTypes: ['ip', 'domain'],
    minEntities: 2,
    description: 'IP and domain correlation suggests command-and-control infrastructure',
    mitreTechniques: ['T1071.001', 'T1573'],
    suggestedActions: ['Check for beaconing patterns', 'Query passive DNS history', 'Look for JA3 fingerprints'],
  },
  {
    name: 'Malware Distribution',
    type: 'attack_chain',
    requiredTypes: ['hash_sha256', 'url'],
    minEntities: 2,
    description: 'File hash and URL co-occurrence suggests malware distribution chain',
    mitreTechniques: ['T1105', 'T1204.002'],
    suggestedActions: ['Submit hash to sandbox', 'Check URL for hosted payloads', 'Search for dropper variants'],
  },
  {
    name: 'Vulnerability Exploitation',
    type: 'ttp_cluster',
    requiredTypes: ['cve', 'ip'],
    minEntities: 2,
    description: 'CVE and IP co-occurrence suggests active exploitation targeting',
    mitreTechniques: ['T1190', 'T1203'],
    suggestedActions: ['Verify CVE patch status', 'Check IP scanning activity', 'Review exploit code availability'],
  },
  {
    name: 'Threat Actor Campaign',
    type: 'campaign',
    requiredTypes: ['threat_actor', 'ip'],
    minEntities: 2,
    description: 'Threat actor linked to infrastructure suggests active campaign',
    mitreTechniques: ['T1583.001', 'T1584.001'],
    suggestedActions: ['Review actor TTPs', 'Map infrastructure overlaps', 'Check for sector targeting'],
  },
];

/**
 * #11 AI Pattern Recognition — analyzes hunt findings to identify attack patterns.
 *
 * Uses heuristic matching against entity type co-occurrence patterns.
 * When AI is enabled, can use Claude Sonnet for deep pattern analysis.
 */
export class AIPatternRecognition {
  private readonly store: HuntingStore;
  private readonly config: AIPatternConfig;

  constructor(store: HuntingStore, config: AIPatternConfig) {
    this.store = store;
    this.config = config;
  }

  /** Whether AI-based analysis is enabled. */
  get isAIEnabled(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  /** Analyze a hunt for patterns. */
  async analyze(tenantId: string, huntId: string): Promise<PatternAnalysisResult> {
    const session = this.requireHunt(tenantId, huntId);
    const startTime = Date.now();

    const patterns = this.detectHeuristicPatterns(session);

    return {
      huntId,
      patterns,
      source: 'heuristic',
      analysisTime: Date.now() - startTime,
      entityCount: session.entities.length,
    };
  }

  /** Detect patterns from entity type co-occurrence. */
  private detectHeuristicPatterns(session: HuntSession): DetectedPattern[] {
    if (session.entities.length < 2) return [];

    const entityTypeSet = new Set(session.entities.map((e) => e.type));
    const detected: DetectedPattern[] = [];
    let counter = 0;

    for (const template of HEURISTIC_PATTERNS) {
      const hasRequired = template.requiredTypes.every((t) => entityTypeSet.has(t));
      if (!hasRequired) continue;

      const matchingEntities = session.entities.filter((e) =>
        template.requiredTypes.includes(e.type),
      );
      if (matchingEntities.length < template.minEntities) continue;

      const confidence = Math.min(0.3 + matchingEntities.length * 0.1, 0.8);

      detected.push({
        id: `pattern-${++counter}`,
        name: template.name,
        type: template.type,
        confidence,
        description: template.description,
        entities: matchingEntities.map((e) => ({
          type: e.type,
          value: e.value,
          role: this.inferEntityRole(e.type, template.type),
        })),
        mitreTechniques: template.mitreTechniques,
        suggestedActions: template.suggestedActions,
        detectedAt: new Date().toISOString(),
      });
    }

    return detected.sort((a, b) => b.confidence - a.confidence);
  }

  /** Infer the role of an entity within a pattern. */
  private inferEntityRole(entityType: EntityType, patternType: string): string {
    const roles: Record<string, Record<string, string>> = {
      ip: { infrastructure: 'server', attack_chain: 'source', ttp_cluster: 'target', campaign: 'infrastructure' },
      domain: { infrastructure: 'domain', attack_chain: 'delivery', campaign: 'infrastructure' },
      url: { attack_chain: 'payload_url' },
      hash_sha256: { attack_chain: 'payload' },
      email: { attack_chain: 'lure' },
      cve: { ttp_cluster: 'exploit' },
      threat_actor: { campaign: 'operator' },
    };
    return roles[entityType]?.[patternType] ?? 'related';
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
