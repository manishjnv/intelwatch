import { describe, it, expect, vi } from 'vitest';
import {
  AuditEntrySchema,
  SOC2_MANDATORY_ACTIONS,
  SOC2AuditWriter,
  DEFAULT_RETENTION_DAYS,
  DATA_CLASSIFICATIONS,
  type AuditLogDB,
} from '../src/index.js';

// ── AuditEntrySchema Tests ──────────────────────────────────────────

describe('AuditEntrySchema', () => {
  const validEntry = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    tenantId: '550e8400-e29b-41d4-a716-446655440002',
    userId: '550e8400-e29b-41d4-a716-446655440003',
    sessionId: '550e8400-e29b-41d4-a716-446655440004',
    action: 'auth.login',
    resourceType: 'session',
    resourceId: 'sess-001',
    changes: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    outcome: 'success' as const,
    riskLevel: 'low' as const,
    timestamp: '2026-03-17T12:00:00.000Z',
  };

  it('validates a complete valid entry', () => {
    const result = AuditEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it('rejects entry with invalid UUID for tenantId', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, tenantId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects entry with missing action', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, action: '' });
    expect(result.success).toBe(false);
  });

  it('rejects entry with invalid outcome value', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, outcome: 'maybe' });
    expect(result.success).toBe(false);
  });

  it('accepts null userId for system-generated entries', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, userId: null });
    expect(result.success).toBe(true);
  });

  it('accepts changes as a JSON record', () => {
    const result = AuditEntrySchema.safeParse({
      ...validEntry,
      changes: { oldRole: 'viewer', newRole: 'analyst' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults riskLevel to low', () => {
    const { riskLevel: _removed, ...withoutRisk } = validEntry;
    const result = AuditEntrySchema.safeParse(withoutRisk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.riskLevel).toBe('low');
    }
  });

  it('rejects invalid IP address', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, ipAddress: 'not-an-ip' });
    expect(result.success).toBe(false);
  });

  it('accepts IPv6 addresses', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, ipAddress: '::1' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid timestamp format', () => {
    const result = AuditEntrySchema.safeParse({ ...validEntry, timestamp: 'yesterday' });
    expect(result.success).toBe(false);
  });
});

// ── SOC2_MANDATORY_ACTIONS Tests ────────────────────────────────────

describe('SOC2_MANDATORY_ACTIONS', () => {
  it('contains at least 19 mandatory actions', () => {
    expect(SOC2_MANDATORY_ACTIONS.length).toBeGreaterThanOrEqual(19);
  });

  it('includes all auth actions', () => {
    const authActions = SOC2_MANDATORY_ACTIONS.filter((a) => a.startsWith('auth.'));
    expect(authActions).toContain('auth.login');
    expect(authActions).toContain('auth.logout');
    expect(authActions).toContain('auth.login_failed');
    expect(authActions).toContain('auth.password_changed');
    expect(authActions).toContain('auth.api_key_created');
    expect(authActions).toContain('auth.api_key_revoked');
  });

  it('includes all user lifecycle actions', () => {
    const userActions = SOC2_MANDATORY_ACTIONS.filter((a) => a.startsWith('user.'));
    expect(userActions).toContain('user.created');
    expect(userActions).toContain('user.role_changed');
    expect(userActions).toContain('user.disabled');
    expect(userActions).toContain('user.deleted');
  });

  it('includes data actions (export, delete, import)', () => {
    expect(SOC2_MANDATORY_ACTIONS).toContain('data.exported');
    expect(SOC2_MANDATORY_ACTIONS).toContain('data.deleted');
    expect(SOC2_MANDATORY_ACTIONS).toContain('data.bulk_import');
  });

  it('includes admin impersonation actions', () => {
    expect(SOC2_MANDATORY_ACTIONS).toContain('admin.impersonation_started');
    expect(SOC2_MANDATORY_ACTIONS).toContain('admin.impersonation_ended');
  });

  it('has no duplicate actions', () => {
    const unique = new Set(SOC2_MANDATORY_ACTIONS);
    expect(unique.size).toBe(SOC2_MANDATORY_ACTIONS.length);
  });
});

// ── SOC2AuditWriter Tests ───────────────────────────────────────────

describe('SOC2AuditWriter', () => {
  function createMockDB(): AuditLogDB {
    return { auditLog: { create: vi.fn().mockResolvedValue({}) } };
  }

  it('record() creates an audit entry with auto-generated id and timestamp', async () => {
    const db = createMockDB();
    const writer = new SOC2AuditWriter(db);

    await writer.record({
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      sessionId: null,
      action: 'auth.login',
      resourceType: 'session',
      resourceId: 'sess-001',
      changes: null,
      ipAddress: '10.0.0.1',
      userAgent: 'test-agent',
      outcome: 'success',
      riskLevel: 'low',
    });

    expect(db.auditLog.create).toHaveBeenCalledOnce();
    const callData = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(callData.id).toBeTruthy();
    expect(callData.timestamp).toBeTruthy();
    expect(callData.action).toBe('auth.login');
    expect(callData.tenantId).toBe('550e8400-e29b-41d4-a716-446655440001');
  });

  it('record() rejects invalid entry (bad tenantId)', async () => {
    const db = createMockDB();
    const writer = new SOC2AuditWriter(db);

    await expect(
      writer.record({
        tenantId: 'not-a-uuid',
        userId: null,
        sessionId: null,
        action: 'auth.login',
        resourceType: 'session',
        resourceId: 'sess-001',
        changes: null,
        ipAddress: null,
        userAgent: null,
        outcome: 'success',
        riskLevel: 'low',
      }),
    ).rejects.toThrow('Audit entry validation failed');

    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('record() rejects invalid outcome value', async () => {
    const db = createMockDB();
    const writer = new SOC2AuditWriter(db);

    await expect(
      writer.record({
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        userId: null,
        sessionId: null,
        action: 'auth.login',
        resourceType: 'session',
        resourceId: 'sess-001',
        changes: null,
        ipAddress: null,
        userAgent: null,
        outcome: 'unknown' as 'success',
        riskLevel: 'low',
      }),
    ).rejects.toThrow('Audit entry validation failed');
  });

  it('isMandatoryAction() returns true for mandatory actions', () => {
    expect(SOC2AuditWriter.isMandatoryAction('auth.login')).toBe(true);
    expect(SOC2AuditWriter.isMandatoryAction('user.deleted')).toBe(true);
    expect(SOC2AuditWriter.isMandatoryAction('admin.impersonation_started')).toBe(true);
  });

  it('isMandatoryAction() returns false for non-mandatory actions', () => {
    expect(SOC2AuditWriter.isMandatoryAction('ioc.viewed')).toBe(false);
    expect(SOC2AuditWriter.isMandatoryAction('report.generated')).toBe(false);
  });
});

// ── GDPR Retention Constants ────────────────────────────────────────

describe('GDPR retention constants', () => {
  it('audit_logs retention is 2555 days (7 years)', () => {
    expect(DEFAULT_RETENTION_DAYS['audit_logs']).toBe(2555);
  });

  it('feed_raw_data follows 60-day archival policy', () => {
    expect(DEFAULT_RETENTION_DAYS['feed_raw_data']).toBe(60);
  });

  it('DATA_CLASSIFICATIONS includes all TLP levels and PII', () => {
    expect(DATA_CLASSIFICATIONS).toContain('TLP:WHITE');
    expect(DATA_CLASSIFICATIONS).toContain('TLP:RED');
    expect(DATA_CLASSIFICATIONS).toContain('PII');
    expect(DATA_CLASSIFICATIONS).toContain('SENSITIVE');
  });
});
