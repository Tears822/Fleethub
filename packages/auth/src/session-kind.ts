import type { AppSession } from "./types";

export const PLATFORM_LOGIN_SLUG = "platform";

export function isPlatformSession(session: AppSession): boolean {
  return session.kind === "platform";
}

export function isTenantSession(session: AppSession): boolean {
  return session.kind === "tenant" || (!session.kind && Boolean(session.tid));
}

export function isImpersonatingSession(session: AppSession): boolean {
  return Boolean(session.impersonating && session.kind === "tenant");
}

export function defaultRedirectForSession(session: AppSession): string {
  return isPlatformSession(session) ? "/super-admin" : "/dashboard";
}
