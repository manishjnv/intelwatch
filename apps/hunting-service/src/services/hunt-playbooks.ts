import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { EntityType, HuntSeverity } from '../schemas/hunting.js';
import type { DocRepo } from '../doc-repo.js';
import { MemoryDocRepo } from '../doc-repo.js';

export interface PlaybookStep {
  id: string;
  order: number;
  action: string;
  description: string;
  entityType?: EntityType;
  automated: boolean;
  completed: boolean;
  completedAt?: string;
  result?: string;
}

export interface HuntPlaybook {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: HuntSeverity;
  mitreTechniques: string[];
  steps: PlaybookStep[];
  estimatedMinutes: number;
  tags: string[];
}

export interface PlaybookExecution {
  playbookId: string;
  huntId: string;
  steps: PlaybookStep[];
  startedAt: string;
  completedSteps: number;
  totalSteps: number;
}

/** Execution rows are keyed by huntId (one active execution per hunt), scoped by tenant. */
export type ExecutionDoc = PlaybookExecution & { id: string; tenantId: string };

/**
 * #12 Hunt Playbook Templates — pre-built investigation workflows.
 *
 * Provides ready-made playbooks for common threat scenarios (phishing,
 * ransomware, APT, insider threat, supply chain). Each playbook has
 * ordered steps that analysts follow.
 */
export class HuntPlaybooks {
  private readonly builtInPlaybooks: HuntPlaybook[];
  private readonly repo: DocRepo<ExecutionDoc>;

  constructor(repo: DocRepo<ExecutionDoc> = new MemoryDocRepo()) {
    this.builtInPlaybooks = this.createBuiltInPlaybooks();
    this.repo = repo;
  }

  /** Get all available playbooks. */
  listPlaybooks(category?: string): HuntPlaybook[] {
    if (category) {
      return this.builtInPlaybooks.filter((p) => p.category === category);
    }
    return [...this.builtInPlaybooks];
  }

  /** Get a specific playbook by ID. */
  getPlaybook(playbookId: string): HuntPlaybook | undefined {
    return this.builtInPlaybooks.find((p) => p.id === playbookId);
  }

  /** Start executing a playbook for a hunt. */
  async startExecution(tenantId: string, playbookId: string, huntId: string): Promise<PlaybookExecution> {
    const playbook = this.getPlaybook(playbookId);
    if (!playbook) {
      throw new AppError(404, `Playbook ${playbookId} not found`, 'PLAYBOOK_NOT_FOUND');
    }

    const execution: ExecutionDoc = {
      id: huntId,
      tenantId,
      playbookId,
      huntId,
      steps: playbook.steps.map((s) => ({ ...s, completed: false })),
      startedAt: new Date().toISOString(),
      completedSteps: 0,
      totalSteps: playbook.steps.length,
    };

    await this.repo.save(execution);
    return execution;
  }

  /** Mark a step as completed. */
  async completeStep(tenantId: string, huntId: string, stepId: string, result?: string): Promise<PlaybookExecution> {
    const execution = await this.repo.get(huntId, tenantId);
    if (!execution) {
      throw new AppError(404, `No playbook execution for hunt ${huntId}`, 'EXECUTION_NOT_FOUND');
    }

    const step = execution.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new AppError(404, `Step ${stepId} not found`, 'STEP_NOT_FOUND');
    }

    step.completed = true;
    step.completedAt = new Date().toISOString();
    step.result = result;
    execution.completedSteps = execution.steps.filter((s) => s.completed).length;

    await this.repo.save(execution);
    return execution;
  }

  /** Get current execution for a hunt. */
  async getExecution(tenantId: string, huntId: string): Promise<PlaybookExecution | undefined> {
    return (await this.repo.get(huntId, tenantId)) ?? undefined;
  }

  /** Get execution progress as percentage. */
  async getProgress(tenantId: string, huntId: string): Promise<number> {
    const execution = await this.repo.get(huntId, tenantId);
    if (!execution || execution.totalSteps === 0) return 0;
    return Math.round((execution.completedSteps / execution.totalSteps) * 100);
  }

  private createBuiltInPlaybooks(): HuntPlaybook[] {
    return [
      {
        id: 'playbook-phishing',
        name: 'Phishing Investigation',
        description: 'Step-by-step investigation of a suspected phishing campaign',
        category: 'phishing',
        severity: 'high',
        mitreTechniques: ['T1566.001', 'T1566.002', 'T1598'],
        estimatedMinutes: 45,
        tags: ['email', 'social-engineering'],
        steps: this.makeSteps([
          { action: 'Collect email headers and metadata', entityType: 'email' },
          { action: 'Extract URLs from email body', entityType: 'url' },
          { action: 'Check sender domain SPF/DKIM/DMARC' },
          { action: 'Submit URLs to sandbox/VT analysis', entityType: 'url' },
          { action: 'Extract file hashes from attachments', entityType: 'hash_sha256' },
          { action: 'Pivot on sender domain for related campaigns', entityType: 'domain' },
          { action: 'Document findings and set hypothesis verdict' },
        ]),
      },
      {
        id: 'playbook-ransomware',
        name: 'Ransomware Response',
        description: 'Rapid response investigation for ransomware indicators',
        category: 'ransomware',
        severity: 'critical',
        mitreTechniques: ['T1486', 'T1490', 'T1059', 'T1047'],
        estimatedMinutes: 90,
        tags: ['ransomware', 'incident-response'],
        steps: this.makeSteps([
          { action: 'Identify ransomware family from ransom note or file extension' },
          { action: 'Collect file hashes (encrypted + ransom note)', entityType: 'hash_sha256' },
          { action: 'Identify C2 infrastructure from network logs', entityType: 'ip' },
          { action: 'Check for lateral movement indicators' },
          { action: 'Review authentication logs for compromised accounts' },
          { action: 'Map affected systems and data scope' },
          { action: 'Check threat intel for decryption tools' },
          { action: 'Document timeline and containment actions' },
        ]),
      },
      {
        id: 'playbook-apt',
        name: 'APT Investigation',
        description: 'Advanced persistent threat investigation workflow',
        category: 'apt',
        severity: 'critical',
        mitreTechniques: ['T1583', 'T1584', 'T1588', 'T1595'],
        estimatedMinutes: 120,
        tags: ['apt', 'nation-state'],
        steps: this.makeSteps([
          { action: 'Identify suspected threat actor', entityType: 'threat_actor' },
          { action: 'Map known TTPs from threat intel databases' },
          { action: 'Collect C2 infrastructure indicators', entityType: 'ip' },
          { action: 'Pivot through graph for infrastructure relationships' },
          { action: 'Identify targeted vulnerabilities', entityType: 'cve' },
          { action: 'Check for custom malware samples', entityType: 'hash_sha256' },
          { action: 'Review historical campaigns for overlap' },
          { action: 'Assess target sector alignment' },
          { action: 'Generate detection rules (Sigma/YARA)' },
          { action: 'Document attribution confidence and evidence' },
        ]),
      },
      {
        id: 'playbook-insider',
        name: 'Insider Threat Investigation',
        description: 'Investigation workflow for suspected insider threats',
        category: 'insider_threat',
        severity: 'high',
        mitreTechniques: ['T1078', 'T1530', 'T1537'],
        estimatedMinutes: 60,
        tags: ['insider', 'data-theft'],
        steps: this.makeSteps([
          { action: 'Review user access logs and anomalies' },
          { action: 'Check data transfer volumes (USB, cloud, email)' },
          { action: 'Review accessed file types and sensitivity' },
          { action: 'Check for privilege escalation attempts' },
          { action: 'Review after-hours activity patterns' },
          { action: 'Document evidence chain for HR/Legal' },
        ]),
      },
    ];
  }

  private makeSteps(
    inputs: Array<{ action: string; entityType?: EntityType }>,
  ): PlaybookStep[] {
    return inputs.map((input, i) => ({
      id: randomUUID(),
      order: i + 1,
      action: input.action,
      description: input.action,
      entityType: input.entityType,
      automated: false,
      completed: false,
    }));
  }
}
