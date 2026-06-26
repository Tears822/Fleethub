import { requireTenantSession } from "@/features/auth/server/session.service";
import { loadAccountProfileForSession } from "@/features/settings/server/account-profile.queries";
import { AjustesPageClient } from "@/features/settings/ui/ajustes-page-client";
import { getSessionLocale } from "@/shared/i18n/user-locale.server";

export default async function AjustesPage() {
  const session = await requireTenantSession();
  const [locale, profile] = await Promise.all([
    getSessionLocale(session),
    loadAccountProfileForSession(session),
  ]);

  return <AjustesPageClient session={session} locale={locale} profile={profile} />;
}
