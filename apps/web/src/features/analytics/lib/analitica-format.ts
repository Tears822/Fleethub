import type { AnalyticsRow } from "@/features/analytics/lib/analitica-mock-data";
import { formatEuroAmount } from "@/shared/lib/format-euro";

export function formatEuro(amount: number): string {
  return formatEuroAmount(amount);
}

export function formatEurHour(amount: number): string {
  return (
    amount.toLocaleString("es-ES", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " €"
  );
}

export function scaleRow(row: AnalyticsRow, scale: number): AnalyticsRow {
  if (scale === 1) return row;
  const scaleMoney = (n: number) => Math.round(n * scale * 100) / 100;
  return {
    ...row,
    facturacion: scaleMoney(row.facturacion),
    comisiones: scaleMoney(row.comisiones),
    viajes: Math.max(1, Math.round(row.viajes * scale)),
    turnos: Math.max(1, Math.round(row.turnos * scale)),
    mediaTurno: scaleMoney(row.mediaTurno),
    propinas: scaleMoney(row.propinas),
    primas: scaleMoney(row.primas),
    eurHora: row.eurHora,
  };
}

export function rowToDisplayCells(row: AnalyticsRow): string[] {
  return [
    formatEuro(row.facturacion),
    formatEuro(row.comisiones),
    String(row.viajes),
    String(row.turnos),
    formatEuro(row.mediaTurno),
    formatEurHour(row.eurHora),
    formatEuro(row.propinas),
    formatEuro(row.primas),
  ];
}

export function sumRows(rows: AnalyticsRow[]) {
  const facturacion = rows.reduce((a, r) => a + r.facturacion, 0);
  const comisiones = rows.reduce((a, r) => a + r.comisiones, 0);
  const viajes = rows.reduce((a, r) => a + r.viajes, 0);
  const turnos = rows.reduce((a, r) => a + r.turnos, 0);
  const propinas = rows.reduce((a, r) => a + r.propinas, 0);
  const primas = rows.reduce((a, r) => a + r.primas, 0);
  const mediaTurno = turnos > 0 ? Math.round((facturacion / turnos) * 100) / 100 : 0;
  const neto = facturacion + comisiones;
  const totalHours = rows.reduce((s, r) => {
    if (r.eurHora <= 0) return s;
    return s + r.facturacion / r.eurHora;
  }, 0);
  const eurHora =
    totalHours >= 0.5 ? Math.round((facturacion / totalHours) * 100) / 100 : 0;
  return {
    facturacion,
    comisiones,
    neto,
    viajes,
    turnos,
    mediaTurno,
    eurHora,
    propinas,
    primas,
  };
}
