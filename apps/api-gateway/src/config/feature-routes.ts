/**
 * @module api-gateway/config/feature-routes
 * @description Static map of route patterns → featureKey for quota enforcement.
 * Routes not in this map are exempt from quota checking (health, auth, billing, admin/plans, public).
 */
import type { FeatureKey } from '@etip/shared-types';

interface RouteMapping {
  pattern: RegExp;
  featureKey: FeatureKey;
}

/**
 * Ordered list of route patterns → feature keys.
 * First match wins. More specific patterns come first.
 */
const ROUTE_MAPPINGS: RouteMapping[] = [
  // Public API — all routes map to api_access (must be first to match before /iocs)
  { pattern: /^\/api\/v1\/public(\/|$)/, featureKey: 'api_access' },
  { pattern: /^\/api\/v1\/iocs(\/|$)/, featureKey: 'ioc_management' },
  { pattern: /^\/api\/v1\/threat-actors(\/|$)/, featureKey: 'threat_actors' },
  { pattern: /^\/api\/v1\/malware(\/|$)/, featureKey: 'malware_intel' },
  { pattern: /^\/api\/v1\/vulnerabilities(\/|$)/, featureKey: 'vulnerability_intel' },
  { pattern: /^\/api\/v1\/hunting(\/|$)/, featureKey: 'threat_hunting' },
  { pattern: /^\/api\/v1\/graph(\/|$)/, featureKey: 'graph_exploration' },
  { pattern: /^\/api\/v1\/drp(\/|$)/, featureKey: 'digital_risk_protection' },
  { pattern: /^\/api\/v1\/correlation(\/|$)/, featureKey: 'correlation_engine' },
  { pattern: /^\/api\/v1\/reports(\/|$)/, featureKey: 'reports' },
  { pattern: /^\/api\/v1\/enrichment(\/|$)/, featureKey: 'ai_enrichment' },
  { pattern: /^\/api\/v1\/feeds(\/|$)/, featureKey: 'feed_subscriptions' },
  { pattern: /^\/api\/v1\/users(\/|$)/, featureKey: 'users' },
  { pattern: /^\/api\/v1\/alerts(\/|$)/, featureKey: 'alerts' },
  { pattern: /^\/api\/v1\/integrations(\/|$)/, featureKey: 'api_access' },
  { pattern: /^\/api\/v1\/search(\/|$)/, featureKey: 'ioc_management' },
];

/**
 * Routes that should NEVER be quota-checked, regardless of pattern match.
 * Includes health, auth, billing, admin plan management, and public endpoints.
 */
const EXEMPT_PATTERNS: RegExp[] = [
  /^\/health/,
  /^\/ready/,
  /^\/metrics/,
  /^\/api\/v1\/auth(\/|$)/,
  /^\/api\/v1\/admin\/plans(\/|$)/,
  /^\/api\/v1\/admin\/tenants\/[^/]+\/overrides(\/|$)/,
  /^\/api\/v1\/admin\/tenants\/[^/]+\/usage(\/|$)/,
  /^\/api\/v1\/admin\/usage(\/|$)/,
  /^\/api\/v1\/billing(\/|$)/,
  /^\/api\/v1\/gateway(\/|$)/,
];

/**
 * Resolve a request's HTTP method + path to a featureKey for quota enforcement.
 * @returns featureKey if quota applies, null if exempt
 */
export function resolveFeatureKey(_method: string, path: string): FeatureKey | null {
  // Strip query string for pattern matching
  const cleanPath = path.split('?')[0] ?? path;

  // Check exemptions first
  for (const exempt of EXEMPT_PATTERNS) {
    if (exempt.test(cleanPath)) return null;
  }

  // Match against feature routes
  for (const mapping of ROUTE_MAPPINGS) {
    if (mapping.pattern.test(cleanPath)) {
      return mapping.featureKey;
    }
  }

  // No match → no quota enforcement
  return null;
}
