import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';

export interface ConfigVersion {
  id: string;
  tenantId: string;
  section: string;
  version: number;
  config: Record<string, unknown>;
  userId: string;
  createdAt: string;
  description?: string;
}

export class ConfigVersioning {
  private versions = new Map<string, ConfigVersion>();
  private counters = new Map<string, number>();

  snapshot(
    tenantId: string,
    section: string,
    config: Record<string, unknown>,
    userId: string,
    description?: string,
  ): ConfigVersion {
    const counterKey = `${tenantId}:${section}`;
    const nextVersion = (this.counters.get(counterKey) ?? 0) + 1;
    this.counters.set(counterKey, nextVersion);

    const entry: ConfigVersion = {
      id: randomUUID(),
      tenantId,
      section,
      version: nextVersion,
      config: structuredClone(config),
      userId,
      createdAt: new Date().toISOString(),
      description,
    };

    this.versions.set(entry.id, entry);
    return entry;
  }

  listVersions(
    tenantId: string,
    section: string | undefined,
    page: number,
    limit: number,
  ): { data: ConfigVersion[]; total: number } {
    let filtered = Array.from(this.versions.values()).filter(
      (v) => v.tenantId === tenantId,
    );

    if (section) filtered = filtered.filter((v) => v.section === section);

    filtered.sort((a, b) => b.version - a.version);

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return { data, total };
  }

  getVersion(tenantId: string, versionId: string): ConfigVersion | null {
    const v = this.versions.get(versionId);
    if (!v || v.tenantId !== tenantId) return null;
    return v;
  }

  rollback(tenantId: string, versionId: string): Record<string, unknown> {
    const v = this.getVersion(tenantId, versionId);
    if (!v) {
      throw new AppError(404, 'Version not found', 'VERSION_NOT_FOUND');
    }
    return structuredClone(v.config);
  }

  getLatest(tenantId: string, section: string): ConfigVersion | null {
    const all = Array.from(this.versions.values()).filter(
      (v) => v.tenantId === tenantId && v.section === section,
    );
    if (all.length === 0) return null;
    all.sort((a, b) => b.version - a.version);
    return all[0] ?? null;
  }
}
