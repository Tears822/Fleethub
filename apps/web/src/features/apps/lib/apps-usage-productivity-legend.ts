import type { FleetDayAverages } from "@/features/apps/lib/apps-productivity";
import type { ProductivityThresholds } from "@fleethub/auth/apps-productivity";
import type { Translator } from "@fleethub/i18n";

function fmtEur(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

function fleetAveragesLine(fleet: FleetDayAverages, t: Translator): string {
  return t("apps.legend.fleetAverages", {
    rows: fleet.driverPlatformRows,
    eur: fmtEur(fleet.eurPerHour),
    pct: fleet.acceptancePct,
  });
}

/** Copy for the Apps productivity legend. */
export function appsProductivityLegendText(
  thresholds: ProductivityThresholds,
  fleet: FleetDayAverages | null,
  t: Translator,
): {
  modeLabel: string;
  fleetLine: string | null;
  optimo: string;
  medio: string;
  bajo: string;
} {
  if (thresholds.useFleetDayAverages && fleet) {
    return {
      modeLabel: t("apps.legend.fleetMode"),
      fleetLine: fleetAveragesLine(fleet, t),
      optimo: t("apps.legend.optimalFleet"),
      medio: t("apps.legend.mediumFleet"),
      bajo: t("apps.legend.lowFleet"),
    };
  }

  const eurMedio = thresholds.eurPerHourMin - 2;
  const accMedio = thresholds.acceptanceRateMin - 15;

  return {
    modeLabel: t("apps.legend.thresholdMode"),
    fleetLine: fleet ? fleetAveragesLine(fleet, t) : null,
    optimo: t("apps.legend.optimalThreshold", {
      eur: fmtEur(thresholds.eurPerHourMin),
      pct: thresholds.acceptanceRateMin,
    }),
    medio: t("apps.legend.mediumThreshold", {
      eurMedio: fmtEur(eurMedio),
      accMedio,
    }),
    bajo: t("apps.legend.lowThreshold", {
      eurMedio: fmtEur(eurMedio),
      accMedio,
    }),
  };
}
