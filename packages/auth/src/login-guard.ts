import { prisma } from "@fleethub/db";
import { LOGIN_LOCKOUT_MAX_ATTEMPTS, LOGIN_LOCKOUT_WINDOW_MS } from "./password-policy";

/** Single lockout scope when login is email-only (no tenant slug). */
export const LOGIN_LOCKOUT_SCOPE = "email";

export async function recordLoginAttempt(input: {
  email: string;
  tenantKey?: string;
  ip?: string | null;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: input.email.toLowerCase(),
      tenantKey: (input.tenantKey ?? LOGIN_LOCKOUT_SCOPE).toLowerCase(),
      ip: input.ip ?? null,
      success: input.success,
    },
  });
}

export async function isLoginLocked(email: string, tenantKey?: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: {
      email: email.toLowerCase(),
      tenantKey: (tenantKey ?? LOGIN_LOCKOUT_SCOPE).toLowerCase(),
      success: false,
      createdAt: { gte: since },
    },
  });
  return failures >= LOGIN_LOCKOUT_MAX_ATTEMPTS;
}
