import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@etip/shared-utils';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { assertNodeLabel, assertRelType } from '../src/cypher-safety.js';
import { GraphRepository } from '../src/repository.js';

const INJECTION_PAYLOADS = [
  'IOC) DETACH DELETE n //',
  'cve',
  '',
  'USES]->() DELETE r //',
];

describe('cypher-safety', () => {
  describe('assertNodeLabel', () => {
    it('returns the label when it is a valid node type', () => {
      expect(assertNodeLabel('IOC')).toBe('IOC');
      expect(assertNodeLabel('AttackPattern')).toBe('AttackPattern');
    });

    it.each(INJECTION_PAYLOADS)('throws AppError(400, INVALID_GRAPH_LABEL) for %j', (payload) => {
      try {
        assertNodeLabel(payload);
        throw new Error('expected assertNodeLabel to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('INVALID_GRAPH_LABEL');
      }
    });
  });

  describe('assertRelType', () => {
    it('returns the type when it is a valid relationship type', () => {
      expect(assertRelType('USES')).toBe('USES');
    });

    it.each(INJECTION_PAYLOADS)('throws AppError(400, INVALID_GRAPH_REL_TYPE) for %j', (payload) => {
      try {
        assertRelType(payload);
        throw new Error('expected assertRelType to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('INVALID_GRAPH_REL_TYPE');
      }
    });
  });

  describe('GraphRepository.upsertNode — rejects bad labels before any query', () => {
    let repo: GraphRepository;

    beforeEach(() => {
      vi.clearAllMocks();
      repo = new GraphRepository();
    });

    it('throws before calling session.run for an injection-shaped label', async () => {
      // @ts-expect-error — intentionally passing an invalid NodeType to prove runtime guarding
      await expect(repo.upsertNode('t1', 'IOC) DETACH DELETE n //', 'node-1', {}))
        .rejects.toThrow(AppError);
      expect(mockRun).not.toHaveBeenCalled();
    });
  });
});
