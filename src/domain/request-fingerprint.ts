/// <reference types="node" />

import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Array position carries request meaning, so preserve it while normalizing entries.
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    // Recursive key sorting makes semantically identical JSON objects serialize alike.
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }

  return value;
}

export function canonicalize(value: unknown): string {
  const canonical = JSON.stringify(normalize(value));

  if (canonical === undefined) {
    throw new TypeError("Request value cannot be represented as JSON");
  }

  return canonical;
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
