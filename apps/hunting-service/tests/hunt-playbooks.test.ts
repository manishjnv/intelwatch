import { describe, it, expect, beforeEach } from 'vitest';
import { HuntPlaybooks } from '../src/services/hunt-playbooks.js';

describe('Hunting Service — #12 Hunt Playbooks', () => {
  let playbooks: HuntPlaybooks;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    playbooks = new HuntPlaybooks();
  });

  it('12.1. lists all built-in playbooks', () => {
    const list = playbooks.listPlaybooks();
    expect(list.length).toBeGreaterThanOrEqual(4);
  });

  it('12.2. filters playbooks by category', () => {
    const phishing = playbooks.listPlaybooks('phishing');
    expect(phishing).toHaveLength(1);
    expect(phishing[0]!.category).toBe('phishing');
  });

  it('12.3. gets playbook by ID', () => {
    const pb = playbooks.getPlaybook('playbook-phishing');
    expect(pb).toBeDefined();
    expect(pb!.name).toBe('Phishing Investigation');
  });

  it('12.4. returns undefined for non-existent playbook', () => {
    expect(playbooks.getPlaybook('nope')).toBeUndefined();
  });

  it('12.5. playbooks have ordered steps', () => {
    const pb = playbooks.getPlaybook('playbook-apt')!;
    for (let i = 0; i < pb.steps.length; i++) {
      expect(pb.steps[i]!.order).toBe(i + 1);
    }
  });

  it('12.6. starts playbook execution', async () => {
    const execution = await playbooks.startExecution(tenantId, 'playbook-phishing', 'hunt-1');
    expect(execution.playbookId).toBe('playbook-phishing');
    expect(execution.huntId).toBe('hunt-1');
    expect(execution.completedSteps).toBe(0);
    expect(execution.totalSteps).toBeGreaterThan(0);
  });

  it('12.7. throws on starting non-existent playbook', async () => {
    await expect(playbooks.startExecution(tenantId, 'nope', 'hunt-1')).rejects.toThrow('not found');
  });

  it('12.8. completes a step', async () => {
    const execution = await playbooks.startExecution(tenantId, 'playbook-phishing', 'hunt-1');
    const stepId = execution.steps[0]!.id;
    const updated = await playbooks.completeStep(tenantId, 'hunt-1', stepId, 'Email headers collected');
    expect(updated.completedSteps).toBe(1);
    expect(updated.steps[0]!.completed).toBe(true);
    expect(updated.steps[0]!.result).toBe('Email headers collected');
  });

  it('12.9. tracks progress percentage', async () => {
    const execution = await playbooks.startExecution(tenantId, 'playbook-phishing', 'hunt-1');
    expect(await playbooks.getProgress(tenantId, 'hunt-1')).toBe(0);

    await playbooks.completeStep(tenantId, 'hunt-1', execution.steps[0]!.id);
    const progress = await playbooks.getProgress(tenantId, 'hunt-1');
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it('12.10. gets execution for a hunt', async () => {
    await playbooks.startExecution(tenantId, 'playbook-ransomware', 'hunt-1');
    const execution = await playbooks.getExecution(tenantId, 'hunt-1');
    expect(execution).toBeDefined();
    expect(execution!.playbookId).toBe('playbook-ransomware');
  });

  it('12.11. returns undefined execution for unstarted hunt', async () => {
    expect(await playbooks.getExecution(tenantId, 'nonexistent')).toBeUndefined();
  });

  it('12.12. playbooks have MITRE techniques', () => {
    const pb = playbooks.getPlaybook('playbook-apt')!;
    expect(pb.mitreTechniques.length).toBeGreaterThan(0);
  });

  it('12.13. playbooks have severity and estimated time', () => {
    const pb = playbooks.getPlaybook('playbook-ransomware')!;
    expect(pb.severity).toBe('critical');
    expect(pb.estimatedMinutes).toBeGreaterThan(0);
  });

  it('12.14. tenant isolation — another tenant cannot read the execution', async () => {
    await playbooks.startExecution(tenantId, 'playbook-phishing', 'hunt-1');
    expect(await playbooks.getExecution('other-tenant', 'hunt-1')).toBeUndefined();
  });
});
