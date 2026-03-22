import { describe, it, expect } from 'vitest';
import { generateStixLabels, isValidStixLabel, STIX_INDICATOR_LABELS } from '../src/stix-labels.js';

describe('generateStixLabels', () => {
  it('returns benign for false positives regardless of severity', () => {
    const labels = generateStixLabels('CRITICAL', 'c2_server', true);
    expect(labels).toEqual(['benign']);
  });

  it('maps HIGH severity c2_server to malicious-activity + compromised', () => {
    const labels = generateStixLabels('HIGH', 'c2_server', false);
    expect(labels).toContain('malicious-activity');
    expect(labels).toContain('compromised');
  });

  it('maps MEDIUM severity scanning to anomalous-activity', () => {
    const labels = generateStixLabels('MEDIUM', 'scanning', false);
    expect(labels).toContain('anomalous-activity');
  });

  it('maps apt_infrastructure to malicious-activity + attribution', () => {
    const labels = generateStixLabels('HIGH', 'apt_infrastructure', false);
    expect(labels).toContain('malicious-activity');
    expect(labels).toContain('attribution');
  });

  it('maps tor_exit to anonymization', () => {
    const labels = generateStixLabels('MEDIUM', 'tor_exit', false);
    expect(labels).toContain('anonymization');
  });

  it('maps INFO severity benign to benign label', () => {
    const labels = generateStixLabels('INFO', 'benign', false);
    expect(labels).toEqual(['benign']);
  });

  it('defaults to anomalous-activity for unknown category', () => {
    const labels = generateStixLabels('LOW', 'some_unknown_thing', false);
    expect(labels).toContain('anomalous-activity');
  });

  it('deduplicates labels when severity and category overlap', () => {
    const labels = generateStixLabels('HIGH', 'malware_distribution', false);
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it('all generated labels are valid STIX vocabulary', () => {
    const cases = [
      { sev: 'CRITICAL', cat: 'c2_server', fp: false },
      { sev: 'HIGH', cat: 'phishing', fp: false },
      { sev: 'MEDIUM', cat: 'tor_exit', fp: false },
      { sev: 'INFO', cat: 'cdn', fp: false },
      { sev: 'HIGH', cat: 'unknown', fp: true },
    ];
    for (const c of cases) {
      const labels = generateStixLabels(c.sev, c.cat, c.fp);
      for (const l of labels) {
        expect(isValidStixLabel(l)).toBe(true);
      }
    }
  });
});

describe('isValidStixLabel', () => {
  it('returns true for all canonical labels', () => {
    for (const l of STIX_INDICATOR_LABELS) {
      expect(isValidStixLabel(l)).toBe(true);
    }
  });

  it('returns false for invalid labels', () => {
    expect(isValidStixLabel('not-a-label')).toBe(false);
    expect(isValidStixLabel('')).toBe(false);
  });
});
