import { randomUUID } from 'crypto';
import { QUEUES } from '@etip/shared-utils';

export type ServiceStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface ServiceEntry {
  name: string;
  status: ServiceStatus;
  port: number;
  uptime?: number;
  lastCheck: string;
  message?: string;
  version?: string;
}

export interface SystemMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  uptimeSeconds: number;
  nodeVersion: string;
  timestamp: string;
}

export interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  services: ServiceEntry[];
  metrics: SystemMetrics;
  queues: QueueInfo[];
  timestamp: string;
}

/** Known ETIP services with their ports. */
const KNOWN_SERVICES: Array<{ name: string; port: number }> = [
  { name: 'api-gateway', port: 3001 },
  { name: 'ingestion-service', port: 3004 },
  { name: 'normalization-service', port: 3005 },
  { name: 'ai-enrichment-service', port: 3006 },
  { name: 'ioc-intelligence-service', port: 3007 },
  { name: 'threat-actor-service', port: 3008 },
  { name: 'malware-service', port: 3009 },
  { name: 'vulnerability-service', port: 3010 },
  { name: 'drp-service', port: 3011 },
  { name: 'threat-graph-service', port: 3012 },
  { name: 'correlation-service', port: 3013 },
  { name: 'hunting-service', port: 3014 },
  { name: 'integration-service', port: 3015 },
  { name: 'user-management-service', port: 3016 },
  { name: 'customization-service', port: 3017 },
  { name: 'onboarding-service', port: 3018 },
  { name: 'billing-service', port: 3019 },
  { name: 'admin-service', port: 3022 },
];

/** Known BullMQ queue names for depth reporting. */
const KNOWN_QUEUES = [
  QUEUES.FEED_FETCH,
  QUEUES.NORMALIZE,
  QUEUES.ENRICH_REALTIME,
  QUEUES.GRAPH_SYNC,
  QUEUES.CORRELATE,
];

/** In-memory service health registry (DECISION-013: no DB for Phase 6). */
export class HealthStore {
  private _services: Map<string, ServiceEntry>;
  private _startTime: number;

  constructor() {
    this._startTime = Date.now();
    this._services = new Map();
    for (const svc of KNOWN_SERVICES) {
      this._services.set(svc.name, {
        name: svc.name,
        port: svc.port,
        status: 'healthy',
        lastCheck: new Date().toISOString(),
      });
    }
  }

  /** Update the status of a named service. Creates entry if unknown. */
  updateServiceStatus(name: string, status: ServiceStatus, message?: string): void {
    const existing = this._services.get(name);
    const port = existing?.port ?? 0;
    this._services.set(name, {
      name,
      port,
      status,
      lastCheck: new Date().toISOString(),
      message,
    });
  }

  /** Returns the full system health snapshot. */
  getSystemHealth(): SystemHealth {
    const services = this.getServiceList();
    const overall = this._computeOverall(services);
    return {
      overall,
      services,
      metrics: this.getMetrics(),
      queues: this._getQueueInfo(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Returns all registered service entries. */
  getServiceList(): ServiceEntry[] {
    return Array.from(this._services.values());
  }

  /** Returns current system metrics (simulated for in-memory store). */
  getMetrics(): SystemMetrics {
    const used = process.memoryUsage();
    const totalMemMB = 8 * 1024; // 8GB VPS estimate
    const usedMemMB = used.rss / 1024 / 1024;
    return {
      cpuPercent: this._simulateCpu(),
      memoryPercent: Math.min(100, (usedMemMB / totalMemMB) * 100),
      diskPercent: 26, // Known from PROJECT_STATE.md: VPS at 26% disk use
      uptimeSeconds: Math.floor((Date.now() - this._startTime) / 1000),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    };
  }

  private _simulateCpu(): number {
    // Lightweight CPU approximation via process.cpuUsage()
    const start = process.cpuUsage();
    // Spin briefly to get a reading
    const startHR = process.hrtime.bigint();
    let x = 0;
    for (let i = 0; i < 1000; i++) x += i;
    void x;
    const elapsedNs = Number(process.hrtime.bigint() - startHR);
    const cpuUs = process.cpuUsage(start);
    const cpuUsTotal = cpuUs.user + cpuUs.system;
    if (elapsedNs === 0) return 0;
    return Math.min(100, (cpuUsTotal / (elapsedNs / 1000)) * 100);
  }

  private _getQueueInfo(): QueueInfo[] {
    return KNOWN_QUEUES.map((name) => ({
      name,
      waiting: 0,
      active: 0,
      failed: 0,
      completed: 0,
    }));
  }

  private _computeOverall(services: ServiceEntry[]): 'healthy' | 'degraded' | 'critical' {
    if (services.some((s) => s.status === 'critical')) return 'critical';
    if (services.some((s) => s.status === 'degraded')) return 'degraded';
    return 'healthy';
  }
}

/** Dependency map node. */
export interface DependencyNode {
  id: string;
  name: string;
  type: 'service' | 'database' | 'cache' | 'queue' | 'storage';
  status: ServiceStatus;
  port?: number;
}

/** Dependency map edge (directional). */
export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

/** Returns the static service dependency map for the ETIP platform (P0 #6). */
export function getDependencyMap(): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
  const nodes: DependencyNode[] = [
    { id: 'postgres', name: 'PostgreSQL', type: 'database', status: 'healthy' },
    { id: 'redis', name: 'Redis', type: 'cache', status: 'healthy' },
    { id: 'elasticsearch', name: 'Elasticsearch', type: 'database', status: 'healthy' },
    { id: 'neo4j', name: 'Neo4j', type: 'database', status: 'healthy' },
    { id: 'minio', name: 'MinIO', type: 'storage', status: 'healthy' },
    { id: 'api-gateway', name: 'API Gateway', type: 'service', status: 'healthy', port: 3001 },
    { id: 'ingestion', name: 'Ingestion', type: 'service', status: 'healthy', port: 3004 },
    { id: 'normalization', name: 'Normalization', type: 'service', status: 'healthy', port: 3005 },
    { id: 'enrichment', name: 'AI Enrichment', type: 'service', status: 'healthy', port: 3006 },
    { id: 'threat-graph', name: 'Threat Graph', type: 'service', status: 'healthy', port: 3012 },
    { id: 'correlation', name: 'Correlation', type: 'service', status: 'healthy', port: 3013 },
    { id: 'billing', name: 'Billing', type: 'service', status: 'healthy', port: 3019 },
    { id: 'admin', name: 'Admin', type: 'service', status: 'healthy', port: 3022 },
  ];

  const edge = (source: string, target: string, label: string): DependencyEdge => ({
    id: randomUUID(),
    source,
    target,
    label,
  });

  const edges: DependencyEdge[] = [
    edge('api-gateway', 'postgres', 'auth/sessions'),
    edge('api-gateway', 'redis', 'rate-limit/sessions'),
    edge('ingestion', 'postgres', 'feed/article storage'),
    edge('ingestion', 'redis', 'BullMQ queues'),
    edge('normalization', 'postgres', 'IOC upsert'),
    edge('normalization', 'redis', 'dedup cache'),
    edge('enrichment', 'redis', 'BullMQ + result cache'),
    edge('threat-graph', 'neo4j', 'graph nodes/edges'),
    edge('threat-graph', 'redis', 'BullMQ sync queue'),
    edge('correlation', 'redis', 'BullMQ correlate queue'),
    edge('billing', 'redis', 'usage counters'),
    edge('admin', 'redis', 'health cache'),
    edge('enrichment', 'elasticsearch', 'IOC indexing'),
  ];

  return { nodes, edges };
}
