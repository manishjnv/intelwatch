import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';
import { ChecklistPersistence } from '../src/services/checklist-persistence.js';

describe('ChecklistPersistence', () => {
  let wizardStore: WizardStore;
  let persistence: ChecklistPersistence;

  beforeEach(async () => {
    wizardStore = new WizardStore();
    persistence = new ChecklistPersistence(wizardStore);
    await wizardStore.getOrCreate('t1');
  });

  describe('save', () => {
    it('saves a snapshot of current wizard state', async () => {
      const snapshot = await persistence.save('t1');
      expect(snapshot.tenantId).toBe('t1');
      expect(snapshot.version).toBe(1);
      expect(snapshot.savedAt).toBeDefined();
      expect(snapshot.wizardState).toBeDefined();
    });

    it('increments version on each save', async () => {
      await persistence.save('t1');
      const second = await persistence.save('t1');
      expect(second.version).toBe(2);
    });

    it('keeps max 10 snapshots', async () => {
      for (let i = 0; i < 15; i++) {
        await persistence.save('t1');
      }
      const snapshots = persistence.listSnapshots('t1');
      expect(snapshots.length).toBeLessThanOrEqual(10);
    });
  });

  describe('restore', () => {
    it('returns latest snapshot', async () => {
      await wizardStore.completeStep('t1', 'welcome');
      await persistence.save('t1');
      const snapshot = persistence.restore('t1');
      expect(snapshot.wizardState.steps.welcome).toBe('completed');
    });

    it('throws when no saved state', () => {
      expect(() => persistence.restore('t2')).toThrow('No saved onboarding state found');
    });
  });

  describe('listSnapshots', () => {
    it('returns empty for new tenant', () => {
      const snapshots = persistence.listSnapshots('t2');
      expect(snapshots).toEqual([]);
    });

    it('returns all snapshots in order', async () => {
      await persistence.save('t1');
      await persistence.save('t1');
      await persistence.save('t1');
      const snapshots = persistence.listSnapshots('t1');
      expect(snapshots).toHaveLength(3);
      expect(snapshots[0].version).toBe(1);
      expect(snapshots[2].version).toBe(3);
    });
  });

  describe('getVersion', () => {
    it('returns specific snapshot version', async () => {
      await persistence.save('t1');
      await persistence.save('t1');
      const snapshot = persistence.getVersion('t1', 1);
      expect(snapshot.version).toBe(1);
    });

    it('throws for nonexistent version', async () => {
      await persistence.save('t1');
      expect(() => persistence.getVersion('t1', 99)).toThrow('Snapshot version 99 not found');
    });

    it('throws for tenant with no snapshots', () => {
      expect(() => persistence.getVersion('t2', 1)).toThrow('No saved onboarding state found');
    });
  });

  describe('clear', () => {
    it('removes all snapshots', async () => {
      await persistence.save('t1');
      await persistence.save('t1');
      persistence.clear('t1');
      expect(persistence.hasSavedState('t1')).toBe(false);
    });
  });

  describe('hasSavedState', () => {
    it('returns false for no snapshots', () => {
      expect(persistence.hasSavedState('t1')).toBe(false);
    });

    it('returns true after save', async () => {
      await persistence.save('t1');
      expect(persistence.hasSavedState('t1')).toBe(true);
    });
  });
});
