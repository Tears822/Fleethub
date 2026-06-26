import type { BillingPeriodKpi, BillingTableRow } from "@/features/billing/lib/billing-types";
import {
  formatEuroCell,
  formatServicesCell,
  parseEuroCell,
  parseServicesCell,
} from "@/features/billing/lib/facturacion-mock-format";

export type BillingTabId = "byDriver" | "byDay" | "global";

function pctOfGrossParams(part: number, total: number): Record<string, string> {
  if (total <= 0) return { pct: "0,0" };
  return { pct: ((part / total) * 100).toFixed(1).replace(".", ",") };
}

function sumColumn(rows: BillingTableRow[], index: number, asEuro: boolean): number {
  return rows.reduce(
    (acc, row) =>
      acc + (asEuro ? parseEuroCell(row.cells[index] ?? "0 €") : parseServicesCell(row.cells[index] ?? "0")),
    0,
  );
}

/** Filas a sumar para KPIs de periodo (evita doble conteo en tab Global). */
export function rowsForPeriodKpiTotals(rows: BillingTableRow[], tab: BillingTabId): BillingTableRow[] {
  if (tab === "global") {
    const total = rows.find((r) => r.rowKey === "total");
    return total ? [total] : rows;
  }
  return rows;
}

export function periodKpisFromTableRows(
  rows: BillingTableRow[],
  driverCount: number,
): BillingPeriodKpi[] {
  const servicios = sumColumn(rows, 0, false);
  const gross = sumColumn(rows, 1, true);
  const comision = sumColumn(rows, 2, true);
  const neto = sumColumn(rows, 3, true);
  const app = sumColumn(rows, 4, true);
  const cash = sumColumn(rows, 5, true);
  const card = sumColumn(rows, 6, true);
  const t3 = sumColumn(rows, 7, true);
  const tips = sumColumn(rows, 8, true);
  const bonus = sumColumn(rows, 9, true);
  const tolls = sumColumn(rows, 10, true);

  return [
    {
      id: "servicios",
      value: formatServicesCell(servicios),
      hintKey: "billing.kpiHint.closedTrips",
    },
    {
      id: "factTotal",
      value: formatEuroCell(gross),
      hintKey: "billing.kpiHint.drivers",
      hintParams: { count: driverCount },
    },
    {
      id: "comision",
      value: formatEuroCell(comision),
      hintKey: "billing.kpiHint.platformFees",
      danger: true,
    },
    {
      id: "neto",
      value: formatEuroCell(neto),
      hintKey: "billing.kpiHint.afterFees",
    },
    {
      id: "app",
      value: formatEuroCell(app),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(app, gross),
    },
    {
      id: "efectivo",
      value: formatEuroCell(cash),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(cash, gross),
    },
    {
      id: "tarjeta",
      value: formatEuroCell(card),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(card, gross),
    },
    {
      id: "t3",
      value: formatEuroCell(t3),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(t3, gross),
      highlight: true,
    },
    {
      id: "propinas",
      value: formatEuroCell(tips),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(tips, gross),
    },
    {
      id: "primas",
      value: formatEuroCell(bonus),
      hintKey: "billing.kpiHint.platformBonus",
      highlight: true,
    },
    {
      id: "peajes",
      value: formatEuroCell(tolls),
      hintKey: "billing.kpiHint.tolls",
    },
  ];
}
