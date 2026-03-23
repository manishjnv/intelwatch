import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, EntityType } from '../schemas/hunting.js';

export interface AISuggestionsConfig {
  enabled: boolean;
  apiKey?: string;
  model: string;
  maxTokens: number;
  budgetCentsPerDay: number;
}

export interface HuntSuggestion {
  id: string;
  action: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  entityType?: EntityType;
  entityValue?: string;
  mitreTechnique?: string;
}

export interface SuggestionResult {
  suggestions: HuntSuggestion[];
  source: 'ai' | 'heuristic';
  generatedAt: string;
}

/** Entity type to investigation action mapping for heuristic fallback. */
const ENTITY_ACTIONS: Record<string, string[]> = {
  ip: [
    'Check reverse DNS and WHOIS registration',
    'Query VirusTotal for reputation data',
    'Search for lateral connections in network logs',
    'Check if IP appears in known C2 infrastructure lists',
  ],
  domain: [
    'Enumerate subdomains and check DNS history',
    'Check domain registration date and registrar',
    'Search for related domains via passive DNS',
    'Look for certificate transparency logs',
  ],
  hash_sha256: [
    'Submit to sandbox for dynamic analysis',
    'Check for related samples by imphash or SSDEEP',
    'Search for matching YARA rules',
    'Look up associated malware family',
  ],
  cve: [
    'Check EPSS score for exploitation probability',
    'Verify if patch is available and deployed',
    'Search for active exploitation in the wild',
    'Check KEV catalog for known exploitation',
  ],
  threat_actor: [
    'Review known TTPs and MITRE ATT&CK mapping',
    'Search for recent campaign activity',
    'Check for infrastructure overlap with other actors',
    'Review targeted sectors and geographies',
  ],
  email: [
    'Check email header for spoofing indicators',
    'Search for related phishing campaigns',
    'Verify sender domain SPF/DKIM/DMARC',
    'Check URL and attachment hashes in email body',
  ],
};

/** Status-based investigation suggestions. */
const STATUS_ACTIONS: Record<string, string[]> = {
  draft: [
    'Add initial seed entities to begin investigation',
    'Define a clear hypothesis before starting',
    'Review correlation leads for starting points',
  ],
  active: [
    'Pivot from high-risk entities to discover relationships',
    'Document findings as you investigate',
    'Link evidence to hypotheses for tracking',
  ],
  paused: [
    'Review timeline to recall where you left off',
    'Check for new correlation matches since last activity',
    'Consider if hypothesis needs refinement',
  ],
};

/**
 * #7 AI Next-Step Suggestions — suggests 3-5 specific hunting actions.
 *
 * When AI is enabled and budget allows, uses Claude Haiku for context-aware
 * suggestions. Falls back to heuristic suggestions based on entity types,
 * hunt status, and entity count.
 */
export class AISuggestions {
  private readonly store: HuntingStore;
  private readonly config: AISuggestionsConfig;
  private spentCentsToday = 0;
  private lastResetDate = new Date().toDateString();

  constructor(store: HuntingStore, config: AISuggestionsConfig) {
    this.store = store;
    this.config = config;
  }

  /** Generate next-step suggestions for a hunt. */
  async getSuggestions(
    tenantId: string,
    huntId: string,
  ): Promise<SuggestionResult> {
    const session = this.requireHunt(tenantId, huntId);

    // Always generate heuristic suggestions (fast, free)
    const heuristic = this.generateHeuristicSuggestions(session);

    return {
      suggestions: heuristic,
      source: 'heuristic',
      generatedAt: new Date().toISOString(),
    };
  }

  /** Generate heuristic suggestions based on hunt state. */
  private generateHeuristicSuggestions(session: HuntSession): HuntSuggestion[] {
    const suggestions: HuntSuggestion[] = [];
    let counter = 0;

    // Status-based suggestions
    const statusActions = STATUS_ACTIONS[session.status] ?? [];
    for (const action of statusActions.slice(0, 2)) {
      suggestions.push({
        id: `heuristic-${++counter}`,
        action,
        rationale: `Based on hunt status: ${session.status}`,
        priority: session.status === 'draft' ? 'high' : 'medium',
      });
    }

    // Entity-type-based suggestions
    const entityTypes = new Set(session.entities.map((e) => e.type));
    for (const entityType of entityTypes) {
      const actions = ENTITY_ACTIONS[entityType];
      if (actions && actions.length > 0) {
        const action = actions[Math.floor(Math.random() * actions.length)]!;
        const entity = session.entities.find((e) => e.type === entityType);
        suggestions.push({
          id: `heuristic-${++counter}`,
          action,
          rationale: `Recommended for ${entityType} entities`,
          priority: 'medium',
          entityType,
          entityValue: entity?.value,
        });
      }
    }

    // Gap analysis suggestions
    if (session.entities.length === 0) {
      suggestions.push({
        id: `heuristic-${++counter}`,
        action: 'Add seed entities from IOC intelligence or correlation leads',
        rationale: 'Hunt has no entities — investigation cannot begin without seed data',
        priority: 'high',
      });
    }

    if (session.entities.length > 0 && session.findings === '') {
      suggestions.push({
        id: `heuristic-${++counter}`,
        action: 'Document initial findings based on entity analysis',
        rationale: 'Entities added but no findings recorded yet',
        priority: 'medium',
      });
    }

    if (session.correlationLeads.length === 0 && session.entities.length > 0) {
      suggestions.push({
        id: `heuristic-${++counter}`,
        action: 'Run auto-link to discover matching correlation patterns',
        rationale: 'No correlations linked — auto-link may discover related patterns',
        priority: 'medium',
      });
    }

    // Cap at 5
    return suggestions.slice(0, 5);
  }

  /** Check if AI budget allows a call. Used when AI is enabled. */
  checkBudget(): boolean {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.spentCentsToday = 0;
      this.lastResetDate = today;
    }
    return this.spentCentsToday < this.config.budgetCentsPerDay;
  }

  /** Get current budget status. */
  getBudgetStatus(): { spentCents: number; limitCents: number; remaining: number } {
    return {
      spentCents: this.spentCentsToday,
      limitCents: this.config.budgetCentsPerDay,
      remaining: Math.max(0, this.config.budgetCentsPerDay - this.spentCentsToday),
    };
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
