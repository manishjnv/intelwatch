import { describe, it, expect } from 'vitest';
import {
  ListActorsSchema, CreateActorSchema, UpdateActorSchema,
  SearchActorsSchema, ExportActorsSchema, ActorParamsSchema,
  LinkedIocsSchema, TimelineSchema,
} from '../src/schemas/actor.js';

describe('Threat Actor Intel — Schemas', () => {
  describe('ListActorsSchema', () => {
    it('applies defaults for empty query', () => {
      const result = ListActorsSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('name');
      expect(result.sortOrder).toBe('asc');
    });

    it('accepts valid filters', () => {
      const result = ListActorsSchema.parse({
        page: '2', limit: '25', sortBy: 'confidence', sortOrder: 'desc',
        actorType: 'nation_state', motivation: 'espionage', country: 'Russia',
      });
      expect(result.page).toBe(2);
      expect(result.actorType).toBe('nation_state');
      expect(result.motivation).toBe('espionage');
    });

    it('rejects invalid sortBy', () => {
      expect(() => ListActorsSchema.parse({ sortBy: 'invalid' })).toThrow();
    });

    it('coerces string page to number', () => {
      const result = ListActorsSchema.parse({ page: '3' });
      expect(result.page).toBe(3);
    });

    it('rejects limit > 500', () => {
      expect(() => ListActorsSchema.parse({ limit: '501' })).toThrow();
    });
  });

  describe('CreateActorSchema', () => {
    it('creates with minimal fields', () => {
      const result = CreateActorSchema.parse({ name: 'APT28' });
      expect(result.name).toBe('APT28');
      expect(result.aliases).toEqual([]);
      expect(result.actorType).toBe('unknown');
      expect(result.motivation).toBe('unknown');
      expect(result.confidence).toBe(50);
    });

    it('accepts full profile', () => {
      const result = CreateActorSchema.parse({
        name: 'Fancy Bear',
        aliases: ['APT28', 'Sofacy', 'STRONTIUM'],
        description: 'Russian military intelligence GRU Unit 26165',
        actorType: 'nation_state',
        motivation: 'espionage',
        sophistication: 'expert',
        country: 'Russia',
        targetSectors: ['government', 'military', 'media'],
        targetRegions: ['NATO', 'Ukraine', 'EU'],
        ttps: ['T1059', 'T1059.001', 'T1566'],
        associatedMalware: ['X-Agent', 'Zebrocy'],
        confidence: 90,
        tlp: 'amber',
      });
      expect(result.aliases).toHaveLength(3);
      expect(result.sophistication).toBe('expert');
      expect(result.ttps).toHaveLength(3);
    });

    it('rejects empty name', () => {
      expect(() => CreateActorSchema.parse({ name: '' })).toThrow();
    });

    it('rejects invalid MITRE technique ID', () => {
      expect(() => CreateActorSchema.parse({ name: 'Test', ttps: ['invalid'] })).toThrow();
    });

    it('accepts valid MITRE sub-technique', () => {
      const result = CreateActorSchema.parse({ name: 'Test', ttps: ['T1059.001'] });
      expect(result.ttps).toEqual(['T1059.001']);
    });

    it('rejects confidence > 100', () => {
      expect(() => CreateActorSchema.parse({ name: 'Test', confidence: 101 })).toThrow();
    });

    it('rejects confidence < 0', () => {
      expect(() => CreateActorSchema.parse({ name: 'Test', confidence: -1 })).toThrow();
    });

    it('trims name whitespace', () => {
      const result = CreateActorSchema.parse({ name: '  APT28  ' });
      expect(result.name).toBe('APT28');
    });
  });

  describe('UpdateActorSchema', () => {
    it('accepts empty update (all optional)', () => {
      const result = UpdateActorSchema.parse({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('accepts partial update', () => {
      const result = UpdateActorSchema.parse({ confidence: 85, motivation: 'financial' });
      expect(result.confidence).toBe(85);
      expect(result.motivation).toBe('financial');
    });

    it('accepts nullable country', () => {
      const result = UpdateActorSchema.parse({ country: null });
      expect(result.country).toBeNull();
    });
  });

  describe('SearchActorsSchema', () => {
    it('requires q parameter', () => {
      expect(() => SearchActorsSchema.parse({})).toThrow();
    });

    it('parses valid search', () => {
      const result = SearchActorsSchema.parse({ q: 'APT', page: '1', limit: '20' });
      expect(result.q).toBe('APT');
      expect(result.limit).toBe(20);
    });

    it('rejects empty search term', () => {
      expect(() => SearchActorsSchema.parse({ q: '' })).toThrow();
    });
  });

  describe('ExportActorsSchema', () => {
    it('defaults to json format', () => {
      const result = ExportActorsSchema.parse({});
      expect(result.format).toBe('json');
    });

    it('accepts csv format', () => {
      const result = ExportActorsSchema.parse({ format: 'csv' });
      expect(result.format).toBe('csv');
    });

    it('accepts filters', () => {
      const result = ExportActorsSchema.parse({ format: 'csv', actorType: 'criminal' });
      expect(result.actorType).toBe('criminal');
    });
  });

  describe('ActorParamsSchema', () => {
    it('accepts valid UUID', () => {
      const result = ActorParamsSchema.parse({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
      expect(result.id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });

    it('rejects non-UUID', () => {
      expect(() => ActorParamsSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });

  describe('LinkedIocsSchema', () => {
    it('applies defaults', () => {
      const result = LinkedIocsSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });

  describe('TimelineSchema', () => {
    it('defaults to 90 days', () => {
      const result = TimelineSchema.parse({});
      expect(result.days).toBe(90);
    });

    it('rejects > 365 days', () => {
      expect(() => TimelineSchema.parse({ days: '400' })).toThrow();
    });
  });
});
