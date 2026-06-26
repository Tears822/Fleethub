export type { PlatformKey, ShiftPlatformFilter } from "@/features/shifts/lib/shift-platform";
export {
  isMultiPlatform,
  platformSummaryLabel,
} from "@/features/shifts/lib/shift-platform";

/** Display name for a platform block (Uber, FreeNow, Bolt, …). */
export type ShiftPlatformName = string;

export type PlatformShiftMetrics = {
  platform: ShiftPlatformName;
  viajes: number;
  total: string;
  t3: string;
  app: string;
  efectivo: string;
  tarjetas: string;
  propinas: string;
  primas: string;
  peajes: string;
  avisos?: number;
};

export type ShiftTableRow = {
  plataformas: import("@/features/shifts/lib/shift-platform").PlatformKey;
  conductor: string;
  rango: string;
  viajes: number;
  total: string;
  t3: string;
  app: string;
  efectivo: string;
  tarjetas: string;
  propinas: string;
  primas: string;
  peajes: string;
};

export type TripIdsByPlatform = Partial<
  Record<import("@prisma/client").RidePlatform, string[]>
>;

export type CerrarTurnosRow = ShiftTableRow & {
  /** Alta/baja en maestro de conductores (no usado en filtros de esta pantalla). */
  activo: boolean;
  /** Turno abierto en plataforma (verde) vs cerrado con viajes sin liquidar (rojo). */
  turnoAbierto?: boolean;
  avisos: number;
  driverId?: string;
  tripIds?: string[];
  tripIdsByPlatform?: TripIdsByPlatform;
  periodFromIso?: string;
  periodToIso?: string;
  desglose?: PlatformShiftMetrics[];
};

export type ClosedShiftRow = ShiftTableRow & {
  driverId: string;
  tripIds: string[];
  tripIdsByPlatform?: TripIdsByPlatform;
  desglose?: PlatformShiftMetrics[];
  periodStart: string;
  periodEnd: string;
  liquidationKey: string;
  closedAt?: string;
};

export type ShiftLiveDetailInput = {
  tripIds: string[];
  driverId?: string;
  liquidationStatus: "pending" | "closed";
};

export function shiftLiveDetailFromRow(
  row: {
    tripIds?: string[];
    tripIdsByPlatform?: TripIdsByPlatform;
    driverId?: string;
  },
  liquidationStatus: "pending" | "closed",
  platform?: import("@prisma/client").RidePlatform,
): ShiftLiveDetailInput | undefined {
  const tripIds =
    platform && row.tripIdsByPlatform?.[platform]?.length
      ? row.tripIdsByPlatform[platform]!
      : row.tripIds;
  if (!row.driverId && !tripIds?.length) return undefined;
  return {
    tripIds: tripIds ?? [],
    driverId: row.driverId,
    liquidationStatus,
  };
}

export function shiftRowKey(
  row: Pick<ShiftTableRow, "conductor" | "rango" | "plataformas"> & {
    liquidationKey?: string;
  },
): string {
  if (row.liquidationKey) return row.liquidationKey;
  return `${row.conductor}|${row.rango}|${row.plataformas}`;
}

export function platformTripDetailKey(driverKey: string, platform: ShiftPlatformName): string {
  return `${driverKey}|${platform}`;
}

export function parsePlatformTripDetailKey(
  key: string,
): { driverKey: string; platform: ShiftPlatformName } | null {
  const idx = key.lastIndexOf("|");
  if (idx <= 0) return null;
  return { driverKey: key.slice(0, idx), platform: key.slice(idx + 1) };
}

export const SHIFT_CLOSE_BUTTON_CLASS =
  "erp-btn-primary min-w-[9.25rem] justify-center py-1 text-[11px]";
