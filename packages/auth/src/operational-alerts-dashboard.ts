import type { AlertDigestLine } from "./notify-tenant-alerts";
import type { ProductivityThresholds } from "./tenant-settings";

export type DashboardStyleAlert = {
  id: string;
  severity: "info" | "warning" | "danger";
  title: string;
  description: string;
  href?: string;
};

function severityForAlertId(id: string): DashboardStyleAlert["severity"] {
  if (id === "productivity-low" || id.startsWith("sync-failed")) return "danger";
  if (
    id === "payment-unvalidated" ||
    id === "pending-shifts" ||
    id === "productivity-warn" ||
    id.startsWith("sync-stale")
  ) {
    return "warning";
  }
  return "info";
}

function hrefForAlertId(id: string): string | undefined {
  if (id === "payment-unvalidated" || id === "pending-shifts") return "/cerrar-turnos";
  if (id === "productivity-low") return "/conductores";
  if (id === "productivity-warn") return "/apps";
  if (id.startsWith("sync-")) return "/configuracion";
  return undefined;
}

/** Maps digest lines (email/worker) to dashboard alert cards. */
export function mapOperationalAlertsToDashboard(
  lines: AlertDigestLine[],
  _thresholds: ProductivityThresholds,
): DashboardStyleAlert[] {
  const alerts: DashboardStyleAlert[] = lines.map((line) => ({
    id: line.id,
    severity: severityForAlertId(line.id),
    title: line.title,
    description: line.description,
    href: hrefForAlertId(line.id),
  }));

  const hasActionable = alerts.some((a) => a.id !== "all-clear");
  if (!hasActionable) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      title: "Sin alertas operativas",
      description:
        "No hay pagos sin confirmar, turnos pendientes hoy, sync al día ni conductores bajo umbral crítico este mes.",
    });
  }

  return alerts;
}
