import { randomUUID } from 'node:crypto';
import type { EntityType, HuntSeverity } from '../schemas/hunting.js';

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

/**
 * #12 Hunt Playbook Templates — pre-built investigation workflows.
 *
 * Provides ready-made playbooks for common threat scenarios (phishing,
 * ransomware, APT, insider threat, supply chain). Each playbook has
 * ordered steps that analysts follow.
 */
export class HuntPlaybooks {
  private readonly builtInPlaybooks: HuntPlaybook[];
  /** huntId → PlaybookExecution */
  private readonly executions = new Map<string, PlaybookExecution>();

  constructor() {
    this.builtInPlaybooks = this.createBuiltInPlaybooks();
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
  startExecution(playbookId: string, huntId: string): PlaybookExecution {
    const playbook = this.getPlaybook(playbookId);
    if (!playbook) {
      throw new Error(`Playbook ${playbookId} not found`);
    }

    const execution: PlaybookExecution = {
      playbookId,
      huntId,
      steps: playbook.steps.map((s) => ({ ...s, completed: false })),
      startedAt: new Date().toISOString(),
      completedSteps: 0,
      totalSteps: playbook.steps.length,
    };

    this.executions.set(huntId, execution);
    return execution;
  }

  /** Mark a step as completed. */
  completeStep(huntId: string, stepId: string, result?: string): PlaybookExecution {
    const execution = this.executions.get(huntId);
    if (!execution) {
      throw new Error(`No playbook execution for hunt ${huntId}`);
    }

    const step = execution.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    step.completed = true;
    step.completedAt = new Date().toISOString();
    step.result = result;
    execution.completedSteps = execution.steps.filter((s) => s.completed).length;

    return execution;
  }

  /** Get current execution for a hunt. */
  getExecution(huntId: string): PlaybookExecution | undefined {
    return this.executions.get(huntId);
  }

  /** Get execution progress as percentage. */
  getProgress(huntId: string): number {
    const execution = this.executions.get(huntId);
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
