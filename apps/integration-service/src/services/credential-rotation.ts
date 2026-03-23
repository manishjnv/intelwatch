import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type {
  CredentialRotationRecord,
  RotateCredentialsInput,
} from '../schemas/integration.js';
import type { IntegrationStore } from './integration-store.js';
import type { CredentialEncryption } from './credential-encryption.js';

/**
 * P2 #14: Credential rotation with zero-downtime grace period.
 * Allows rotating API keys/tokens while maintaining a grace period
 * for the old credentials, with full rotation history.
 */
export class CredentialRotationService {
  private rotations = new Map<string, CredentialRotationRecord>();
  private rotationsByIntegration = new Map<string, string[]>(); // integrationId → rotationIds

  constructor(
    private readonly store: IntegrationStore,
    private readonly encryption: CredentialEncryption | null,
  ) {}

  /**
   * Rotate credentials for an integration.
   * Old credentials remain valid during the grace period.
   */
  rotate(
    integrationId: string,
    tenantId: string,
    input: RotateCredentialsInput,
  ): CredentialRotationRecord {
    const integration = this.store.getIntegration(integrationId, tenantId);
    if (!integration) {
      throw new AppError(404, 'Integration not found', 'NOT_FOUND');
    }

    // Mask old credentials for history
    const oldCredentialsMasked: Record<string, string> = {};
    for (const [key, value] of Object.entries(integration.credentials)) {
      if (typeof value === 'string' && value.length > 0) {
        oldCredentialsMasked[key] = this.maskValue(value);
      } else {
        oldCredentialsMasked[key] = '***';
      }
    }

    // Optionally encrypt new credentials before storing
    const encryptedCreds = this.encryption
      ? this.encryption.encryptCredentials(input.newCredentials)
      : input.newCredentials;

    // Update the integration with new credentials
    this.store.updateIntegration(integrationId, tenantId, {
      credentials: encryptedCreds,
    });

    // Create rotation record
    const now = new Date();
    const graceExpiresAt = new Date(now.getTime() + input.gracePeriodMinutes * 60 * 1000);
    const record: CredentialRotationRecord = {
      id: randomUUID(),
      integrationId,
      tenantId,
      rotatedAt: now.toISOString(),
      gracePeriodMinutes: input.gracePeriodMinutes,
      graceExpiresAt: graceExpiresAt.toISOString(),
      oldCredentialsMasked,
      status: input.gracePeriodMinutes > 0 ? 'grace_period' : 'expired',
    };

    this.rotations.set(record.id, record);

    // Track by integration
    if (!this.rotationsByIntegration.has(integrationId)) {
      this.rotationsByIntegration.set(integrationId, []);
    }
    this.rotationsByIntegration.get(integrationId)!.push(record.id);

    return record;
  }

  /** Get rotation history for an integration. */
  getRotationHistory(
    integrationId: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: CredentialRotationRecord[]; total: number } {
    const rotationIds = this.rotationsByIntegration.get(integrationId) ?? [];
    let records = rotationIds
      .map((id) => this.rotations.get(id))
      .filter((r): r is CredentialRotationRecord => r !== undefined && r.tenantId === tenantId);

    // Update statuses based on grace period expiry
    const now = new Date().toISOString();
    for (const record of records) {
      if (record.status === 'grace_period' && record.graceExpiresAt <= now) {
        record.status = 'expired';
      }
    }

    records.sort((a, b) => b.rotatedAt.localeCompare(a.rotatedAt));
    const total = records.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: records.slice(start, start + opts.limit), total };
  }

  /** Get the latest rotation for an integration. */
  getLatestRotation(integrationId: string, tenantId: string): CredentialRotationRecord | null {
    const rotationIds = this.rotationsByIntegration.get(integrationId) ?? [];
    const records = rotationIds
      .map((id) => this.rotations.get(id))
      .filter((r): r is CredentialRotationRecord => r !== undefined && r.tenantId === tenantId)
      .sort((a, b) => b.rotatedAt.localeCompare(a.rotatedAt));

    if (records.length === 0) return null;

    const latest = records[0]!;
    // Update status
    if (latest.status === 'grace_period' && latest.graceExpiresAt <= new Date().toISOString()) {
      latest.status = 'expired';
    }
    return latest;
  }

  /** Check if an integration is currently in a grace period. */
  isInGracePeriod(integrationId: string, tenantId: string): boolean {
    const latest = this.getLatestRotation(integrationId, tenantId);
    return latest?.status === 'grace_period';
  }

  /** Mask a credential value for safe display. */
  private maskValue(value: string): string {
    if (value.length <= 4) return '****';
    return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 20)) + value.slice(-2);
  }
}
