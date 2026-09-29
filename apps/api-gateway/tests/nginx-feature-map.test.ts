/**
 * Tests for the nginx feature-map that drives the plan-feature gate (S174).
 * Parses docker/nginx/conf.d/default.conf statically — no nginx binary required.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FEATURE_KEYS } from '@etip/shared-types';

const DEFAULT_CONF_PATH = fileURLToPath(new URL('../../../docker/nginx/conf.d/default.conf', import.meta.url));
const SERVICE_AUTH_PATH = fileURLToPath(new URL('../../../docker/nginx/conf.d/service-auth.inc', import.meta.url));
const SERVICE_AUTH_SUPER_PATH = fileURLToPath(new URL('../../../docker/nginx/conf.d/service-auth-super-admin.inc', import.meta.url));

function readNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

interface LocationBlock {
  pattern: string;
  lines: string[];
}

/**
 * Line-by-line location-block parser. A top-level `location` inside `server {}` starts at
 * `location <modifier?> <pattern> {` and ends at the first following line that is exactly
 * 4-space-indented `}`. Deliberately not a `[^}]*` regex — the @etip_plan_denied body contains
 * literal `{`/`}` inside a quoted JSON string.
 */
function parseLocations(conf: string): LocationBlock[] {
  const lines = conf.split('\n');
  const blocks: LocationBlock[] = [];
  const startRe = /^\s*location\s+(?:=|\^~|~\*?)?\s*(\S+)\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(startRe);
    if (!m) continue;
    const pattern = m[1];
    const blockLines: string[] = [lines[i]];
    let j = i + 1;
    for (; j < lines.length; j++) {
      blockLines.push(lines[j]);
      if (/^ {4}\}\s*$/.test(lines[j])) break;
    }
    blocks.push({ pattern, lines: blockLines });
    i = j;
  }
  return blocks;
}

const conf = readNormalized(DEFAULT_CONF_PATH);
const serviceAuthInc = readNormalized(SERVICE_AUTH_PATH);
const serviceAuthSuperInc = readNormalized(SERVICE_AUTH_SUPER_PATH);
const locations = parseLocations(conf);

function includesPlainServiceAuth(block: LocationBlock): boolean {
  return block.lines.some((l) => /include\s+\/etc\/nginx\/conf\.d\/service-auth\.inc;/.test(l));
}

function featureOf(block: LocationBlock): string | null {
  const line = block.lines.find((l) => /set\s+\$etip_feature\s+\S+;/.test(l));
  if (!line) return null;
  const m = line.match(/set\s+\$etip_feature\s+(\S+);/);
  return m ? m[1] : null;
}

const EXPECTED_FEATURE_MAP: Record<string, string | null> = {
  '/api/v1/feeds': 'feed_subscriptions',
  '/api/v1/articles': null,
  '/api/v1/iocs': 'ioc_management',
  '/api/v1/enrichment': 'ai_enrichment',
  '/api/v1/ioc': 'ioc_management',
  '/api/v1/actors': 'threat_actors',
  '/api/v1/vulnerabilities': 'vulnerability_intel',
  '/api/v1/malware': 'malware_intel',
  '/api/v1/graph': 'graph_exploration',
  '/api/v1/correlations': 'correlation_engine',
  '/api/v1/hunts': 'threat_hunting',
  '/api/v1/drp': 'digital_risk_protection',
  '/api/v1/integrations': null,
  '/api/v1/users': null,
  '/api/v1/customization': null,
  '/api/v1/onboarding': null,
  '/api/v1/billing': null,
  '/api/v1/search': 'ioc_management',
  '/api/v1/reports': 'reports',
  '/api/v1/alerts': 'alerts',
  '/api/v1/analytics': null,
};

describe('nginx feature map — locations that include service-auth.inc', () => {
  const plainServiceAuthBlocks = locations.filter(includesPlainServiceAuth);
  const byPattern = new Map(plainServiceAuthBlocks.map((b) => [b.pattern, b]));

  it('has exactly the expected set of locations (no unreviewed new proxied location)', () => {
    const actualPatterns = [...byPattern.keys()].sort();
    const expectedPatterns = Object.keys(EXPECTED_FEATURE_MAP).sort();
    expect(actualPatterns).toEqual(expectedPatterns);
  });

  it.each(Object.entries(EXPECTED_FEATURE_MAP))('%s → %s', (pattern, expectedFeature) => {
    const block = byPattern.get(pattern);
    expect(block, `location ${pattern} not found among service-auth.inc includers`).toBeDefined();
    expect(featureOf(block!)).toBe(expectedFeature);
  });
});

/** Strip comment lines (`^\s*#`) — the /_etip_auth block has prose mentioning `set $etip_feature`. */
function nonCommentLines(text: string): string {
  return text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

describe('nginx feature map — every declared feature key is a real FeatureKey', () => {
  it('every `set $etip_feature X;` value in real directives is in FEATURE_KEYS', () => {
    const setRe = /set\s+\$etip_feature\s+(\S+);/g;
    const values: string[] = [];
    let m: RegExpExecArray | null;
    const code = nonCommentLines(conf);
    while ((m = setRe.exec(code)) !== null) {
      values.push(m[1]);
    }
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(FEATURE_KEYS, `unexpected feature key: ${v}`).toContain(v);
    }
  });
});

describe('nginx feature map — no server-level default (regression guard)', () => {
  // An auth_request subrequest shares the parent's variables and re-runs server-level rewrite
  // directives — a server-level `set $etip_feature "";` default would silently wipe the value
  // set by the calling location before it ever reaches /_etip_auth. Contract: NO set anywhere
  // outside the mapped location blocks, and none inside the two internal auth locations.
  it('no `set $etip_feature` outside the mapped location blocks (server level)', () => {
    const mappedBodies = locations
      .filter((b) => includesPlainServiceAuth(b))
      .map((b) => nonCommentLines(b.lines.join('\n')))
      .join('\n');
    const mappedSetCount = (mappedBodies.match(/set\s+\$etip_feature\s+\S+;/g) ?? []).length;
    const totalSetCount = (nonCommentLines(conf).match(/set\s+\$etip_feature\s+\S+;/g) ?? []).length;
    expect(totalSetCount).toBe(mappedSetCount);
  });

  it('`location = /_etip_auth` has no `set $etip_feature` directive', () => {
    const authBlock = locations.find((b) => b.pattern === '/_etip_auth');
    expect(authBlock).toBeDefined();
    expect(nonCommentLines(authBlock!.lines.join('\n'))).not.toMatch(/set\s+\$etip_feature\s+\S+;/);
  });

  it('`location = /_etip_auth_super_admin` has no `set $etip_feature` directive', () => {
    const authSuperBlock = locations.find((b) => b.pattern === '/_etip_auth_super_admin');
    expect(authSuperBlock).toBeDefined();
    expect(nonCommentLines(authSuperBlock!.lines.join('\n'))).not.toMatch(/set\s+\$etip_feature\s+\S+;/);
  });
});

describe('nginx feature map — proxy header, uninitialized-var handling, error_page wiring', () => {
  it('/_etip_auth proxies the feature as X-Etip-Feature and disables the uninitialized-var warning', () => {
    const authBlock = locations.find((b) => b.pattern === '/_etip_auth');
    expect(authBlock).toBeDefined();
    const body = nonCommentLines(authBlock!.lines.join('\n'));
    expect(body).toMatch(/proxy_set_header\s+X-Etip-Feature\s+\$etip_feature;/);
    expect(body).toMatch(/uninitialized_variable_warn\s+off;/);
  });

  it('service-auth.inc routes a 403 to @etip_plan_denied', () => {
    expect(serviceAuthInc).toMatch(/error_page\s+403\s*=\s*@etip_plan_denied;/);
  });

  it('service-auth-super-admin.inc does NOT route to @etip_plan_denied (its 403 is not a plan issue)', () => {
    expect(serviceAuthSuperInc).not.toMatch(/@etip_plan_denied/);
  });
});

describe('nginx feature map — @etip_plan_denied named location', () => {
  const denied = locations.find((b) => b.pattern === '@etip_plan_denied');

  it('exists, returns 403 as JSON', () => {
    expect(denied).toBeDefined();
    const text = denied!.lines.join('\n');
    expect(text).toMatch(/default_type\s+application\/json;/);
    expect(text).toMatch(/return\s+403\s+'/);
  });

  it('body, with $etip_feature interpolated, is valid FEATURE_NOT_AVAILABLE JSON', () => {
    const text = denied!.lines.join('\n');
    const returnMatch = text.match(/return\s+403\s+'([\s\S]*?)';/);
    expect(returnMatch, 'could not find single-quoted return body').toBeDefined();
    const interpolated = returnMatch![1].replace(/\$etip_feature/g, 'digital_risk_protection');
    const parsed = JSON.parse(interpolated) as { error: { code: string; feature: string } };
    expect(parsed.error.code).toBe('FEATURE_NOT_AVAILABLE');
    expect(parsed.error.feature).toBe('digital_risk_protection');
  });
});
