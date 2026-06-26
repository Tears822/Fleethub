import type { FleetDayAverages } from "@/features/apps/lib/apps-productivity";
import type { AppsPlatformSlug } from "@/features/apps/lib/apps-platform";

export type AppsUsagePlatform = AppsPlatformSlug;

export type AppsMetricSource = "platform" | "trips" | "estimated";

export type AppsUsageRow = {
  platform: AppsUsagePlatform;
  conductor: string;
  empresa: string;
  viajes: number;
  /** UI display */
  facturacion: string;
  horas: string;
  eurH: string;
  aceptacion: string;
  horasSource: AppsMetricSource;
  aceptacionSource: AppsMetricSource;
  /** Raw values for Excel export and formulas */
  facturacionEur: number;
  horasDecimal: number;
  eurPerHour: number;
  aceptacionPct: number;
  productividad: "Óptimo" | "Medio" | "Bajo umbral";
  /** Productivity band (text column). */
  status: "ok" | "warn" | "low";
  /** FRD §5 / Pantalla 2 — conexión o turno abierto (punto junto al nombre). */
  connectionDot: "online" | "offline" | "unknown";
};

export type AppsUsageTodaySnapshot = {
  platformSlugs: AppsUsagePlatform[];
  byPlatform: Record<AppsUsagePlatform, AppsUsageRow[]>;
  fleetDayAverages: FleetDayAverages | null;
};
