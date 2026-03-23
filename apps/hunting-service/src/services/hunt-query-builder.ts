import { AppError } from '@etip/shared-utils';
import type {
  HuntQuery,
  QueryField,
  EsDslQuery,
  EntityType,
  HuntSeverity,
} from '../schemas/hunting.js';

export interface HuntQueryBuilderConfig {
  defaultTimeRangeDays: number;
  maxResults: number;
}

/**
 * #1 Hunt Query Builder — converts structured hunt queries into Elasticsearch DSL.
 *
 * Supports: entity type filtering, field operators (eq, neq, contains, gt, gte, lt, lte,
 * exists, range), time ranges (absolute or relative), severity filtering, tag filtering,
 * pagination, and sorting.
 */
export class HuntQueryBuilder {
  private readonly config: HuntQueryBuilderConfig;

  constructor(config: HuntQueryBuilderConfig) {
    this.config = config;
  }

  /** Build a full Elasticsearch DSL query from a structured HuntQuery. */
  buildEsDsl(query: HuntQuery, tenantId: string): EsDslQuery {
    const must: unknown[] = [];
    const filter: unknown[] = [];
    const mustNot: unknown[] = [];

    // Always filter by tenant
    filter.push({ term: { tenantId } });

    // Entity type filter
    if (query.entityTypes && query.entityTypes.length > 0) {
      filter.push({ terms: { type: query.entityTypes } });
    }

    // Severity filter
    if (query.severities && query.severities.length > 0) {
      filter.push({ terms: { severity: query.severities } });
    }

    // Tag filter
    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        filter.push({ term: { tags: tag } });
      }
    }

    // Time range
    const timeRange = this.buildTimeRange(query.timeRange);
    if (timeRange) {
      filter.push(timeRange);
    }

    // Field conditions
    for (const field of query.fields) {
      const clause = this.buildFieldClause(field);
      if (clause.type === 'must_not') {
        mustNot.push(clause.clause);
      } else {
        must.push(clause.clause);
      }
    }

    const limit = Math.min(query.limit, this.config.maxResults);

    return {
      query: {
        bool: {
          must,
          filter,
          should: [],
          must_not: mustNot,
        },
      },
      size: limit,
      from: query.offset,
      sort: [{ [query.sortBy]: { order: query.sortOrder } }],
    };
  }

  /** Build time range filter clause. */
  private buildTimeRange(
    timeRange?: { from?: string; to?: string; lastDays?: number },
  ): unknown | null {
    if (!timeRange) {
      // Default: last N days
      return {
        range: {
          updatedAt: {
            gte: `now-${this.config.defaultTimeRangeDays}d`,
            lte: 'now',
          },
        },
      };
    }

    if (timeRange.lastDays) {
      return {
        range: {
          updatedAt: {
            gte: `now-${timeRange.lastDays}d`,
            lte: 'now',
          },
        },
      };
    }

    if (timeRange.from || timeRange.to) {
      const rangeClause: Record<string, string> = {};
      if (timeRange.from) rangeClause.gte = timeRange.from;
      if (timeRange.to) rangeClause.lte = timeRange.to;
      return { range: { updatedAt: rangeClause } };
    }

    return null;
  }

  /** Convert a single field condition to an ES clause. */
  private buildFieldClause(field: QueryField): { type: 'must' | 'must_not'; clause: unknown } {
    const { field: fieldName, operator, value, valueTo } = field;

    switch (operator) {
      case 'eq':
        return { type: 'must', clause: { term: { [fieldName]: value } } };

      case 'neq':
        return { type: 'must_not', clause: { term: { [fieldName]: value } } };

      case 'contains':
        if (typeof value !== 'string') {
          throw new AppError(400, 'contains operator requires string value', 'INVALID_QUERY');
        }
        return { type: 'must', clause: { wildcard: { [fieldName]: { value: `*${value}*` } } } };

      case 'gt':
        return { type: 'must', clause: { range: { [fieldName]: { gt: value } } } };

      case 'gte':
        return { type: 'must', clause: { range: { [fieldName]: { gte: value } } } };

      case 'lt':
        return { type: 'must', clause: { range: { [fieldName]: { lt: value } } } };

      case 'lte':
        return { type: 'must', clause: { range: { [fieldName]: { lte: value } } } };

      case 'exists':
        return { type: 'must', clause: { exists: { field: fieldName } } };

      case 'range':
        if (valueTo === undefined) {
          throw new AppError(400, 'range operator requires valueTo', 'INVALID_QUERY');
        }
        return { type: 'must', clause: { range: { [fieldName]: { gte: value, lte: valueTo } } } };

      default:
        throw new AppError(400, `Unknown operator: ${operator}`, 'INVALID_QUERY');
    }
  }

  /** Build a quick search query for a single entity value across common fields. */
  buildQuickSearchDsl(
    value: string,
    tenantId: string,
    entityTypes?: EntityType[],
    severities?: HuntSeverity[],
    limit: number = 50,
  ): EsDslQuery {
    const filter: unknown[] = [{ term: { tenantId } }];

    if (entityTypes && entityTypes.length > 0) {
      filter.push({ terms: { type: entityTypes } });
    }
    if (severities && severities.length > 0) {
      filter.push({ terms: { severity: severities } });
    }

    return {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: value,
                fields: ['value', 'normalizedValue', 'tags', 'description'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
          filter,
          should: [],
          must_not: [],
        },
      },
      size: Math.min(limit, this.config.maxResults),
      from: 0,
      sort: [{ _score: { order: 'desc' } }],
    };
  }

  /** Validate that a HuntQuery has at least one meaningful filter. */
  validateQuery(query: HuntQuery): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (query.fields.length === 0) {
      errors.push('At least one field condition is required');
    }

    for (const field of query.fields) {
      if (field.operator === 'range' && field.valueTo === undefined) {
        errors.push(`Field "${field.field}" uses range operator but missing valueTo`);
      }
      if (field.operator === 'contains' && typeof field.value !== 'string') {
        errors.push(`Field "${field.field}" uses contains operator but value is not a string`);
      }
    }

    if (query.limit > this.config.maxResults) {
      errors.push(`Limit ${query.limit} exceeds maximum ${this.config.maxResults}`);
    }

    return { valid: errors.length === 0, errors };
  }
}
