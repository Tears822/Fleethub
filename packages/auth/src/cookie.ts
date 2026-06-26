import { FH_PLATFORM_SESSION_COOKIE, FH_SESSION_COOKIE } from "./constants";
import { SESSION_MAX_AGE_SECONDS } from "./session-duration";

export type SessionCookieBuildOptions = {
  /** Seconds until expiry */
  maxAge: number;
  /** Production / HTTPS */
  secure: boolean;
  /**
   * Optional e.g. `.activex.rest` when the API host differs from the web host
   * (requires `SameSite=None` + `Secure` in browsers).
   */
  domain?: string;
};

function sameSiteFor(opts: SessionCookieBuildOptions): "Lax" | "None" {
  if (opts.domain) {
    return "None";
  }
  return "Lax";
}

function buildCookieSetHeader(
  name: string,
  token: string,
  opts: SessionCookieBuildOptions,
): string {
  const parts = [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${opts.maxAge}`,
    `SameSite=${sameSiteFor(opts)}`,
  ];
  if (opts.secure) {
    parts.push("Secure");
  }
  if (opts.domain) {
    parts.push(`Domain=${opts.domain}`);
  }
  return parts.join("; ");
}

function buildCookieClearHeader(name: string, opts: SessionCookieBuildOptions): string {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${sameSiteFor(opts)}`,
  ];
  if (opts.secure) {
    parts.push("Secure");
  }
  if (opts.domain) {
    parts.push(`Domain=${opts.domain}`);
  }
  return parts.join("; ");
}

/** `Set-Cookie` value for a new session (single header line after `Set-Cookie: `). */
export function buildSessionSetCookieHeader(token: string, opts: SessionCookieBuildOptions): string {
  return buildCookieSetHeader(FH_SESSION_COOKIE, token, opts);
}

export function buildPlatformSessionSetCookieHeader(
  token: string,
  opts: SessionCookieBuildOptions,
): string {
  return buildCookieSetHeader(FH_PLATFORM_SESSION_COOKIE, token, opts);
}

/** `Set-Cookie` to clear the session cookie. */
export function buildSessionClearCookieHeader(opts: SessionCookieBuildOptions): string {
  return buildCookieClearHeader(FH_SESSION_COOKIE, opts);
}

export function buildPlatformSessionClearCookieHeader(opts: SessionCookieBuildOptions): string {
  return buildCookieClearHeader(FH_PLATFORM_SESSION_COOKIE, opts);
}

export function sessionCookieEnv(): SessionCookieBuildOptions {
  const production = process.env.NODE_ENV === "production";
  const forceSecure =
    process.env.FORCE_COOKIE_SECURE === "1" || process.env.FORCE_COOKIE_SECURE === "true";
  const domainRaw = process.env.SESSION_COOKIE_DOMAIN?.trim();
  return {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: production || forceSecure,
    domain: domainRaw && domainRaw.length > 0 ? domainRaw : undefined,
  };
}
