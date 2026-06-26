import { formatDateEs, parseDateEs } from "@/shared/lib/date-es";

export type PlatformFilter =
  import("@/features/analytics/lib/analytics-platform").AnalyticsPlatformFilter;
export type PeriodPreset =
  | "hoy"
  | "ayer"
  | "ultimos30"
  | "semanaAnterior"
  | "mesActual"
  | "mesAnterior"
  | "custom";

import type { PlatformKey } from "@/features/shifts/lib/shift-platform";

export type AnalyticsRow = {
  conductor: string;
  platform: PlatformKey;
  /** Plataformas con viajes en el periodo (filtro multi). */
  platforms?: import("@prisma/client").RidePlatform[];
  facturacion: number;
  comisiones: number;
  viajes: number;
  turnos: number;
  mediaTurno: number;
  eurHora: number;
  propinas: number;
  primas: number;
  estado: "ok" | "medio" | "alerta";
};

export const ANALYTICS_ROWS: AnalyticsRow[] = [
  {
    conductor: "M. Prat Aranda",
    platform: "both",
    facturacion: 1210,
    comisiones: -312,
    viajes: 86,
    turnos: 12,
    mediaTurno: 101,
    eurHora: 13.8,
    propinas: 18,
    primas: 10,
    estado: "ok",
  },
  {
    conductor: "D. Paula Alcivar",
    platform: "uber-only",
    facturacion: 1088,
    comisiones: -280,
    viajes: 78,
    turnos: 11,
    mediaTurno: 99,
    eurHora: 12.9,
    propinas: 14,
    primas: 8,
    estado: "medio",
  },
  {
    conductor: "A. Rojas Sánchez",
    platform: "freenow",
    facturacion: 990,
    comisiones: -255,
    viajes: 72,
    turnos: 10,
    mediaTurno: 99,
    eurHora: 11.2,
    propinas: 12,
    primas: 6,
    estado: "medio",
  },
  {
    conductor: "J. Gutiérrez",
    platform: "uber-only",
    facturacion: 860,
    comisiones: -220,
    viajes: 64,
    turnos: 9,
    mediaTurno: 96,
    eurHora: 10.1,
    propinas: 10,
    primas: 4,
    estado: "alerta",
  },
  {
    conductor: "C. Granda Ruiz",
    platform: "freenow",
    facturacion: 740,
    comisiones: -190,
    viajes: 58,
    turnos: 9,
    mediaTurno: 82,
    eurHora: 9.6,
    propinas: 8,
    primas: 4,
    estado: "ok",
  },
];

/** KPI globales del panel (empresa completa, escalan con filtros demo). */
export const KPI_BASE = {
  facturacion: 14820,
  comisiones: -3658,
  eurHora: 13.42,
  neto: 11162,
};

/** Media del resto de operadores (referencia diseño / demo). */
export const SECTOR_KPI_BASE = {
  facturacion: 13720,
  comisiones: -3200,
  eurHora: 13.98,
  neto: 10520,
};

export const PERIOD_PRESETS: {
  id: PeriodPreset;
  label: string;
  scale: number;
  range: () => { from: string; to: string };
}[] = [
  {
    id: "hoy",
    label: "Hoy",
    scale: 0.04,
    range: () => {
      const d = formatDateEs(new Date());
      return { from: d, to: d };
    },
  },
  {
    id: "ayer",
    label: "Ayer",
    scale: 0.035,
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const s = formatDateEs(d);
      return { from: s, to: s };
    },
  },
  {
    id: "ultimos30",
    label: "Últimos 30 días",
    scale: 0.88,
    range: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      return { from: formatDateEs(from), to: formatDateEs(to) };
    },
  },
  {
    id: "semanaAnterior",
    label: "Semana anterior",
    scale: 0.22,
    range: () => {
      const today = new Date();
      const dow = today.getDay() || 7;
      const end = new Date(today);
      end.setDate(today.getDate() - dow);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return { from: formatDateEs(start), to: formatDateEs(end) };
    },
  },
  {
    id: "mesActual",
    label: "Mes actual",
    scale: 0.72,
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: formatDateEs(from), to: formatDateEs(now) };
    },
  },
  {
    id: "mesAnterior",
    label: "Mes anterior",
    scale: 1,
    range: () => ({ from: "01/04/2026", to: "30/04/2026" }),
  },
];

export { formatDateEs, parseDateEs } from "@/shared/lib/date-es";

export {
  analyticsPlatformKpiMultiplier as platformKpiMultiplier,
  analyticsPlatformLabel as platformLabel,
  matchesAnalyticsPlatform as matchesPlatform,
} from "@/features/analytics/lib/analytics-platform";

const EMPTY_SECTOR_DRIVER = {
  facturacion: 0,
  comisiones: 0,
  viajes: 0,
  turnos: 0,
  mediaTurno: 0,
  eurHora: 0,
  propinas: 0,
  primas: 0,
} as const;

/** Media por conductor del conjunto (demo o referencia local). */
export function averageAnalyticsRows(rows: AnalyticsRow[]) {
  if (rows.length === 0) {
    return { ...EMPTY_SECTOR_DRIVER };
  }
  const n = rows.length;
  const sum = rows.reduce(
    (acc, r) => ({
      facturacion: acc.facturacion + r.facturacion,
      comisiones: acc.comisiones + r.comisiones,
      viajes: acc.viajes + r.viajes,
      turnos: acc.turnos + r.turnos,
      mediaTurno: acc.mediaTurno + r.mediaTurno,
      eurHora: acc.eurHora + r.eurHora,
      propinas: acc.propinas + r.propinas,
      primas: acc.primas + r.primas,
    }),
    {
      facturacion: 0,
      comisiones: 0,
      viajes: 0,
      turnos: 0,
      mediaTurno: 0,
      eurHora: 0,
      propinas: 0,
      primas: 0,
    },
  );
  return {
    facturacion: Math.round(sum.facturacion / n),
    comisiones: Math.round(sum.comisiones / n),
    viajes: Math.round(sum.viajes / n),
    turnos: Math.round(sum.turnos / n),
    mediaTurno: Math.round(sum.mediaTurno / n),
    eurHora: Math.round((sum.eurHora / n) * 10) / 10,
    propinas: Math.round(sum.propinas / n),
    primas: Math.round(sum.primas / n),
  };
}

export function periodScaleForCustomRange(from: string, to: string): number {
  const start = parseDateEs(from);
  const end = parseDateEs(to);
  if (!start || !end || end < start) return 1;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return Math.min(1, Math.max(0.03, days / 30));
}
