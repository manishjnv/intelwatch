import { AppError } from '@etip/shared-utils';
import {
  NOTIFICATION_CHANNELS,
  PLATFORM_MODULES,
  type NotificationChannel,
  type SetChannelInput,
  type SetQuietHoursInput,
  type SetDigestInput,
  type SetNotificationPrefsInput,
} from '../schemas/customization.js';
import type { AuditTrail } from './audit-trail.js';
import type { ConfigVersioning } from './config-versioning.js';
import type { ConfigInheritance } from './config-inheritance.js';

export interface ChannelConfig {
  enabled: boolean;
  threshold: string;
  config: Record<string, string>;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  daysOfWeek: string[];
}

export interface DigestConfig {
  frequency: string;
  modules: string[];
}

export interface NotificationPreferences {
  userId: string;
  tenantId: string;
  channels: Record<string, ChannelConfig>;
  quietHours: QuietHours;
  digest: DigestConfig;
  moduleToggles: Record<string, boolean>;
  updatedAt: string;
}

export class NotificationStore {
  private preferences = new Map<string, NotificationPreferences>();

  constructor(
    private inheritance: ConfigInheritance,
    private auditTrail: AuditTrail,
    private versioning: ConfigVersioning,
  ) {}

  private userKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  private getDefault(tenantId: string, userId: string): NotificationPreferences {
    const channels: Record<string, ChannelConfig> = {};
    for (const ch of NOTIFICATION_CHANNELS) {
      channels[ch] = { enabled: ch === 'in_app', threshold: 'medium', config: {} };
    }
    const moduleToggles: Record<string, boolean> = {};
    for (const mod of PLATFORM_MODULES) {
      moduleToggles[mod] = true;
    }
    return {
      userId,
      tenantId,
      channels,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      },
      digest: {
        frequency: 'daily',
        modules: [...PLATFORM_MODULES],
      },
      moduleToggles,
      updatedAt: new Date().toISOString(),
    };
  }

  getPreferences(tenantId: string, userId: string): NotificationPreferences {
    const k = this.userKey(tenantId, userId);
    const prefs = this.preferences.get(k);
    if (prefs) return structuredClone(prefs);
    return this.getDefault(tenantId, userId);
  }

  setPreferences(
    tenantId: string,
    userId: string,
    input: SetNotificationPrefsInput,
  ): NotificationPreferences {
    const k = this.userKey(tenantId, userId);
    const existing = this.getPreferences(tenantId, userId);

    if (input.channels) {
      for (const [ch, config] of Object.entries(input.channels)) {
        existing.channels[ch] = {
          enabled: config.enabled,
          threshold: config.threshold,
          config: config.config ?? {},
        };
      }
    }
    if (input.quietHours) {
      existing.quietHours = {
        enabled: input.quietHours.enabled,
        start: input.quietHours.start,
        end: input.quietHours.end,
        timezone: input.quietHours.timezone,
        daysOfWeek: [...input.quietHours.daysOfWeek],
      };
    }
    if (input.digest) {
      existing.digest = {
        frequency: input.digest.frequency,
        modules: input.digest.modules ? [...input.digest.modules] : [...PLATFORM_MODULES],
      };
    }
    if (input.moduleToggles) {
      for (const [mod, enabled] of Object.entries(input.moduleToggles)) {
        existing.moduleToggles[mod] = enabled;
      }
    }
    existing.updatedAt = new Date().toISOString();

    this.preferences.set(k, existing);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'notifications',
      action: 'preferences.updated',
      before: null,
      after: existing as unknown as Record<string, unknown>,
    });

    return structuredClone(existing);
  }

  setChannel(
    tenantId: string,
    userId: string,
    channel: string,
    input: SetChannelInput,
  ): ChannelConfig {
    if (!NOTIFICATION_CHANNELS.includes(channel as NotificationChannel)) {
      throw new AppError(400, `Invalid channel: ${channel}`, 'INVALID_CHANNEL');
    }

    const prefs = this.getPreferences(tenantId, userId);
    prefs.channels[channel] = {
      enabled: input.enabled,
      threshold: input.threshold,
      config: input.config ?? {},
    };
    prefs.updatedAt = new Date().toISOString();

    const k = this.userKey(tenantId, userId);
    this.preferences.set(k, prefs);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'notifications',
      action: `channel.${input.enabled ? 'enabled' : 'disabled'}`,
      before: null,
      after: { channel, ...prefs.channels[channel] },
    });

    return { ...prefs.channels[channel] };
  }

  removeChannel(tenantId: string, userId: string, channel: string): void {
    if (!NOTIFICATION_CHANNELS.includes(channel as NotificationChannel)) {
      throw new AppError(400, `Invalid channel: ${channel}`, 'INVALID_CHANNEL');
    }

    const prefs = this.getPreferences(tenantId, userId);
    prefs.channels[channel] = { enabled: false, threshold: 'critical', config: {} };
    prefs.updatedAt = new Date().toISOString();

    const k = this.userKey(tenantId, userId);
    this.preferences.set(k, prefs);
  }

  setQuietHours(
    tenantId: string,
    userId: string,
    input: SetQuietHoursInput,
  ): QuietHours {
    const prefs = this.getPreferences(tenantId, userId);
    prefs.quietHours = {
      enabled: input.enabled,
      start: input.start,
      end: input.end,
      timezone: input.timezone,
      daysOfWeek: [...input.daysOfWeek],
    };
    prefs.updatedAt = new Date().toISOString();

    const k = this.userKey(tenantId, userId);
    this.preferences.set(k, prefs);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'notifications',
      action: 'quiet_hours.updated',
      before: null,
      after: prefs.quietHours as unknown as Record<string, unknown>,
    });

    return { ...prefs.quietHours };
  }

  getDigestConfig(tenantId: string, userId: string): DigestConfig {
    const prefs = this.getPreferences(tenantId, userId);
    return { ...prefs.digest };
  }

  setDigestConfig(
    tenantId: string,
    userId: string,
    input: SetDigestInput,
  ): DigestConfig {
    const prefs = this.getPreferences(tenantId, userId);
    prefs.digest = {
      frequency: input.frequency,
      modules: input.modules ? [...input.modules] : [...PLATFORM_MODULES],
    };
    prefs.updatedAt = new Date().toISOString();

    const k = this.userKey(tenantId, userId);
    this.preferences.set(k, prefs);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'notifications',
      action: 'digest.updated',
      before: null,
      after: prefs.digest as unknown as Record<string, unknown>,
    });

    return { ...prefs.digest };
  }

  getExportData(tenantId: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, prefs] of this.preferences) {
      if (key.startsWith(`${tenantId}:`)) {
        data[key] = prefs;
      }
    }
    return data;
  }

  importData(tenantId: string, _data: Record<string, unknown>, _userId: string): void {
    void tenantId;
  }
}
