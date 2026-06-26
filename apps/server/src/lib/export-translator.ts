import type { AppSession } from "@fleethub/auth";
import { getLocaleForSession } from "@fleethub/auth/user-locale";
import { createTranslator, normalizeLocale, type Translator } from "@fleethub/i18n";

export async function getExportTranslator(session: AppSession): Promise<Translator> {
  const raw = await getLocaleForSession(session);
  return createTranslator(normalizeLocale(raw));
}
