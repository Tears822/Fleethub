import { getSession } from "@/features/auth/server/session.service";
import { TotpSetupPanel } from "@/features/settings/ui/totp-setup-panel";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminSeguridadPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.security.title")}
      subtitle={t("superAdmin.pages.security.subtitle")}
      badge={
        <span className="text-xs font-semibold text-amber-700">
          {t("superAdmin.pages.security.productionBadge")}
        </span>
      }
    >
      <SuperAdminCard className="max-w-xl p-6">
        <TotpSetupPanel />
      </SuperAdminCard>
    </SuperAdminPageChrome>
  );
}
