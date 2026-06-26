import "server-only";

import type { AppSession } from "@/domain/session.types";
import { getLocaleForSession } from "@fleethub/auth/user-locale";
import { normalizeLocale, type FleetLocale } from "@fleethub/i18n";

export async function getSessionLocale(session: AppSession): Promise<FleetLocale> {
  const raw = await getLocaleForSession(session);
  return normalizeLocale(raw);
}
