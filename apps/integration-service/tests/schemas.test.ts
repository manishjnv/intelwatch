import { describe, it, expect } from 'vitest';
import {
  CreateIntegrationSchema,
  UpdateIntegrationSchema,
  SplunkHecConfigSchema,
  SentinelConfigSchema,
  ElasticSiemConfigSchema,
  WebhookConfigSchema,
  ServiceNowConfigSchema,
  JiraConfigSchema,
  BulkExportRequestSchema,
  CreateTicketSchema,
  IntegrationQuerySchema,
  FieldMappingSchema,
  PaginationSchema,
} from '../src/schemas/integration.js';

describe('Zod Schemas', () => {
  // ─── CreateIntegration ──────────────────────────────────────

  describe('CreateIntegrationSchema', () => {
    it('validates valid input', () => {
      const result = CreateIntegrationSchema.safeParse({
        name: 'Test',
        type: 'splunk_hec',
        triggers: ['alert.created'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
      const result = CreateIntegrationSchema.safeParse({
        type: 'splunk_hec',
        triggers: ['alert.created'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = CreateIntegrationSchema.safeParse({
        name: 'Test',
        type: 'invalid_type',
        triggers: ['alert.created'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty triggers', () => {
      const result = CreateIntegrationSchema.safeParse({
        name: 'Test',
        type: 'splunk_hec',
        triggers: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid trigger event', () => {
      const result = CreateIntegrationSchema.safeParse({
        name: 'Test',
        type: 'splunk_hec',
        triggers: ['invalid.event'],
      });
      expect(result.success).toBe(false);
    });

    it('defaults enabled to true', () => {
      const result = CreateIntegrationSchema.parse({
        name: 'Test',
        type: 'webhook',
        triggers: ['alert.created'],
      });
      expect(result.enabled).toBe(true);
    });
  });

  // ─── UpdateIntegration ──────────────────────────────────────

  describe('UpdateIntegrationSchema', () => {
    it('accepts partial updates', () => {
      const result = UpdateIntegrationSchema.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = UpdateIntegrationSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ─── SIEM Configs ──────────────────────────────────────────

  describe('SplunkHecConfigSchema', () => {
    it('validates valid config', () => {
      const result = SplunkHecConfigSchema.safeParse({
        type: 'splunk_hec',
        url: 'https://splunk.example.com',
        token: 'test-token',
      });
      expect(result.success).toBe(true);
    });

    it('defaults index and sourcetype', () => {
      const result = SplunkHecConfigSchema.parse({
        type: 'splunk_hec',
        url: 'https://splunk.example.com',
        token: 'test',
      });
      expect(result.index).toBe('main');
      expect(result.sourcetype).toBe('etip:alert');
    });

    it('rejects invalid URL', () => {
      const result = SplunkHecConfigSchema.safeParse({
        type: 'splunk_hec',
        url: 'not-a-url',
        token: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SentinelConfigSchema', () => {
    it('validates valid config', () => {
      const result = SentinelConfigSchema.safeParse({
        type: 'sentinel',
        workspaceId: 'ws-123',
        sharedKey: 'key123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ElasticSiemConfigSchema', () => {
    it('validates valid config', () => {
      const result = ElasticSiemConfigSchema.safeParse({
        type: 'elastic_siem',
        url: 'https://elastic.example.com',
        apiKey: 'key123',
      });
      expect(result.success).toBe(true);
    });

    it('defaults indexPattern', () => {
      const result = ElasticSiemConfigSchema.parse({
        type: 'elastic_siem',
        url: 'https://elastic.example.com',
        apiKey: 'key',
      });
      expect(result.indexPattern).toBe('etip-alerts-*');
    });
  });

  // ─── WebhookConfig ─────────────────────────────────────────

  describe('WebhookConfigSchema', () => {
    it('validates valid config', () => {
      const result = WebhookConfigSchema.safeParse({
        url: 'https://hooks.example.com/webhook',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short secret', () => {
      const result = WebhookConfigSchema.safeParse({
        url: 'https://hooks.example.com/webhook',
        secret: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('defaults method to POST', () => {
      const result = WebhookConfigSchema.parse({
        url: 'https://hooks.example.com/webhook',
      });
      expect(result.method).toBe('POST');
    });
  });

  // ─── TicketingConfigs ──────────────────────────────────────

  describe('ServiceNowConfigSchema', () => {
    it('validates valid config', () => {
      const result = ServiceNowConfigSchema.safeParse({
        type: 'servicenow',
        instanceUrl: 'https://dev12345.service-now.com',
        username: 'admin',
        password: 'password',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('JiraConfigSchema', () => {
    it('validates valid config', () => {
      const result = JiraConfigSchema.safeParse({
        type: 'jira',
        baseUrl: 'https://company.atlassian.net',
        email: 'user@company.com',
        apiToken: 'token123',
        projectKey: 'SEC',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = JiraConfigSchema.safeParse({
        type: 'jira',
        baseUrl: 'https://company.atlassian.net',
        email: 'not-an-email',
        apiToken: 'token',
        projectKey: 'SEC',
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── BulkExport ────────────────────────────────────────────

  describe('BulkExportRequestSchema', () => {
    it('validates valid request', () => {
      const result = BulkExportRequestSchema.safeParse({
        format: 'csv',
        entityType: 'iocs',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = BulkExportRequestSchema.safeParse({
        format: 'xml',
        entityType: 'iocs',
      });
      expect(result.success).toBe(false);
    });

    it('defaults limit to 1000', () => {
      const result = BulkExportRequestSchema.parse({
        format: 'json',
        entityType: 'alerts',
      });
      expect(result.limit).toBe(1000);
    });

    it('rejects limit > 10000', () => {
      const result = BulkExportRequestSchema.safeParse({
        format: 'json',
        entityType: 'alerts',
        limit: 50000,
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── CreateTicket ──────────────────────────────────────────

  describe('CreateTicketSchema', () => {
    it('validates valid ticket', () => {
      const result = CreateTicketSchema.safeParse({
        integrationId: '00000000-0000-0000-0000-000000000001',
        alertId: 'alert-1',
        title: 'Security Alert',
        description: 'Found malicious IP',
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID integrationId', () => {
      const result = CreateTicketSchema.safeParse({
        integrationId: 'not-uuid',
        alertId: 'alert-1',
        title: 'Test',
        description: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('defaults priority to medium', () => {
      const result = CreateTicketSchema.parse({
        integrationId: '00000000-0000-0000-0000-000000000001',
        alertId: 'a-1',
        title: 'Test',
        description: 'Test',
      });
      expect(result.priority).toBe('medium');
    });
  });

  // ─── FieldMapping ──────────────────────────────────────────

  describe('FieldMappingSchema', () => {
    it('validates valid mapping', () => {
      const result = FieldMappingSchema.safeParse({
        sourceField: 'type',
        targetField: 'ioc_type',
      });
      expect(result.success).toBe(true);
    });

    it('defaults transform to none', () => {
      const result = FieldMappingSchema.parse({
        sourceField: 'a',
        targetField: 'b',
      });
      expect(result.transform).toBe('none');
    });

    it('rejects invalid transform', () => {
      const result = FieldMappingSchema.safeParse({
        sourceField: 'a',
        targetField: 'b',
        transform: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Pagination ────────────────────────────────────────────

  describe('PaginationSchema', () => {
    it('defaults page and limit', () => {
      const result = PaginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('coerces string to number', () => {
      const result = PaginationSchema.parse({ page: '2', limit: '25' });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
    });

    it('rejects limit > 500', () => {
      const result = PaginationSchema.safeParse({ limit: 1000 });
      expect(result.success).toBe(false);
    });
  });

  // ─── IntegrationQuery ─────────────────────────────────────

  describe('IntegrationQuerySchema', () => {
    it('accepts type filter', () => {
      const result = IntegrationQuerySchema.parse({ type: 'splunk_hec' });
      expect(result.type).toBe('splunk_hec');
    });

    it('accepts enabled filter', () => {
      const result = IntegrationQuerySchema.parse({ enabled: 'true' });
      expect(result.enabled).toBe(true);
    });
  });
});
