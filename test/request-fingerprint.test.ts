import { describe, expect, it } from "vitest";

import {
  canonicalize,
  fingerprint,
} from "../src/domain/request-fingerprint.js";

describe("request fingerprinting", () => {
  it("sorts object keys recursively when canonicalizing", () => {
    expect(
      canonicalize({
        currency: "GHS",
        details: { z: 2, a: 1 },
        amount: 100,
      }),
    ).toBe('{"amount":100,"currency":"GHS","details":{"a":1,"z":2}}');
  });

  it("produces equal hashes for equivalent object key orders", () => {
    const first = { amount: 100, currency: "GHS", details: { a: 1, z: 2 } };
    const second = { details: { z: 2, a: 1 }, currency: "GHS", amount: 100 };

    expect(fingerprint(first)).toBe(fingerprint(second));
  });

  it("produces different hashes when the amount changes", () => {
    expect(fingerprint({ amount: 100 })).not.toBe(fingerprint({ amount: 500 }));
  });
});
