import { randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";

export const PASSWORD_MIN_LENGTH = 8;
export const LOGIN_LOCKOUT_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return null;
}

export function hashPassword(password: string): string {
  return hashSync(password, 12);
}

/** Readable random password for Super Admin resets (no symbols required). */
export function generateRandomPassword(): string {
  return randomBytes(9).toString("base64url");
}
