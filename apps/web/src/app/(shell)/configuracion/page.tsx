import { canManageShifts, canManageTenantSettings } from "@/domain/rbac.policy";
import {
  getTenantAnalyticsSettings,
  getTenantDriverCoverage,
  getTenantIngestionKpis,
  getTenantIngestionTimeSeries,
} from "@fleethub/auth";
import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import { requireTenantSession } from "@/features/auth/server/session.service";
import {
  getRecentSyncRuns,
  getSyncRunsLast30Days,
} from "@/features/integrations/server/sync-runs.queries";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { listCompaniesForTenant } from "@/features/companies/server/companies.queries";
import { integrationSettingsForSession } from "@fleethub/auth";
import {
  getTenantGeneralSettings,
  getTenantProductivitySettings,
  parseTenantIntegrationSettings,
  parseTenantNotificationSettings,
} from "@/features/settings/server/settings.queries";
import { isSmtpConfigured } from "@fleethub/auth";
import { listTenantUsersForSettings } from "@/features/settings/server/users.queries";
import { getTenantAuditLogsForSettings } from "@/features/settings/server/audit-logs.queries";
import { ConfiguracionPrototypeSections } from "@/features/settings/ui/configuracion-prototype-sections";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function ConfiguracionPage() {
  const session = await requireTenantSession();
  assertTenantRouteAllowed(session, "/configuracion");

  const { t } = await getSessionTranslator(session);

  const [
    tenant,
    syncRuns,
    syncHistory,
    users,
    companies,
    productivity,
    analytics,
    auditLogs,
    driverCoverage,
    ingestionKpis,
    ingestionTimeSeries,
  ] = await Promise.all([
      getTenantGeneralSettings(session.tid),
      getRecentSyncRuns(session.tid),
      getSyncRunsLast30Days(session.tid),
      listTenantUsersForSettings(session.tid),
      listCompaniesForTenant(session.tid, { mode: "all" }),
      getTenantProductivitySettings(session.tid),
      getTenantAnalyticsSettings(session.tid),
      getTenantAuditLogsForSettings(session),
      getTenantDriverCoverage(session.tid),
      getTenantIngestionKpis(session.tid, 24),
      getTenantIngestionTimeSeries(session.tid),
    ]);

  const companyOptions = companies
    .filter((c) => c.isActive)
    .map((c) => ({ id: c.id, legalName: c.legalName }));

  const tenantLabel = tenant?.name?.trim() ?? "tenant";

  return (
    <ShellPage
      title={t("config.title")}
      description={t("turnos.configDescription", { name: tenantLabel })}
    >
      <ConfiguracionPrototypeSections
        tenant={{
          name: tenant?.name ?? "",
          slug: tenant?.slug ?? "",
          timezone: tenant?.timezone ?? "Europe/Madrid",
        }}
        syncRuns={syncRuns}
        syncHistory={syncHistory}
        users={users}
        companies={companyOptions}
        currentUserId={session.sub}
        productivity={productivity}
        notifications={parseTenantNotificationSettings(tenant?.settings)}
        smtpConfigured={isSmtpConfigured()}
        auditLogs={auditLogs}
        canExportAuditLog={session.role === "ADMIN_TENANT"}
        canManageSync={canManageShifts(session.role) && !session.impersonating}
        integrations={integrationSettingsForSession(
          session,
          parseTenantIntegrationSettings(tenant?.settings),
        )}
        driverCoverage={driverCoverage}
        ingestionKpis={ingestionKpis}
        ingestionTimeSeries={ingestionTimeSeries}
        canEditIntegrationSettings={
          canManageTenantSettings(session.role) && !session.impersonating
        }
        showPlatformTenantIds={session.impersonating === true}
        analytics={analytics}
        canManageAnalytics={canManageTenantSettings(session.role) && !session.impersonating}
      />
    </ShellPage>
  );
}
