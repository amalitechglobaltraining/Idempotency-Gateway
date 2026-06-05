import { canonicalize, fingerprint } from './body-fingerprint.util';

describe('body-fingerprint util', () => {
  it('is independent of object key order', () => {
    expect(fingerprint({ amount: 100, currency: 'GHS' })).toBe(
      fingerprint({ currency: 'GHS', amount: 100 }),
    );
  });

  it('changes when a field value changes', () => {
    const base = fingerprint({ amount: 100, currency: 'GHS' });
    expect(fingerprint({ amount: 500, currency: 'GHS' })).not.toBe(base);
    expect(fingerprint({ amount: 100, currency: 'USD' })).not.toBe(base);
  });

  it('treats NFC and NFD encodings of the same string as equal', () => {
    // Built from explicit code points so the two forms are guaranteed distinct
    // on the wire: precomposed e-acute (U+00E9) vs. e + combining acute (U+0301).
    const nfc = 'caf' + String.fromCharCode(0x00e9);
    const nfd = 'caf' + 'e' + String.fromCharCode(0x0301);
    expect(nfc).not.toBe(nfd);
    expect(fingerprint({ note: nfc })).toBe(fingerprint({ note: nfd }));
  });

  it('treats array order as significant', () => {
    expect(fingerprint({ items: [1, 2] })).not.toBe(fingerprint({ items: [2, 1] }));
  });

  it('canonicalizes equal numbers identically (100 vs 100.0)', () => {
    expect(fingerprint({ amount: 100 })).toBe(fingerprint({ amount: 100.0 }));
  });

  it('produces a 64-char hex sha256 digest', () => {
    expect(fingerprint({ amount: 100, currency: 'GHS' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicalize sorts nested keys deterministically', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});
