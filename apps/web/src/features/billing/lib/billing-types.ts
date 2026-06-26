import type { AppsPlatformSlug } from "@/features/apps/lib/apps-platform";

/** Clave de fila (p. ej. `uber-only`, `multi`) — ver `platformKeyFromSet` en shifts. */
export type PlatformKey = string;

export type BillingMoneyCells = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export type BillingTableRow = {
  rowKey: string;
  label: string;
  platform: PlatformKey;
  /** Plataformas con viajes en la fila (filtros Uber / Bolt / …). */
  platformSlugs?: AppsPlatformSlug[];
  cells: BillingMoneyCells;
};

/** @deprecated Use BillingTableRow — kept for exports */
export type BillingDriverRow = BillingTableRow & { conductor: string };

export type BillingPeriodKpiId =
  | "servicios"
  | "factTotal"
  | "comision"
  | "neto"
  | "app"
  | "efectivo"
  | "tarjeta"
  | "t3"
  | "propinas"
  | "primas"
  | "peajes";

export type BillingPeriodKpi = {
  id: BillingPeriodKpiId;
  value: string;
  hint?: string;
  hintKey?: string;
  hintParams?: Record<string, string | number>;
  danger?: boolean;
  /** Tarifa 3 / Primas — borde naranja en UI. */
  highlight?: boolean;
};

/** Viajes del periodo aún sin liquidar en caja (no entran en totales de facturación). */
export type BillingPendingInPeriod = {
  tripCount: number;
  driverCount: number;
};

export type BillingReport = {
  byDriver: BillingTableRow[];
  byDay: BillingTableRow[];
  globalRows: BillingTableRow[];
  periodKpis: BillingPeriodKpi[];
  /** Presente si hay viajes `pending` en el rango; informativo, no suma a KPIs. */
  pendingInPeriod?: BillingPendingInPeriod;
};
