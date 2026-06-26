/**
 * Reads AUTH_SECRET / SESSION_SECRET for JWT signing (≥32 chars).
 * Safe to import from Edge middleware and Node servers.
 */
export function readOptionalAuthSecretBytes(): Uint8Array | null {
  const s = process.env.AUTH_SECRET ?? process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    return null;
  }
  return new TextEncoder().encode(s);
}

let cached: Uint8Array | null = null;

export function getAuthSecretBytes(): Uint8Array {
  if (!cached) {
    const b = readOptionalAuthSecretBytes();
    if (!b) {
      throw new Error("AUTH_SECRET (or SESSION_SECRET) must be set and at least 32 characters.");
    }
    cached = b;
  }
  return cached;
}
