import { createHash, randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import { hashSync, compareSync } from "bcryptjs";

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function getTotpUri(email: string, secret: string, issuer = "FleetHub"): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  return authenticator.verify({ token: normalized, secret });
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = randomBytes(3).toString("hex").toUpperCase();
    codes.push(`${part.slice(0, 4)}-${part.slice(4, 8)}`);
  }
  return codes;
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map((c) => hashSync(c.replace(/\s/g, ""), 10));
}

export function verifyBackupCode(
  code: string,
  hashes: string[] | null | undefined,
): { ok: boolean; index: number } {
  if (!hashes?.length) return { ok: false, index: -1 };
  const normalized = code.replace(/\s/g, "").toUpperCase();
  const idx = hashes.findIndex((h) => compareSync(normalized, h));
  return { ok: idx >= 0, index: idx };
}

export function consumeBackupHash(
  hashes: string[] | null | undefined,
  index: number,
): string[] {
  if (!hashes || index < 0) return hashes ?? [];
  return hashes.filter((_, i) => i !== index);
}
