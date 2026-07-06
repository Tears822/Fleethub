import type { MockDashboardKpi, DashboardKpiId } from "@/features/dashboard/mock/dashboard-mock";
import type { ConnectedNowSnapshot } from "@/features/dashboard/server/dashboard-connected-now.queries";
import type { Translator } from "@fleethub/i18n";

export type LocalizedDashboardKpi = Omit<MockDashboardKpi, "id"> & { title: string };

function connectedNowHint(connected: ConnectedNowSnapshot, t: Translator): string {
  if (connected.source === "api") return t("dashboard.kpis.connectedNowHintApi");
  if (connected.source === "mixed") return t("dashboard.kpis.connectedNowHintMixed");
  if (connected.source === "trips") return t("dashboard.kpis.connectedNowHintTrips");
  return t("dashboard.kpis.connectedNowHintNone");
}

export function localizeDashboardKpi(
  kpi: MockDashboardKpi,
  t: Translator,
  options?: { paymentAlertCount?: number; connected?: ConnectedNowSnapshot },
): LocalizedDashboardKpi {
  const { id, hintParams, ...rest } = kpi;
  const paymentAlertCount = options?.paymentAlertCount ?? 0;

  switch (id) {
    case "activeDriversToday":
      return {
        ...rest,
        title: t("dashboard.kpis.activeDriversToday"),
        hint:
          hintParams?.totalDrivers != null
            ? t("dashboard.kpis.activeDriversTodayHint", {
                total: String(hintParams.totalDrivers),
              })
            : t("dashboard.kpis.activeDriversTodayHintNoRoster"),
      };
    case "openShiftsNow":
      return {
        ...rest,
        title: t("dashboard.kpis.openShiftsNow"),
        hint: t("dashboard.kpis.openShiftsNowHint"),
      };
    case "connectedNow":
      return {
        ...rest,
        title: t("dashboard.kpis.connectedNow"),
        hint: options?.connected
          ? connectedNowHint(options.connected, t)
          : (kpi.hint ?? t("dashboard.kpis.connectedNowHintNone")),
      };
    case "dayBilling":
      return {
        ...rest,
        title: t("dashboard.kpis.dayBilling"),
        hint: t("dashboard.kpis.dayBillingHint"),
      };
    case "tripsToday":
      return {
        ...rest,
        title: t("dashboard.kpis.tripsToday"),
        hint: t("dashboard.kpis.tripsTodayHint"),
      };
    case "pendingShifts":
      return {
        ...rest,
        title: t("dashboard.kpis.pendingShifts"),
        hint: t("dashboard.kpis.pendingShiftsHint"),
        trend:
          Number(kpi.value) > 0
            ? { text: t("dashboard.kpis.review"), positive: false, tone: "warning" as const }
            : undefined,
      };
    case "alerts":
      return {
        ...rest,
        title: t("dashboard.kpis.alerts"),
        hint:
          paymentAlertCount === 0
            ? t("dashboard.kpis.alertsHintOk")
            : t("dashboard.kpis.alertsHintPending"),
        trend:
          paymentAlertCount > 0
            ? { text: t("dashboard.kpis.review"), positive: false, tone: "danger" as const }
            : undefined,
      };
    default: {
      const _exhaustive: never = id;
      return { ...rest, title: String(_exhaustive) };
    }
  }
}

export function localizeDashboardKpis(
  kpis: MockDashboardKpi[],
  t: Translator,
  options?: { paymentAlertCount?: number; connected?: ConnectedNowSnapshot },
): LocalizedDashboardKpi[] {
  return kpis.map((k) => localizeDashboardKpi(k, t, options));
}

/** @deprecated Match by KPI id instead of Spanish title. */
export function isDashboardKpiId(id: string): id is DashboardKpiId {
  return [
    "activeDriversToday",
    "openShiftsNow",
    "connectedNow",
    "dayBilling",
    "tripsToday",
    "pendingShifts",
    "alerts",
  ].includes(id);
}
