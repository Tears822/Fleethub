import { canExportTenantData, canManageShifts } from "@/domain/rbac.policy";
import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { refreshTodayDriverPlatformMetrics } from "@fleethub/auth";
import { listAppsUsageToday } from "@/features/apps/server/apps-usage.queries";
import { refreshDriverConnectionsForTenantSession } from "@/features/integrations/server/refresh-driver-connections.server";
import { getTenantProductivitySettings } from "@/features/settings/server/settings.queries";
import { AppsUsageMockView } from "@/features/apps/ui/apps-usage-mock-view";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const [scope, companyScopeLabel] = await Promise.all([
    resolveCompanyScope(session),
    resolveCompanyScopeLabel(session),
  ]);
  await Promise.all([
    refreshDriverConnectionsForTenantSession(),
    refreshTodayDriverPlatformMetrics(session.tid, scope),
  ]);
  const productivity = await getTenantProductivitySettings(session.tid);
  const usage = await listAppsUsageToday(session.tid, scope, productivity);
  const isLive = usage.platformSlugs.some((slug) => (usage.byPlatform[slug]?.length ?? 0) > 0);

  return (
    <ShellPage
      title={t("nav.apps")}
      description={`${companyScopeLabel} · ${t("apps.pageDescription")}`}
    >
      <AppsUsageMockView
        usage={usage}
        productivityThresholds={productivity}
        isLive={isLive}
        canExportExcel={canExportTenantData(session.role)}
        canRefreshMetrics={canManageShifts(session.role)}
      />
    </ShellPage>
  );
}
