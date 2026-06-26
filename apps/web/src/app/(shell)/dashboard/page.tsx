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
  topDriversEmptyMessage,
  topDriversPeriodSubtitle,
} from "@/features/dashboard/lib/top-drivers-period";
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
  if (!dbUnavailable) {
    try {
      const thresholds = await getTenantProductivitySettings(session.tid);
      await refreshDriverConnectionsForDashboard();

      const [op, al, connected] = await Promise.all([
        loadDashboardOperativaSnapshot(session.tid, scope, topDriversPeriod),
        loadDashboardAlerts(session.tid, scope, thresholds),
        countDriversConnectedNow(session.tid, scope),
      ]);
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

  const canManualRefresh = canManageShifts(session.role);

  return (
    <ShellPage
      title={t("nav.dashboard")}
      description={`${companyScopeLabel} · ${t("dashboard.description")}`}
      toolbarTrailing={<DashboardRefreshButton enabled={canManualRefresh} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {operativa.kpis.map((k) => (
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
            Base de datos: {drivers} conductores · {companies} empresas
            {users !== null ? <> · {users} usuarios</> : null}.
            {scope.mode === "restricted" ? (
              <> · {t("dashboard.limitedScope")}</>
            ) : null}
          </>
        )}
      </p>

      <DashboardAlertsPanel
        alerts={alerts}
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
          subtitle={topDriversPeriodSubtitle(operativa.topDriversPeriod)}
          emptyMessage={topDriversEmptyMessage(operativa.topDriversPeriod)}
          drivers={operativa.topDrivers}
        />
      </div>
    </ShellPage>
  );
}
