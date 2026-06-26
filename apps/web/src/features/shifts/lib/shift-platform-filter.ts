import {
  displayNameToRidePlatform,
  isMultiPlatform,
  ridePlatformFromFilter,
  shiftPlatformDisplayName,
  shiftPlatformFilterToQuery,
  type PlatformKey,
  type ShiftPlatformFilter,
} from "@/features/shifts/lib/shift-platform";
import type {
  CerrarTurnosRow,
  ClosedShiftRow,
  PlatformShiftMetrics,
} from "@/features/shifts/ui/cerrar-turnos-types";
import { RidePlatform } from "@prisma/client";

export type { ShiftPlatformFilter };

export { shiftPlatformFilterToQuery };

export function shiftExportXlsxHref(
  kind: "cerrar-turnos" | "turnos-cerrados",
  options: {
    platform?: ShiftPlatformFilter;
    fromIso?: string;
    toIso?: string;
    search?: string;
  },
): string {
  const params = new URLSearchParams();
  const platform = shiftPlatformFilterToQuery(options.platform ?? "all");
  if (platform) params.set("platform", platform);
  if (options.fromIso) params.set("from", options.fromIso);
  if (options.toIso) params.set("to", options.toIso);
  const search = options.search?.trim();
  if (search) params.set("q", search);
  const q = params.toString();
  return `/api/tenant/export/${kind}.xlsx${q ? `?${q}` : ""}`;
}

export function driverHasPlatformFilter(
  row: { plataformas: PlatformKey; desglose?: PlatformShiftMetrics[] },
  filter: ShiftPlatformFilter,
): boolean {
  if (filter === "all") return true;
  if (isMultiPlatform(row.plataformas)) {
    return row.desglose?.some((d) => displayNameToRidePlatform(d.platform) === filter) ?? false;
  }
  const only = ridePlatformFromFilter(filter);
  if (!only) return true;
  if (filter === RidePlatform.UBER) {
    return row.plataformas === "uber-only" || row.plataformas === "both";
  }
  if (filter === RidePlatform.FREENOW) {
    return row.plataformas === "freenow" || row.plataformas === "both";
  }
  return row.plataformas === `${only.toLowerCase()}-only`;
}

function metricsForPlatform(
  row: CerrarTurnosRow | ClosedShiftRow,
  platform: RidePlatform,
): PlatformShiftMetrics | null {
  const displayName = shiftPlatformDisplayName(platform);
  const fromDesglose = row.desglose?.find((d) => d.platform === displayName);
  if (fromDesglose) return fromDesglose;

  if (!isMultiPlatform(row.plataformas)) {
    const slug =
      platform === RidePlatform.FREENOW
        ? "freenow"
        : platform === RidePlatform.UBER
          ? "uber-only"
          : `${platform.toLowerCase()}-only`;
    if (row.plataformas === slug || row.plataformas === "both") {
      return {
        platform: displayName,
        viajes: row.viajes,
        total: row.total,
        t3: row.t3,
        app: row.app,
        efectivo: row.efectivo,
        tarjetas: row.tarjetas,
        propinas: row.propinas,
        primas: row.primas,
        peajes: row.peajes,
        avisos: "avisos" in row ? row.avisos : 0,
      };
    }
  }
  return null;
}

function platformKeyForRide(p: RidePlatform): PlatformKey {
  if (p === RidePlatform.FREENOW) return "freenow";
  if (p === RidePlatform.UBER) return "uber-only";
  return `${p.toLowerCase()}-only`;
}

/** Restrict row metrics and trip ids to a single platform (UI + cierre parcial). */
export function scopeShiftRowToPlatform<T extends CerrarTurnosRow | ClosedShiftRow>(
  row: T,
  filter: ShiftPlatformFilter,
): T | null {
  if (filter === "all") return row;
  if (!driverHasPlatformFilter(row, filter)) return null;

  const metrics = metricsForPlatform(row, filter);
  if (!metrics) return null;

  const tripIds = row.tripIdsByPlatform?.[filter];

  return {
    ...row,
    plataformas: platformKeyForRide(filter),
    viajes: metrics.viajes,
    total: metrics.total,
    t3: metrics.t3,
    app: metrics.app,
    efectivo: metrics.efectivo,
    tarjetas: metrics.tarjetas,
    propinas: metrics.propinas,
    primas: metrics.primas,
    peajes: metrics.peajes,
    ...("avisos" in row ? { avisos: metrics.avisos ?? 0 } : {}),
    desglose: undefined,
    tripIds: tripIds?.length ? tripIds : row.tripIds,
  };
}

export function filterShiftRowsForPlatform<T extends CerrarTurnosRow | ClosedShiftRow>(
  rows: T[],
  filter: ShiftPlatformFilter,
): T[] {
  if (filter === "all") return rows;
  const scoped: T[] = [];
  for (const row of rows) {
    const next = scopeShiftRowToPlatform(row, filter);
    if (next) scoped.push(next);
  }
  return scoped;
}

/** One table row per platform when the shift spans multiple platforms. */
export function expandShiftRowsForTable<T extends CerrarTurnosRow | ClosedShiftRow>(
  rows: T[],
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (isMultiPlatform(row.plataformas) && row.desglose?.length) {
      for (const block of row.desglose) {
        const platform = displayNameToRidePlatform(block.platform);
        if (!platform) continue;
        const scoped = scopeShiftRowToPlatform(row, platform);
        if (scoped) out.push(scoped);
      }
    } else {
      out.push(row);
    }
  }
  return out;
}
