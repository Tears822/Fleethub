import { canManageShifts, canManageTenantSettings } from "@/domain/rbac.policy";
import {
  resolveCompanyScope,
  resolveCompanyScopeLabel,
} from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { isSmtpConfigured } from "@fleethub/auth";
import { DashboardAlertsEmailButton } from "@/features/dashboard/ui/dashboard-alerts-email-button";
import { loadDashboardCounts } from "@/features/dashboard/server/dashboard.queries";
import { countDriversConnectedNow } from "@/features/dashboard/server/dashboard-connected-now.queries";
import {
  applyPaymentAlertCountToKpis,
  applyConnectedNowToKpis,
  buildEmptyDashboardOperativaSnapshot,
  loadDashboardOperativaSnapshot,
} from "@/features/dashboard/server/dashboard-operativa.queries";
import { refreshDriverConnectionsForDashboard } from "@/features/dashboard/server/refresh-driver-connections.server";
import { loadDashboardAlerts } from "@/features/dashboard/server/dashboard-alerts.queries";
import { DashboardAlertsPanel } from "@/features/dashboard/ui/dashboard-alerts-panel";
import { DashboardRefreshButton } from "@/features/dashboard/ui/dashboard-refresh-button";
import { DashboardRevenueMockChart } from "@/features/dashboard/ui/dashboard-revenue-mock-chart";
import {
  parseTopDriversPeriod,
  topDriversEmptyMessageKey,
  topDriversPeriodSubtitleKey,
} from "@/features/dashboard/lib/top-drivers-period";
import { localizeDashboardKpis } from "@/features/dashboard/lib/dashboard-kpi-i18n";
import { localizeDashboardAlerts } from "@/features/dashboard/lib/dashboard-alerts-i18n";
import { DashboardTopDriversCard } from "@/features/dashboard/ui/dashboard-top-drivers-card";
import { getTenantProductivitySettings } from "@/features/settings/server/settings.queries";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";
import { VuiStatCard } from "@/shared/ui/vui-stat-card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ top?: string }>;
}) {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const sp = await searchParams;
  const topDriversPeriod = parseTopDriversPeriod(sp.top);

  let drivers: number | null = null;
  let companies: number | null = null;
  let users: number | null = null;
  let dbUnavailable = false;

  const [scope, companyScopeLabel] = await Promise.all([
    resolveCompanyScope(session),
    resolveCompanyScopeLabel(session),
  ]);

  try {
    [drivers, companies, users] = await loadDashboardCounts(session.tid, scope);
  } catch {
    dbUnavailable = true;
  }

  let operativa = buildEmptyDashboardOperativaSnapshot(drivers ?? 0);
  let alerts: Awaited<ReturnType<typeof loadDashboardAlerts>> = [];
  let connectedNow: Awaited<ReturnType<typeof countDriversConnectedNow>> | null = null;
  if (!dbUnavailable) {
    try {
      const thresholds = await getTenantProductivitySettings(session.tid);
      await refreshDriverConnectionsForDashboard();

      const [op, al, connected] = await Promise.all([
        loadDashboardOperativaSnapshot(session.tid, scope, topDriversPeriod),
        loadDashboardAlerts(session.tid, scope, thresholds),
        countDriversConnectedNow(session.tid, scope),
      ]);
      connectedNow = connected;
      operativa = {
        ...op,
        kpis: applyPaymentAlertCountToKpis(
          applyConnectedNowToKpis(op.kpis, connected),
          op.paymentAlertCount,
        ),
      };
      alerts = al;
    } catch {
      operativa = buildEmptyDashboardOperativaSnapshot(drivers ?? 0);
    }
  }

  const localizedKpis = localizeDashboardKpis(operativa.kpis, t, {
    paymentAlertCount: operativa.paymentAlertCount,
    connected: connectedNow ?? undefined,
  });
  const localizedAlerts = localizeDashboardAlerts(alerts, t);

  const canManualRefresh = canManageShifts(session.role);

  return (
    <ShellPage
      title={t("nav.dashboard")}
      description={`${companyScopeLabel} · ${t("dashboard.description")}`}
      toolbarTrailing={<DashboardRefreshButton enabled={canManualRefresh} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {localizedKpis.map((k) => (
          <VuiStatCard
            key={k.title}
            title={k.title}
            value={k.value}
            icon={k.icon}
            hint={k.hint}
            trend={k.trend}
            accent={k.accent ?? "green"}
          />
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        {dbUnavailable ? (
          <>{t("dashboard.dbUnavailable")}</>
        ) : (
          <>
            {t("dashboard.dbSummary", {
              drivers: String(drivers ?? 0),
              companies: String(companies ?? 0),
              users: String(users ?? 0),
            })}
            {scope.mode === "restricted" ? (
              <> · {t("dashboard.limitedScope")}</>
            ) : null}
          </>
        )}
      </p>

      <DashboardAlertsPanel
        alerts={localizedAlerts}
        headerAction={
          <DashboardAlertsEmailButton
            alerts={alerts}
            smtpConfigured={isSmtpConfigured()}
            canSend={canManageTenantSettings(session.role)}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardRevenueMockChart
          title={t("dashboard.revenueChartTitle")}
          subtitle={t("dashboard.revenueChartSubtitle")}
          rangeLabel={operativa.chartRangeLabel}
          series={operativa.revenue14d}
        />
        <DashboardTopDriversCard
          period={operativa.topDriversPeriod}
          subtitleKey={topDriversPeriodSubtitleKey(operativa.topDriversPeriod)}
          emptyMessageKey={topDriversEmptyMessageKey(operativa.topDriversPeriod)}
          drivers={operativa.topDrivers}
        />
      </div>
    </ShellPage>
  );
}
