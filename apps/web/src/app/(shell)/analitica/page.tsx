import { canExportTenantData } from "@/domain/rbac.policy";
import { getTenantAnalyticsSettings } from "@fleethub/auth";
import { resolveBillingDateRange } from "@/features/billing/lib/billing-date-range";
import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { parseAnalyticsPlatformFilter } from "@/features/analytics/lib/analytics-platform";
import { listAnalyticsByDriver } from "@/features/analytics/server/analytics.queries";
import { getAnalyticsSectorBenchmarks } from "@/features/analytics/server/analytics-sector.queries";
import { AnaliticaMockView } from "@/features/analytics/ui/analitica-mock-view";
import { AnaliticaPageActions } from "@/features/analytics/ui/analitica-page-actions";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function AnaliticaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; platform?: string }>;
}) {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const scope = await resolveCompanyScope(session);
  const sp = await searchParams;
  const range = resolveBillingDateRange(sp);
  const platformFilter = parseAnalyticsPlatformFilter(sp.platform);

  const analyticsSettings = await getTenantAnalyticsSettings(session.tid);
  const sectorOptIn = analyticsSettings.sectorBenchmarkOptIn;
  const companyScopeLabel = await resolveCompanyScopeLabel(session);

  const [{ rows }, sector] = await Promise.all([
    listAnalyticsByDriver(
      session.tid,
      scope,
      range.dateFrom,
      range.dateTo,
      platformFilter,
    ),
    getAnalyticsSectorBenchmarks(session.tid, range.dateFrom, range.dateTo, {
      viewerOptedIn: sectorOptIn,
    }),
  ]);

  return (
    <ShellPage
      title={t("nav.analitica")}
      description={`${companyScopeLabel} · ${range.dateFromEs} – ${range.dateToEs}`}
      actions={
        <AnaliticaPageActions
          fromIso={range.fromIso}
          toIso={range.toIso}
          canExport={canExportTenantData(session.role)}
        />
      }
    >
      <AnaliticaMockView
        initialRows={rows}
        sectorBenchmarks={sector}
        sectorBenchmarkOptIn={sectorOptIn}
        companyScopeLabel={companyScopeLabel}
        initialPlatformFilter={platformFilter}
        usingLiveData={rows.length > 0}
        dateFrom={range.dateFromEs}
        dateTo={range.dateToEs}
        canExportExcel={canExportTenantData(session.role)}
      />
    </ShellPage>
  );
}
