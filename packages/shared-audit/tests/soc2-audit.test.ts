import { describe, it, expect, vi } from 'vitest';
import { AuditEntrySchema, SOC2_MANDATORY_ACTIONS, SOC2AuditWriter, DEFAULT_RETENTION_DAYS, DATA_CLASSIFICATIONS, type AuditLogDB } from '../src/index.js';

describe('AuditEntrySchema', () => {
  const validEntry = { id: '550e8400-e29b-41d4-a716-446655440001', tenantId: '550e8400-e29b-41d4-a716-446655440002', userId: '550e8400-e29b-41d4-a716-446655440003', sessionId: '550e8400-e29b-41d4-a716-446655440004', action: 'auth.login', resourceType: 'session', resourceId: 'sess-001', changes: null, ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0', outcome: 'success' as const, riskLevel: 'low' as const, timestamp: '2026-03-17T12:00:00.000Z' };

  it('validates a complete valid entry', () => { expect(AuditEntrySchema.safeParse(validEntry).success).toBe(true); });
  it('rejects invalid UUID for tenantId', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, tenantId: 'bad' }).success).toBe(false); });
  it('rejects empty action', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, action: '' }).success).toBe(false); });
  it('rejects invalid outcome', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, outcome: 'maybe' }).success).toBe(false); });
  it('accepts null userId', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, userId: null }).success).toBe(true); });
  it('accepts changes as JSON record', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, changes: { oldRole: 'viewer' } }).success).toBe(true); });
  it('defaults riskLevel to low', () => { const { riskLevel: _, ...noRisk } = validEntry; const r = AuditEntrySchema.safeParse(noRisk); expect(r.success).toBe(true); if (r.success) expect(r.data.riskLevel).toBe('low'); });
  it('rejects invalid IP', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, ipAddress: 'not-ip' }).success).toBe(false); });
  it('accepts IPv6', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, ipAddress: '::1' }).success).toBe(true); });
  it('rejects invalid timestamp', () => { expect(AuditEntrySchema.safeParse({ ...validEntry, timestamp: 'yesterday' }).success).toBe(false); });
});

describe('SOC2_MANDATORY_ACTIONS', () => {
  it('has >= 19 actions', () => { expect(SOC2_MANDATORY_ACTIONS.length).toBeGreaterThanOrEqual(19); });
  it('includes auth actions', () => { expect(SOC2_MANDATORY_ACTIONS).toContain('auth.login'); expect(SOC2_MANDATORY_ACTIONS).toContain('auth.logout'); });
  it('includes user actions', () => { expect(SOC2_MANDATORY_ACTIONS).toContain('user.created'); expect(SOC2_MANDATORY_ACTIONS).toContain('user.deleted'); });
  it('includes data actions', () => { expect(SOC2_MANDATORY_ACTIONS).toContain('data.exported'); expect(SOC2_MANDATORY_ACTIONS).toContain('data.deleted'); });
  it('includes admin actions', () => { expect(SOC2_MANDATORY_ACTIONS).toContain('admin.impersonation_started'); });
  it('has no duplicates', () => { expect(new Set(SOC2_MANDATORY_ACTIONS).size).toBe(SOC2_MANDATORY_ACTIONS.length); });
});

describe('SOC2AuditWriter', () => {
  function createMockDB(): AuditLogDB { return { auditLog: { create: vi.fn().mockResolvedValue({}) } }; }

  it('record() creates entry with auto id + timestamp', async () => {
    const db = createMockDB(); const writer = new SOC2AuditWriter(db);
    await writer.record({ tenantId: '550e8400-e29b-41d4-a716-446655440001', userId: '550e8400-e29b-41d4-a716-446655440002', sessionId: null, action: 'auth.login', resourceType: 'session', resourceId: 'sess-001', changes: null, ipAddress: '10.0.0.1', userAgent: 'test', outcome: 'success', riskLevel: 'low' });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
    const data = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(data.id).toBeTruthy(); expect(data.timestamp).toBeTruthy(); expect(data.action).toBe('auth.login');
  });
  it('record() rejects invalid tenantId', async () => {
    const db = createMockDB(); const writer = new SOC2AuditWriter(db);
    await expect(writer.record({ tenantId: 'bad', userId: null, sessionId: null, action: 'auth.login', resourceType: 'session', resourceId: 's', changes: null, ipAddress: null, userAgent: null, outcome: 'success', riskLevel: 'low' })).rejects.toThrow('Audit entry validation failed');
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('isMandatoryAction() true for mandatory', () => { expect(SOC2AuditWriter.isMandatoryAction('auth.login')).toBe(true); });
  it('isMandatoryAction() false for non-mandatory', () => { expect(SOC2AuditWriter.isMandatoryAction('ioc.viewed')).toBe(false); });
});

describe('GDPR retention', () => {
  it('audit_logs = 2555 days', () => { expect(DEFAULT_RETENTION_DAYS['audit_logs']).toBe(2555); });
  it('feed_raw_data = 60 days', () => { expect(DEFAULT_RETENTION_DAYS['feed_raw_data']).toBe(60); });
  it('DATA_CLASSIFICATIONS has TLP + PII', () => { expect(DATA_CLASSIFICATIONS).toContain('TLP:RED'); expect(DATA_CLASSIFICATIONS).toContain('PII'); });
});
