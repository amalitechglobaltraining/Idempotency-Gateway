import { createHash } from 'crypto';

/**
 * Produce a stable, canonical string for any JSON-ish value so that two
 * semantically identical request bodies hash to the same fingerprint:
 *
 *  - object key order is NOT significant  -> keys are sorted
 *  - array order IS significant           -> arrays are preserved in order
 *  - Unicode encoding is NOT significant  -> strings are normalized to NFC
 *
 * Example: {amount:100,currency:"GHS"} and {currency:"GHS",amount:100} canonicalize
 * to the same string, so a client that does not preserve key order is not punished
 * with a spurious 409.
 */
export function canonicalize(value: unknown): string {
  const normalize = (v: any): any => {
    if (typeof v === 'string') return v.normalize('NFC');
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc: Record<string, unknown>, k) => {
          acc[k] = normalize(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

/**
 * SHA-256 of the canonical form. We hash rather than store the raw body so the
 * comparison is bounded (64 hex chars regardless of payload size), retains no
 * PII just for comparison, and is collision-resistant — a different charge
 * cannot masquerade as a replay.
 */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}
