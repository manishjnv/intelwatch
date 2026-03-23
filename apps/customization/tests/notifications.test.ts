import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationStore } from '../src/services/notification-store.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';
import { ConfigInheritance } from '../src/services/config-inheritance.js';

describe('NotificationStore', () => {
  let store: NotificationStore;

  beforeEach(() => {
    const inheritance = new ConfigInheritance();
    const auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    store = new NotificationStore(inheritance, auditTrail, versioning);
  });

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  describe('getPreferences', () => {
    it('returns defaults for new user', () => {
      const prefs = store.getPreferences(TENANT, USER);
      expect(prefs.channels.in_app.enabled).toBe(true);
      expect(prefs.channels.email.enabled).toBe(false);
      expect(prefs.quietHours.enabled).toBe(false);
      expect(prefs.digest.frequency).toBe('daily');
    });

    it('includes all notification channels', () => {
      const prefs = store.getPreferences(TENANT, USER);
      expect(Object.keys(prefs.channels)).toEqual(['email', 'webhook', 'in_app']);
    });

    it('includes module toggles for all modules', () => {
      const prefs = store.getPreferences(TENANT, USER);
      expect(Object.keys(prefs.moduleToggles).length).toBe(13);
      expect(prefs.moduleToggles.ingestion).toBe(true);
    });
  });

  describe('setPreferences', () => {
    it('updates channel configuration', () => {
      const prefs = store.setPreferences(TENANT, USER, {
        channels: {
          email: { enabled: true, threshold: 'high' },
        },
      });
      expect(prefs.channels.email.enabled).toBe(true);
      expect(prefs.channels.email.threshold).toBe('high');
    });

    it('updates quiet hours', () => {
      const prefs = store.setPreferences(TENANT, USER, {
        quietHours: {
          enabled: true,
          start: '23:00',
          end: '08:00',
          timezone: 'America/New_York',
          daysOfWeek: ['sat', 'sun'],
        },
      });
      expect(prefs.quietHours.enabled).toBe(true);
      expect(prefs.quietHours.start).toBe('23:00');
      expect(prefs.quietHours.daysOfWeek).toEqual(['sat', 'sun']);
    });

    it('updates digest config', () => {
      const prefs = store.setPreferences(TENANT, USER, {
        digest: { frequency: 'hourly', modules: ['ingestion', 'enrichment'] },
      });
      expect(prefs.digest.frequency).toBe('hourly');
      expect(prefs.digest.modules).toEqual(['ingestion', 'enrichment']);
    });

    it('updates module toggles', () => {
      const prefs = store.setPreferences(TENANT, USER, {
        moduleToggles: { hunting: false, drp: false },
      });
      expect(prefs.moduleToggles.hunting).toBe(false);
      expect(prefs.moduleToggles.drp).toBe(false);
      expect(prefs.moduleToggles.ingestion).toBe(true);
    });
  });

  describe('setChannel', () => {
    it('configures a specific channel', () => {
      const config = store.setChannel(TENANT, USER, 'email', {
        enabled: true,
        threshold: 'critical',
      });
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe('critical');
    });

    it('throws for invalid channel', () => {
      expect(() =>
        store.setChannel(TENANT, USER, 'sms' as never, { enabled: true, threshold: 'low' }),
      ).toThrow('Invalid channel');
    });

    it('persists channel config', () => {
      store.setChannel(TENANT, USER, 'webhook', {
        enabled: true,
        threshold: 'medium',
        config: { url: 'https://hooks.example.com' },
      });
      const prefs = store.getPreferences(TENANT, USER);
      expect(prefs.channels.webhook.enabled).toBe(true);
      expect(prefs.channels.webhook.config.url).toBe('https://hooks.example.com');
    });
  });

  describe('removeChannel', () => {
    it('disables a channel', () => {
      store.setChannel(TENANT, USER, 'email', { enabled: true, threshold: 'low' });
      store.removeChannel(TENANT, USER, 'email');
      const prefs = store.getPreferences(TENANT, USER);
      expect(prefs.channels.email.enabled).toBe(false);
    });

    it('throws for invalid channel', () => {
      expect(() => store.removeChannel(TENANT, USER, 'invalid' as never)).toThrow('Invalid channel');
    });
  });

  describe('setQuietHours', () => {
    it('configures quiet hours', () => {
      const qh = store.setQuietHours(TENANT, USER, {
        enabled: true,
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
      });
      expect(qh.enabled).toBe(true);
      expect(qh.daysOfWeek).toHaveLength(5);
    });
  });

  describe('digest', () => {
    it('gets default digest config', () => {
      const digest = store.getDigestConfig(TENANT, USER);
      expect(digest.frequency).toBe('daily');
      expect(digest.modules.length).toBe(13);
    });

    it('updates digest frequency', () => {
      const digest = store.setDigestConfig(TENANT, USER, {
        frequency: 'realtime',
      });
      expect(digest.frequency).toBe('realtime');
    });

    it('updates digest modules', () => {
      const digest = store.setDigestConfig(TENANT, USER, {
        frequency: 'hourly',
        modules: ['ingestion', 'normalization'],
      });
      expect(digest.modules).toEqual(['ingestion', 'normalization']);
    });
  });
});
