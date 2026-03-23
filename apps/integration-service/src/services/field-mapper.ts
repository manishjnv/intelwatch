import type { FieldMapping } from '../schemas/integration.js';
import { AppError } from '@etip/shared-utils';

/**
 * Transforms data payloads between ETIP internal format and target system format.
 * Applies configurable field mappings with optional value transforms.
 */
export class FieldMapper {
  /**
   * Apply field mappings to transform a source payload into a target payload.
   * Unmapped source fields are excluded from the result.
   */
  applyMappings(
    source: Record<string, unknown>,
    mappings: FieldMapping[],
  ): Record<string, unknown> {
    if (mappings.length === 0) return { ...source };

    const result: Record<string, unknown> = {};
    for (const mapping of mappings) {
      const value = this.getNestedValue(source, mapping.sourceField);
      if (value === undefined) continue;
      const transformed = this.applyTransform(value, mapping.transform);
      this.setNestedValue(result, mapping.targetField, transformed);
    }
    return result;
  }

  /**
   * Build a default field mapping for a given integration type.
   * Provides sensible defaults that customers can override.
   */
  getDefaultMappings(integrationType: string): FieldMapping[] {
    switch (integrationType) {
      case 'splunk_hec':
        return [
          { sourceField: 'type', targetField: 'event.ioc_type', transform: 'none' },
          { sourceField: 'value', targetField: 'event.indicator', transform: 'none' },
          { sourceField: 'severity', targetField: 'event.severity', transform: 'uppercase' },
          { sourceField: 'confidence', targetField: 'event.confidence', transform: 'none' },
          { sourceField: 'timestamp', targetField: 'time', transform: 'none' },
          { sourceField: 'description', targetField: 'event.description', transform: 'none' },
        ];
      case 'sentinel':
        return [
          { sourceField: 'type', targetField: 'IndicatorType', transform: 'none' },
          { sourceField: 'value', targetField: 'IndicatorValue', transform: 'none' },
          { sourceField: 'severity', targetField: 'Severity', transform: 'uppercase' },
          { sourceField: 'confidence', targetField: 'ConfidenceScore', transform: 'none' },
          { sourceField: 'timestamp', targetField: 'TimeGenerated', transform: 'iso_date' },
          { sourceField: 'description', targetField: 'Description', transform: 'none' },
        ];
      case 'elastic_siem':
        return [
          { sourceField: 'type', targetField: 'threat.indicator.type', transform: 'none' },
          { sourceField: 'value', targetField: 'threat.indicator.ip', transform: 'none' },
          { sourceField: 'severity', targetField: 'event.severity', transform: 'severity_map' },
          { sourceField: 'confidence', targetField: 'threat.indicator.confidence', transform: 'none' },
          { sourceField: 'timestamp', targetField: '@timestamp', transform: 'iso_date' },
          { sourceField: 'description', targetField: 'message', transform: 'none' },
        ];
      case 'servicenow':
        return [
          { sourceField: 'title', targetField: 'short_description', transform: 'none' },
          { sourceField: 'description', targetField: 'description', transform: 'none' },
          { sourceField: 'priority', targetField: 'priority', transform: 'severity_map' },
          { sourceField: 'alertId', targetField: 'correlation_id', transform: 'none' },
        ];
      case 'jira':
        return [
          { sourceField: 'title', targetField: 'summary', transform: 'none' },
          { sourceField: 'description', targetField: 'description', transform: 'none' },
          { sourceField: 'priority', targetField: 'priority.name', transform: 'severity_map' },
        ];
      default:
        return [];
    }
  }

  /** Get a value from a nested path like "event.severity". */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /** Set a value at a nested path, creating intermediate objects. */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]!] = value;
  }

  /** Apply a transform to a value. */
  private applyTransform(value: unknown, transform: string): unknown {
    switch (transform) {
      case 'none':
        return value;
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      case 'iso_date':
        return typeof value === 'string' ? new Date(value).toISOString() : value;
      case 'json_stringify':
        return JSON.stringify(value);
      case 'severity_map':
        return this.mapSeverity(value);
      default:
        throw new AppError(400, `Unknown transform: ${transform}`, 'INVALID_TRANSFORM');
    }
  }

  /** Map ETIP severity to numeric priority (1=critical, 4=low). */
  private mapSeverity(value: unknown): number {
    const map: Record<string, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
      info: 5,
    };
    if (typeof value === 'string') {
      return map[value.toLowerCase()] ?? 3;
    }
    return 3;
  }
}
