import { randomUUID } from 'node:crypto';
import type { CreateChannelDto, UpdateChannelDto, ChannelConfig, ChannelType } from '../schemas/alert.js';
import { MemoryRepo, type Repo } from '../repository.js';

export interface NotificationChannel {
  id: string;
  name: string;
  tenantId: string;
  type: ChannelType;
  config: ChannelConfig;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListChannelsOptions {
  type?: string;
  page: number;
  limit: number;
}

export interface ListChannelsResult {
  data: NotificationChannel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Notification channel store (Step 3 S154). Backed by Postgres via `repo` in
 * production (config encrypted at rest); an in-memory MemoryRepo when no repo
 * is injected (dev/test only).
 */
export class ChannelStore {
  constructor(private readonly repo: Repo<NotificationChannel> = new MemoryRepo<NotificationChannel>()) {}

  /** Create a new notification channel. */
  async create(dto: CreateChannelDto): Promise<NotificationChannel> {
    const now = new Date().toISOString();
    const channel: NotificationChannel = {
      id: randomUUID(),
      name: dto.name,
      tenantId: dto.tenantId,
      type: dto.config.type,
      config: dto.config,
      enabled: dto.enabled,
      lastTestedAt: null,
      lastTestSuccess: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.save(channel);
  }

  /** Get a channel by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<NotificationChannel | undefined> {
    const channel = await this.repo.get(id);
    if (!channel) return undefined;
    if (tenantId !== undefined && channel.tenantId !== tenantId) return undefined;
    return channel;
  }

  /** List channels for a tenant. */
  // ponytail: filters/sort/paginate in JS over the tenant's rows; push into SQL if a tenant ever has thousands of channels.
  async list(tenantId: string, opts: ListChannelsOptions): Promise<ListChannelsResult> {
    let items = await this.repo.list(tenantId);

    if (opts.type) {
      items = items.filter((c) => c.type === opts.type);
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Update a channel. */
  async update(id: string, dto: UpdateChannelDto, tenantId?: string): Promise<NotificationChannel | undefined> {
    const channel = await this.getById(id, tenantId);
    if (!channel) return undefined;

    const updated: NotificationChannel = {
      ...channel,
      name: dto.name ?? channel.name,
      config: dto.config ?? channel.config,
      type: dto.config ? dto.config.type : channel.type,
      enabled: dto.enabled ?? channel.enabled,
      updatedAt: new Date().toISOString(),
    };
    return this.repo.save(updated);
  }

  /** Delete a channel. Returns true if deleted. */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    const channel = await this.getById(id, tenantId);
    if (!channel) return false;
    return this.repo.delete(id);
  }

  /** Record a test result. */
  async recordTest(id: string, success: boolean): Promise<NotificationChannel | undefined> {
    const channel = await this.repo.get(id);
    if (!channel) return undefined;
    return this.repo.save({ ...channel, lastTestedAt: new Date().toISOString(), lastTestSuccess: success });
  }

  /** Get multiple channels by IDs, optionally scoped to a tenant. */
  async getByIds(ids: string[], tenantId?: string): Promise<NotificationChannel[]> {
    if (tenantId !== undefined) {
      const items = await this.repo.list(tenantId);
      const idSet = new Set(ids);
      return items.filter((c) => idSet.has(c.id));
    }
    const results = await Promise.all(ids.map((id) => this.repo.get(id)));
    return results.filter((c): c is NotificationChannel => c !== null);
  }

  /** Clear all channels (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryRepo) this.repo.clear();
  }
}
