import { randomUUID } from 'node:crypto';

export interface AuditEntry {
  id: string;
  tenantId: string;
  userId: string;
  section: string;
  action: string;
  timestamp: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: ConfigDiff | null;
}

export interface ConfigDiff {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; from: unknown; to: unknown }>;
}

export interface AuditInput {
  tenantId: string;
  userId: string;
  section: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditQueryOptions {
  page: number;
  limit: number;
  section?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export class AuditTrail {
  private entries: AuditEntry[] = [];

  log(input: AuditInput): string {
    const id = randomUUID();
    const diff = input.before && input.after
      ? this.diffConfigs(input.before, input.after)
      : null;

    this.entries.push({
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      section: input.section,
      action: input.action,
      timestamp: new Date().toISOString(),
      before: input.before,
      after: input.after,
      diff,
    });

    return id;
  }

  query(tenantId: string, opts: AuditQueryOptions): { data: AuditEntry[]; total: number } {
    let filtered = this.entries.filter((e) => e.tenantId === tenantId);

    if (opts.section) filtered = filtered.filter((e) => e.section === opts.section);
    if (opts.userId) filtered = filtered.filter((e) => e.userId === opts.userId);
    if (opts.from) {
      const from = new Date(opts.from).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= from);
    }
    if (opts.to) {
      const to = new Date(opts.to).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= to);
    }

    // Most recent first
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = filtered.length;
    const start = (opts.page - 1) * opts.limit;
    const data = filtered.slice(start, start + opts.limit);

    return { data, total };
  }

  diffConfigs(before: Record<string, unknown>, after: Record<string, unknown>): ConfigDiff {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ key: string; from: unknown; to: unknown }> = [];

    for (const key of allKeys) {
      const bVal = before[key];
      const aVal = after[key];
      if (bVal === undefined && aVal !== undefined) {
        added.push(key);
      } else if (bVal !== undefined && aVal === undefined) {
        removed.push(key);
      } else if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        changed.push({ key, from: bVal, to: aVal });
      }
    }

    return { added, removed, changed };
  }

  getEntryCount(tenantId: string): number {
    return this.entries.filter((e) => e.tenantId === tenantId).length;
  }
}
