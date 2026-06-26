import "server-only";

import {
  FH_GUEST_LOCALE_COOKIE,
  localeFromAcceptLanguage,
  parseGuestLocaleFromCookie,
} from "@fleethub/auth/guest-locale-cookie";
import { cookies, headers } from "next/headers";
import { getSession } from "@/features/auth/server/session.service";
import { getSessionLocale } from "@/shared/i18n/user-locale.server";
import { normalizeLocale, type FleetLocale } from "@fleethub/i18n";

export async function getGuestLocale(): Promise<FleetLocale> {
  const cookieStore = await cookies();
  const fromCookie = parseGuestLocaleFromCookie(
    cookieStore.get(FH_GUEST_LOCALE_COOKIE)?.value,
  );
  if (fromCookie) return normalizeLocale(fromCookie);

  const acceptLanguage = (await headers()).get("accept-language");
  return normalizeLocale(localeFromAcceptLanguage(acceptLanguage));
}

/** Locale for the current document: tenant user preference, else guest cookie / Accept-Language. */
export async function resolveAppLocale(): Promise<FleetLocale> {
  const session = await getSession();
  if (session?.tid && session.kind === "tenant" && !session.impersonating) {
    return getSessionLocale(session);
  }
  return getGuestLocale();
}
