import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { canExportTenantData, canManageDrivers } from "@/domain/rbac.policy";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { ConductoresPrototypeLayout } from "@/features/drivers/ui/conductores-prototype-layout";
import { loadDriverProductivityMap } from "@/features/drivers/server/driver-productivity.queries";
import { listDriverConnectionSummaryMap } from "@/features/drivers/server/driver-platform-connections.queries";
import { listDriversForTenant } from "@/features/drivers/server/drivers.queries";
import { refreshDriverConnectionsForTenantSession } from "@/features/integrations/server/refresh-driver-connections.server";
import { getTenantProductivitySettings } from "@/features/settings/server/settings.queries";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function ConductoresPage() {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const [scope, companyScopeLabel] = await Promise.all([
    resolveCompanyScope(session),
    resolveCompanyScopeLabel(session),
  ]);
  await refreshDriverConnectionsForTenantSession();
  const thresholds = await getTenantProductivitySettings(session.tid);
  const [drivers, productivityMap, connectionMap] = await Promise.all([
    listDriversForTenant(session.tid, scope),
    loadDriverProductivityMap(session.tid, scope, thresholds),
    listDriverConnectionSummaryMap(session.tid, scope),
  ]);

  return (
    <ShellPage
      title={t("nav.conductores")}
      description={`${companyScopeLabel} · ${t("conductores.pageDescription")}`}
      actions={
        canExportTenantData(session.role) ? (
          <ExportFileButton
            href="/api/tenant/export/conductores.xlsx"
            label={t("conductores.export")}
            filename="conductores.xlsx"
          />
        ) : null
      }
    >
      <ConductoresPrototypeLayout
        drivers={drivers}
        productivityMap={productivityMap}
        connectionMap={Object.fromEntries(connectionMap)}
        canCreate={canManageDrivers(session.role)}
      />
    </ShellPage>
  );
}
