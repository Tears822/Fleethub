import type { DashboardAlertItem } from "@/features/dashboard/server/dashboard-alerts.queries";
import type { Translator } from "@fleethub/i18n";

/** Maps server-built alert lines to tenant locale (titles/descriptions are Spanish in auth). */
export function localizeDashboardAlerts(
  alerts: DashboardAlertItem[],
  t: Translator,
): DashboardAlertItem[] {
  return alerts.map((a) => {
    if (a.id === "payment-unvalidated") {
      const countMatch = a.description.match(/^(\d+)/);
      const count = countMatch?.[1] ?? "0";
      return {
        ...a,
        title: t("dashboard.alerts.paymentUnvalidatedTitle"),
        description: t("dashboard.alerts.paymentUnvalidatedDesc", { count }),
      };
    }
    if (a.id === "pending-shifts") {
      const countMatch = a.description.match(/^(\d+)/);
      const count = countMatch?.[1] ?? "0";
      return {
        ...a,
        title: t("dashboard.alerts.pendingShiftsTitle"),
        description: t("dashboard.alerts.pendingShiftsDesc", { count }),
      };
    }
    if (a.id === "productivity-low") {
      return {
        ...a,
        title: t("dashboard.alerts.productivityLowTitle"),
        description: a.description,
      };
    }
    if (a.id === "productivity-warn") {
      return {
        ...a,
        title: t("dashboard.alerts.productivityWarnTitle"),
        description: a.description,
      };
    }
    if (a.id === "all-clear") {
      return {
        ...a,
        title: t("dashboard.alerts.allClearTitle"),
        description: t("dashboard.alerts.allClearDesc"),
      };
    }
    if (a.id.startsWith("sync-failed") || a.id.startsWith("sync-stale")) {
      return {
        ...a,
        title: a.title,
        description: a.description,
      };
    }
    return a;
  });
}
