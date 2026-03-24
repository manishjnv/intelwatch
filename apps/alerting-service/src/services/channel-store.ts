import { randomUUID } from 'node:crypto';
import type { CreateChannelDto, UpdateChannelDto, ChannelConfig, ChannelType } from '../schemas/alert.js';

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

/** In-memory notification channel store (DECISION-013). */
export class ChannelStore {
  private channels = new Map<string, NotificationChannel>();

  /** Create a new notification channel. */
  create(dto: CreateChannelDto): NotificationChannel {
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
    this.channels.set(channel.id, channel);
    return channel;
  }

  /** Get a channel by ID. */
  getById(id: string): NotificationChannel | undefined {
    return this.channels.get(id);
  }

  /** List channels for a tenant. */
  list(tenantId: string, opts: ListChannelsOptions): ListChannelsResult {
    let items = Array.from(this.channels.values()).filter((c) => c.tenantId === tenantId);

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
  update(id: string, dto: UpdateChannelDto): NotificationChannel | undefined {
    const channel = this.channels.get(id);
    if (!channel) return undefined;

    if (dto.name !== undefined) channel.name = dto.name;
    if (dto.config !== undefined) {
      channel.config = dto.config;
      channel.type = dto.config.type;
    }
    if (dto.enabled !== undefined) channel.enabled = dto.enabled;
    channel.updatedAt = new Date().toISOString();

    return channel;
  }

  /** Delete a channel. Returns true if deleted. */
  delete(id: string): boolean {
    return this.channels.delete(id);
  }

  /** Record a test result. */
  recordTest(id: string, success: boolean): NotificationChannel | undefined {
    const channel = this.channels.get(id);
    if (!channel) return undefined;
    channel.lastTestedAt = new Date().toISOString();
    channel.lastTestSuccess = success;
    return channel;
  }

  /** Get multiple channels by IDs. */
  getByIds(ids: string[]): NotificationChannel[] {
    return ids.map((id) => this.channels.get(id)).filter((c): c is NotificationChannel => c !== undefined);
  }

  /** Clear all channels (for testing). */
  clear(): void {
    this.channels.clear();
  }
}
