import { parseUserLocaleInput } from "./user-locale";

export const FH_GUEST_LOCALE_COOKIE = "fleethub_guest_locale";

/** One year — persists UI language preference across logout for public routes. */
export const GUEST_LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type GuestLocaleCookieBuildOptions = {
  maxAge: number;
  secure: boolean;
  domain?: string;
};

function sameSiteFor(opts: GuestLocaleCookieBuildOptions): "Lax" | "None" {
  if (opts.domain) return "None";
  return "Lax";
}

/** Non-HttpOnly so Next.js and the browser can both read the preferred UI language. */
export function buildGuestLocaleSetCookieHeader(
  locale: string,
  opts: GuestLocaleCookieBuildOptions,
): string {
  const value = parseUserLocaleInput(locale) ?? "es";
  const parts = [
    `${FH_GUEST_LOCALE_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${opts.maxAge}`,
    `SameSite=${sameSiteFor(opts)}`,
  ];
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

export function parseGuestLocaleFromCookie(raw: string | null | undefined): string | null {
  return parseUserLocaleInput(raw);
}

export function guestLocaleCookieEnv(): GuestLocaleCookieBuildOptions {
  const production = process.env.NODE_ENV === "production";
  const forceSecure =
    process.env.FORCE_COOKIE_SECURE === "1" || process.env.FORCE_COOKIE_SECURE === "true";
  const domainRaw = process.env.SESSION_COOKIE_DOMAIN?.trim();
  return {
    maxAge: GUEST_LOCALE_MAX_AGE_SECONDS,
    secure: production || forceSecure,
    domain: domainRaw && domainRaw.length > 0 ? domainRaw : undefined,
  };
}

/** Prefer Catalan when Accept-Language lists it before Spanish. */
export function localeFromAcceptLanguage(header: string | null | undefined): string {
  if (!header) return "es";
  for (const part of header.split(",")) {
    const lang = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (lang.startsWith("ca")) return "ca";
    if (lang.startsWith("es")) return "es";
  }
  return "es";
}
