import type { ProductivityThresholds } from "./tenant-settings";

export type { ProductivityThresholds } from "./tenant-settings";

export type AppsProductivityLabel = "Óptimo" | "Medio" | "Bajo umbral";
export type AppsProductivityStatus = "ok" | "warn" | "low";

export type FleetDayAverages = {
  eurPerHour: number;
  acceptancePct: number;
  driverPlatformRows: number;
};

/** Per driver+platform row metrics (Apps screen and Excel export). */
export type AppsProductivityMetrics = {
  facturacionEur: number;
  horasDecimal: number;
  eurPerHour: number;
  aceptacionPct: number;
  viajes: number;
};

function productivityLabelFixed(
  eurH: number,
  acceptancePct: number,
  thresholds: ProductivityThresholds,
): AppsProductivityLabel {
  const eurOk = eurH >= thresholds.eurPerHourMin;
  const accOk = acceptancePct >= thresholds.acceptanceRateMin;
  if (eurOk && accOk) return "Óptimo";
  const eurMedio = thresholds.eurPerHourMin - 2;
  const accMedio = thresholds.acceptanceRateMin - 15;
  if (eurH >= eurMedio || acceptancePct >= accMedio) return "Medio";
  return "Bajo umbral";
}

function productivityLabelFleetDay(
  eurH: number,
  acceptancePct: number,
  fleet: FleetDayAverages,
): AppsProductivityLabel {
  if (fleet.eurPerHour <= 0 || fleet.driverPlatformRows === 0) {
    return "Bajo umbral";
  }
  const eurRatio = eurH / fleet.eurPerHour;
  const accRatio = fleet.acceptancePct > 0 ? acceptancePct / fleet.acceptancePct : 0;
  if (eurRatio >= 1 && accRatio >= 1) return "Óptimo";
  if (eurRatio >= 0.85 || accRatio >= 0.85) return "Medio";
  return "Bajo umbral";
}

export function classifyAppsProductivity(
  eurH: number,
  acceptancePct: number,
  thresholds: ProductivityThresholds,
  fleet: FleetDayAverages | null,
): AppsProductivityLabel {
  if (thresholds.useFleetDayAverages && fleet) {
    return productivityLabelFleetDay(eurH, acceptancePct, fleet);
  }
  return productivityLabelFixed(eurH, acceptancePct, thresholds);
}

export function appsProductivityStatus(label: AppsProductivityLabel): AppsProductivityStatus {
  if (label === "Óptimo") return "ok";
  if (label === "Medio") return "warn";
  return "low";
}

export const APPS_PRODUCTIVITY_STATUS_LABEL: Record<AppsProductivityStatus, string> = {
  ok: "Productividad óptima",
  warn: "Productividad media",
  low: "Bajo umbral de productividad",
};

export function computeFleetDayAveragesFromMetrics(
  rows: AppsProductivityMetrics[],
): FleetDayAverages | null {
  if (rows.length === 0) return null;

  let totalGross = 0;
  let totalHours = 0;
  let accWeighted = 0;
  let viajes = 0;

  for (const row of rows) {
    totalGross += row.facturacionEur;
    totalHours += row.horasDecimal;
    accWeighted += row.aceptacionPct * row.viajes;
    viajes += row.viajes;
  }

  const eurPerHour = totalHours >= 0.25 ? totalGross / totalHours : 0;
  const acceptancePct = viajes > 0 ? Math.round(accWeighted / viajes) : 0;

  return {
    eurPerHour: Math.round(eurPerHour * 10) / 10,
    acceptancePct,
    driverPlatformRows: rows.length,
  };
}
