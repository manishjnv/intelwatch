/**
 * @module MajesticMillion
 * @description Majestic Million Top-1M domain whitelist loader for false positive reduction.
 * Downloads the free Majestic CSV, caches locally, and returns a WarninglistEntry
 * compatible with WarninglistMatcher.loadCustom(). IOCs matching these domains
 * are flagged (not dropped) with a confidence penalty.
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WarninglistEntry } from './warninglist.js';

const MAJESTIC_URL = 'https://downloads.majestic.com/majestic_million.csv';
const DEFAULT_TOP_N = 100_000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface MajesticMillionConfig {
  /** Enable/disable Majestic Million loading. Default: true. */
  enabled?: boolean;
  /** How many top domains to load. Default: 100,000. */
  topN?: number;
  /** Local file cache path. Default: {tmpdir}/majestic_million.csv. */
  cachePath?: string;
  /** Max cache age in ms before re-download. Default: 7 days. */
  maxAgeMs?: number;
  /** Override download URL (for testing/mirrors). */
  url?: string;
  /** Provide CSV content directly — skips HTTP download and file cache. For testing. */
  csvContent?: string;
}

interface MajesticLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Parse Majestic Million CSV content and extract domain names.
 * CSV columns: GlobalRank, TldRank, **Domain** (index 2), TLD, RefSubNets, ...
 * @param csvContent Raw CSV string
 * @param topN Maximum number of domains to extract (default 100K)
 */
export function parseMajesticCsv(csvContent: string, topN: number = DEFAULT_TOP_N): string[] {
  const lines = csvContent.split('\n');
  const domains: string[] = [];

  // Skip header row (line 0)
  for (let i = 1; i < lines.length && domains.length < topN; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const columns = line.split(',');
    const domain = columns[2]?.trim().toLowerCase();
    if (domain && domain.length > 0) {
      domains.push(domain);
    }
  }

  return domains;
}

/**
 * Build a WarninglistEntry from a list of domains.
 * Uses type 'hostname' for subdomain matching and action 'flag' for soft handling.
 */
export function buildMajesticEntry(domains: string[]): WarninglistEntry {
  return {
    name: 'Majestic Million Top Domains',
    type: 'hostname',
    category: 'false_positive',
    action: 'flag',
    values: domains,
  };
}

/**
 * Extract the hostname from a URL string (handles defanged URLs).
 * Returns null if the URL cannot be parsed.
 */
export function extractDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Fallback: handle defanged URLs like hxxps://evil[.]com/payload
    const match = url.match(/^h[tx]{2}ps?:\/\/([^/\s?#:]+)/i);
    const host = match?.[1]?.replace(/\[\.\]/g, '.');
    return host?.toLowerCase() ?? null;
  }
}

/** Check if a cached file exists and is fresh (< maxAgeMs old). */
function isCacheFresh(cachePath: string, maxAgeMs: number): boolean {
  try {
    const stat = statSync(cachePath);
    return Date.now() - stat.mtimeMs < maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Load Majestic Million top domains as a WarninglistEntry.
 *
 * Flow:
 * 1. If csvContent provided (testing), parse directly.
 * 2. If cached file is fresh (<7 days), read from cache.
 * 3. Otherwise, download from majestic.com and save to cache.
 * 4. Parse CSV, extract top N domains.
 * 5. Return WarninglistEntry with action: 'flag'.
 *
 * Returns null if disabled or on any failure (graceful skip).
 */
export async function loadMajesticMillion(
  opts?: MajesticMillionConfig,
  logger?: MajesticLogger,
): Promise<WarninglistEntry | null> {
  const enabled = opts?.enabled ?? true;
  if (!enabled) {
    logger?.info('Majestic Million disabled — skipping');
    return null;
  }

  const topN = opts?.topN ?? DEFAULT_TOP_N;

  // Fast path: CSV content provided directly (for testing)
  if (opts?.csvContent) {
    const domains = parseMajesticCsv(opts.csvContent, topN);
    logger?.info(`Majestic Million loaded from provided content: ${domains.length} domains`);
    return buildMajesticEntry(domains);
  }

  const url = opts?.url ?? MAJESTIC_URL;
  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cachePath = opts?.cachePath ?? join(tmpdir(), 'majestic_million.csv');

  let csvContent: string | null = null;

  // Check file cache
  if (isCacheFresh(cachePath, maxAgeMs)) {
    try {
      csvContent = readFileSync(cachePath, 'utf-8');
      logger?.info(`Majestic Million loaded from cache: ${cachePath}`);
    } catch {
      // Cache read failed — will attempt download
    }
  }

  // Download if not cached or stale
  if (!csvContent) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      csvContent = await response.text();
      // Save to cache file
      try {
        writeFileSync(cachePath, csvContent, 'utf-8');
        logger?.info(`Majestic Million cached to: ${cachePath}`);
      } catch (cacheErr) {
        logger?.warn(
          `Failed to cache Majestic Million: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
        );
      }
    } catch (err) {
      logger?.warn(
        `Majestic Million download failed — skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  const domains = parseMajesticCsv(csvContent, topN);
  logger?.info(`Majestic Million whitelist loaded: ${domains.length} domains`);
  return buildMajesticEntry(domains);
}
