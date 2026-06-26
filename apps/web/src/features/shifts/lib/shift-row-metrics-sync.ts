import type { CerrarTurnosRow, PlatformShiftMetrics } from "@/features/shifts/ui/cerrar-turnos-types";

function rowMetricsMatch(row: CerrarTurnosRow, cols: {
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
}): boolean {
  return (
    row.viajes === cols.viajes &&
    row.total === cols.total &&
    row.t3 === cols.t3 &&
    row.app === cols.app &&
    row.efectivo === cols.efectivo &&
    row.tarjetas === cols.tarjetas &&
    row.propinas === cols.propinas &&
    row.primas === cols.primas &&
    row.peajes === cols.peajes &&
    (cols.avisos ?? row.avisos) === row.avisos
  );
}

/** Apply API detail totals to a Cerrar turnos row (table ↔ detalle). */
export function mergeRowWithDetailMetrics(
  row: CerrarTurnosRow,
  metrics: PlatformShiftMetrics,
): CerrarTurnosRow {
  const cols = {
    viajes: metrics.viajes,
    total: metrics.total,
    t3: metrics.t3,
    app: metrics.app,
    efectivo: metrics.efectivo,
    tarjetas: metrics.tarjetas,
    propinas: metrics.propinas,
    primas: metrics.primas,
    peajes: metrics.peajes,
    avisos: metrics.avisos ?? row.avisos,
  };

  const desglose = row.desglose?.map((d) =>
    d.platform === metrics.platform ? { ...d, ...cols, platform: d.platform } : d,
  );

  if (rowMetricsMatch(row, cols)) {
    return row;
  }

  return {
    ...row,
    ...cols,
    desglose: desglose ?? row.desglose,
  };
}
