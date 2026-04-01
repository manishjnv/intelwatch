/**
 * Index Lifecycle Management (ILM) policy and index template definitions.
 *
 * - ILM policy: hot → warm → cold → delete (7d / 30d / 90d)
 * - Composable index template: applies settings + mappings to `etip_*_iocs_*`
 */

import { getCommonProperties } from './mappings.js';
import { INDEX_SETTINGS } from './mappings.js';

// ── ILM Policy ───────────────────────────────────────────────────────────────

export const ILM_POLICY_NAME = 'etip-ioc-lifecycle';

/**
 * ILM policy body for the etip-ioc-lifecycle policy.
 *
 * Phases:
 *  - hot  (0-7d):   1 replica, fast storage
 *  - warm (7-30d):  force merge to 1 segment, 0 replicas, read-only
 *  - cold (30-90d): freeze index
 *  - delete (90d+): remove index (archived IOCs already in MinIO)
 */
export const ILM_POLICY_BODY = {
  policy: {
    phases: {
      hot: {
        min_age: '0ms',
        actions: {
          set_priority: { priority: 100 },
        },
      },
      warm: {
        min_age: '7d',
        actions: {
          forcemerge: { max_num_segments: 1 },
          allocate: { number_of_replicas: 0 },
          set_priority: { priority: 50 },
          readonly: {},
        },
      },
      cold: {
        min_age: '30d',
        actions: {
          freeze: {},
          set_priority: { priority: 0 },
        },
      },
      delete: {
        min_age: '90d',
        actions: {
          delete: {},
        },
      },
    },
  },
} as const;

// ── Index Template ───────────────────────────────────────────────────────────

export const INDEX_TEMPLATE_NAME = 'etip-ioc-template';

/**
 * Composable index template body.
 * Matches all per-type IOC indices via the `etip_*_iocs_*` pattern.
 * Applies ILM policy + default settings + common mappings.
 *
 * Category-specific mappings are added when the index is created
 * (via ensureTypeIndex), which merges with the template mappings.
 */
export function buildIndexTemplateBody(): Record<string, unknown> {
  return {
    index_patterns: ['etip_*_iocs_*'],
    priority: 100,
    template: {
      settings: {
        ...INDEX_SETTINGS,
        'index.lifecycle.name': ILM_POLICY_NAME,
      },
      mappings: {
        properties: getCommonProperties(),
      },
    },
  };
}
