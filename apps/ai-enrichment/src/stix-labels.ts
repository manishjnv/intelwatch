/**
 * STIX 2.1 Label Generation for IOC enrichment (#9).
 * Maps severity, threat category, and FP status to STIX 2.1 indicator labels.
 * Reference: STIX 2.1 Specification — indicator-label-ov
 */

/** STIX 2.1 indicator-label-ov canonical vocabulary */
export const STIX_INDICATOR_LABELS = [
  'anomalous-activity',
  'anonymization',
  'benign',
  'compromised',
  'malicious-activity',
  'attribution',
] as const;

export type StixLabel = (typeof STIX_INDICATOR_LABELS)[number];

/** Threat category → STIX labels mapping */
const CATEGORY_TO_STIX: Record<string, StixLabel[]> = {
  c2_server: ['malicious-activity', 'compromised'],
  malware_distribution: ['malicious-activity'],
  phishing: ['malicious-activity'],
  cryptomining: ['malicious-activity'],
  apt_infrastructure: ['malicious-activity', 'attribution'],
  scanning: ['anomalous-activity'],
  botnet: ['malicious-activity', 'compromised'],
  tor_exit: ['anonymization'],
  vpn_proxy: ['anonymization'],
  cdn: ['benign'],
  benign: ['benign'],
  unknown: ['anomalous-activity'],
};

/** Severity → base STIX label */
const SEVERITY_TO_STIX: Record<string, StixLabel> = {
  CRITICAL: 'malicious-activity',
  HIGH: 'malicious-activity',
  MEDIUM: 'anomalous-activity',
  LOW: 'anomalous-activity',
  INFO: 'benign',
};

/**
 * Generate STIX 2.1 indicator labels from enrichment data.
 * Combines severity, threat category, and false positive status.
 * @returns Deduplicated array of valid STIX labels
 */
export function generateStixLabels(
  severity: string,
  threatCategory: string,
  isFalsePositive: boolean,
): string[] {
  if (isFalsePositive) return ['benign'];

  const labels = new Set<StixLabel>();

  const sevLabel = SEVERITY_TO_STIX[severity];
  if (sevLabel) labels.add(sevLabel);

  const catLabels = CATEGORY_TO_STIX[threatCategory];
  if (catLabels) {
    for (const l of catLabels) labels.add(l);
  }

  if (labels.size === 0) labels.add('anomalous-activity');

  return Array.from(labels);
}

/** Validate that a label is in the STIX 2.1 vocabulary */
export function isValidStixLabel(label: string): boolean {
  return (STIX_INDICATOR_LABELS as readonly string[]).includes(label);
}
