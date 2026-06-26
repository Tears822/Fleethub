import "server-only";

import type { AppSession } from "@/domain/session.types";
import { createTranslator, type FleetLocale, type Translator } from "@fleethub/i18n";
import { getSessionLocale } from "./user-locale.server";

export async function getSessionTranslator(session: AppSession): Promise<{
  locale: FleetLocale;
  t: Translator;
}> {
  const locale = await getSessionLocale(session);
  return { locale, t: createTranslator(locale) };
}
