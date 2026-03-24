import { createHmac } from 'node:crypto';
import type { NotificationChannel } from './channel-store.js';
import type { Alert } from './alert-store.js';
import { getLogger } from '../logger.js';

export interface NotificationResult {
  channelId: string;
  channelName: string;
  success: boolean;
  error?: string;
  signature?: string;
}

/**
 * Dispatches alert notifications to configured channels.
 * In production, each channel type would call external APIs (SMTP, Slack, HTTP).
 * Currently logs the notification — actual delivery is wired in deployment.
 */
export class Notifier {
  /** Send alert notification to a single channel. */
  async notify(channel: NotificationChannel, alert: Alert): Promise<NotificationResult> {
    const logger = getLogger();
    const base = { channelId: channel.id, channelName: channel.name };

    try {
      if (!channel.enabled) {
        return { ...base, success: false, error: 'Channel is disabled' };
      }

      switch (channel.config.type) {
        case 'email':
          return this.sendEmail(channel, alert);
        case 'slack':
          return this.sendSlack(channel, alert);
        case 'webhook':
          return this.sendWebhook(channel, alert);
        default:
          return { ...base, success: false, error: 'Unknown channel type' };
      }
    } catch (err) {
      logger.error({ channelId: channel.id, alertId: alert.id, err }, 'Notification dispatch failed');
      return { ...base, success: false, error: (err as Error).message };
    }
  }

  /** Send notifications to multiple channels. */
  async notifyAll(channels: NotificationChannel[], alert: Alert): Promise<NotificationResult[]> {
    return Promise.all(channels.map((ch) => this.notify(ch, alert)));
  }

  /** Send a test notification to verify channel config. */
  async sendTest(channel: NotificationChannel): Promise<NotificationResult> {
    const logger = getLogger();
    const base = { channelId: channel.id, channelName: channel.name };

    try {
      // Simulate sending — in production this hits external APIs
      logger.info(
        { channelId: channel.id, type: channel.config.type },
        'Test notification sent',
      );
      return { ...base, success: true };
    } catch (err) {
      return { ...base, success: false, error: (err as Error).message };
    }
  }

  /** Format alert payload for notifications. */
  formatPayload(alert: Alert): Record<string, unknown> {
    return {
      alertId: alert.id,
      title: alert.title,
      severity: alert.severity,
      status: alert.status,
      description: alert.description,
      ruleName: alert.ruleName,
      tenantId: alert.tenantId,
      createdAt: alert.createdAt,
      source: alert.source,
    };
  }

  private async sendEmail(channel: NotificationChannel, alert: Alert): Promise<NotificationResult> {
    const logger = getLogger();
    const config = channel.config;
    if (config.type !== 'email') throw new Error('Invalid channel type');

    // Log email delivery (actual SMTP wired in production)
    logger.info(
      {
        channelId: channel.id,
        recipients: config.email.recipients,
        alertId: alert.id,
        severity: alert.severity,
      },
      'Email notification dispatched',
    );

    return { channelId: channel.id, channelName: channel.name, success: true };
  }

  private async sendSlack(channel: NotificationChannel, alert: Alert): Promise<NotificationResult> {
    const logger = getLogger();
    const config = channel.config;
    if (config.type !== 'slack') throw new Error('Invalid channel type');

    // Log Slack delivery (actual webhook call wired in production)
    logger.info(
      {
        channelId: channel.id,
        slackChannel: config.slack.channel,
        alertId: alert.id,
        severity: alert.severity,
      },
      'Slack notification dispatched',
    );

    return { channelId: channel.id, channelName: channel.name, success: true };
  }

  private async sendWebhook(channel: NotificationChannel, alert: Alert): Promise<NotificationResult> {
    const logger = getLogger();
    const config = channel.config;
    if (config.type !== 'webhook') throw new Error('Invalid channel type');

    const payload = this.formatPayload(alert);
    const payloadStr = JSON.stringify(payload);

    // Compute HMAC signature if secret is configured
    const signature = config.webhook.secret
      ? this.computeHmac(payloadStr, config.webhook.secret)
      : undefined;

    // Log webhook delivery with signature info (actual HTTP call wired in production)
    logger.info(
      {
        channelId: channel.id,
        url: config.webhook.url,
        method: config.webhook.method,
        alertId: alert.id,
        signed: !!signature,
      },
      'Webhook notification dispatched',
    );

    return {
      channelId: channel.id,
      channelName: channel.name,
      success: true,
      signature,
    };
  }

  /**
   * Compute HMAC-SHA256 signature for webhook payload.
   * Consumers verify with: hmac('sha256', secret, payload) === signature header.
   */
  computeHmac(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}
