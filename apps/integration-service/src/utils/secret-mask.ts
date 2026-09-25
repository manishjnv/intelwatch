/**
 * Masks integration secrets in API responses (roadmap STEP_00B U4).
 * Secrets live in `credentials` (all values) and in nested configs under keys such as
 * siemConfig.token, siemConfig.sharedKey, ticketingConfig.apiKey, webhookConfig.secret.
 */
export const SECRET_MASK = '********';

const SECRET_KEYS = /^(token|sharedkey|apikey|apitoken|secret|password|clientsecret|accesstoken|refreshtoken)$/i;

function maskValue(value: unknown, forceMask: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => maskValue(v, forceMask));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskValue(v, forceMask || k === 'credentials' || SECRET_KEYS.test(k));
    }
    return out;
  }
  if (forceMask && typeof value === 'string' && value.length > 0) return SECRET_MASK;
  return value;
}

/** Deep copy of `obj` with every secret string replaced by SECRET_MASK. */
export function maskSecrets<T>(obj: T): T {
  return maskValue(obj, false) as T;
}

/**
 * For an update: wherever the client sent SECRET_MASK back (it only ever saw the mask),
 * keep the stored value instead of overwriting the real secret with the mask.
 */
export function restoreMaskedSecrets<T>(input: T, existing: unknown): T {
  if (input === SECRET_MASK) return existing as T;
  if (Array.isArray(input)) {
    const prev = Array.isArray(existing) ? existing : [];
    return input.map((v, i) => restoreMaskedSecrets(v, prev[i])) as T;
  }
  if (input && typeof input === 'object') {
    const prev = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = restoreMaskedSecrets(v, prev[k]);
    }
    return out as T;
  }
  return input;
}
