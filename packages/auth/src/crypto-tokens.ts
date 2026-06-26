import { createHash, randomBytes } from "node:crypto";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
