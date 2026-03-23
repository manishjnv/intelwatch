import type { HuntSessionManager } from './hunt-session-manager.js';
import type { EntityType } from '../schemas/hunting.js';

export interface ImportRow {
  type: string;
  value: string;
  notes?: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
  duplicates: number;
}

const VALID_TYPES = new Set<string>([
  'ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256',
  'email', 'cve', 'threat_actor', 'malware', 'campaign',
]);

/**
 * #14 Bulk Entity Import — CSV/STIX import of entities into active hunts.
 *
 * Parses CSV rows (type,value,notes) and STIX indicator objects,
 * validates entity types, deduplicates, and adds to the hunt session.
 */
export class BulkImport {
  private readonly sessionManager: HuntSessionManager;

  constructor(sessionManager: HuntSessionManager) {
    this.sessionManager = sessionManager;
  }

  /** Import entities from parsed CSV rows. */
  importCsv(
    tenantId: string,
    huntId: string,
    userId: string,
    rows: ImportRow[],
  ): BulkImportResult {
    // Verify hunt exists and is open
    this.sessionManager.get(tenantId, huntId);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;

      // Validate type
      if (!VALID_TYPES.has(row.type)) {
        errors.push({ row: i + 1, error: `Invalid entity type: ${row.type}` });
        skipped++;
        continue;
      }

      // Validate value
      if (!row.value || row.value.trim().length === 0) {
        errors.push({ row: i + 1, error: 'Empty value' });
        skipped++;
        continue;
      }

      try {
        const entity = this.sessionManager.addEntity(
          tenantId, huntId, userId,
          { type: row.type as EntityType, value: row.value.trim(), notes: row.notes },
        );
        // addEntity returns existing entity if duplicate (same type+value)
        const session = this.sessionManager.get(tenantId, huntId);
        const isNew = session.entities.find(
          (e) => e.id === entity.id && e.addedAt === entity.addedAt,
        );
        if (isNew) {
          imported++;
        } else {
          duplicates++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, error: message });
        skipped++;
      }
    }

    return { imported, skipped, errors, duplicates };
  }

  /** Parse a CSV string into ImportRow array. */
  parseCsv(csvContent: string): ImportRow[] {
    const lines = csvContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const rows: ImportRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Skip header row
      if (i === 0 && (line.toLowerCase().startsWith('type,') || line.toLowerCase().startsWith('"type"'))) {
        continue;
      }

      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) continue;

      rows.push({
        type: parts[0]!.toLowerCase(),
        value: parts[1]!,
        notes: parts[2] || undefined,
      });
    }

    return rows;
  }

  /** Parse STIX indicator objects into ImportRow array. */
  parseStixIndicators(stixBundle: {
    objects?: Array<{
      type?: string;
      pattern?: string;
      name?: string;
      description?: string;
    }>;
  }): ImportRow[] {
    const rows: ImportRow[] = [];
    const objects = stixBundle.objects ?? [];

    for (const obj of objects) {
      if (obj.type !== 'indicator' || !obj.pattern) continue;

      const parsed = this.parseStixPattern(obj.pattern);
      if (parsed) {
        rows.push({
          type: parsed.type,
          value: parsed.value,
          notes: obj.name || obj.description,
        });
      }
    }

    return rows;
  }

  /** Extract entity type and value from a STIX pattern. */
  private parseStixPattern(pattern: string): { type: EntityType; value: string } | null {
    const matchers: Array<{ regex: RegExp; type: EntityType }> = [
      { regex: /\[ipv4-addr:value\s*=\s*'([^']+)'\]/, type: 'ip' },
      { regex: /\[domain-name:value\s*=\s*'([^']+)'\]/, type: 'domain' },
      { regex: /\[url:value\s*=\s*'([^']+)'\]/, type: 'url' },
      { regex: /\[file:hashes\.'SHA-256'\s*=\s*'([^']+)'\]/, type: 'hash_sha256' },
      { regex: /\[file:hashes\.'SHA-1'\s*=\s*'([^']+)'\]/, type: 'hash_sha1' },
      { regex: /\[file:hashes\.'MD5'\s*=\s*'([^']+)'\]/, type: 'hash_md5' },
      { regex: /\[email-addr:value\s*=\s*'([^']+)'\]/, type: 'email' },
      { regex: /\[vulnerability:name\s*=\s*'([^']+)'\]/, type: 'cve' },
    ];

    for (const { regex, type } of matchers) {
      const match = pattern.match(regex);
      if (match && match[1]) {
        return { type, value: match[1] };
      }
    }

    return null;
  }
}
