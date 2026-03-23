import { describe, it, expect, beforeEach } from 'vitest';
import { HuntPlaybooks } from '../src/services/hunt-playbooks.js';

describe('Hunting Service — #12 Hunt Playbooks', () => {
  let playbooks: HuntPlaybooks;

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

  it('12.6. starts playbook execution', () => {
    const execution = playbooks.startExecution('playbook-phishing', 'hunt-1');
    expect(execution.playbookId).toBe('playbook-phishing');
    expect(execution.huntId).toBe('hunt-1');
    expect(execution.completedSteps).toBe(0);
    expect(execution.totalSteps).toBeGreaterThan(0);
  });

  it('12.7. throws on starting non-existent playbook', () => {
    expect(() => playbooks.startExecution('nope', 'hunt-1')).toThrow('not found');
  });

  it('12.8. completes a step', () => {
    const execution = playbooks.startExecution('playbook-phishing', 'hunt-1');
    const stepId = execution.steps[0]!.id;
    const updated = playbooks.completeStep('hunt-1', stepId, 'Email headers collected');
    expect(updated.completedSteps).toBe(1);
    expect(updated.steps[0]!.completed).toBe(true);
    expect(updated.steps[0]!.result).toBe('Email headers collected');
  });

  it('12.9. tracks progress percentage', () => {
    const execution = playbooks.startExecution('playbook-phishing', 'hunt-1');
    expect(playbooks.getProgress('hunt-1')).toBe(0);

    playbooks.completeStep('hunt-1', execution.steps[0]!.id);
    const progress = playbooks.getProgress('hunt-1');
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it('12.10. gets execution for a hunt', () => {
    playbooks.startExecution('playbook-ransomware', 'hunt-1');
    const execution = playbooks.getExecution('hunt-1');
    expect(execution).toBeDefined();
    expect(execution!.playbookId).toBe('playbook-ransomware');
  });

  it('12.11. returns undefined execution for unstarted hunt', () => {
    expect(playbooks.getExecution('nonexistent')).toBeUndefined();
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
});
