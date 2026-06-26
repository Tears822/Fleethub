"use client";

import { useMemo } from "react";
import type { BillingTableRow } from "@/features/billing/lib/billing-types";
import {
  formatEuroCell,
  formatServicesCell,
  parseEuroCell,
  parseServicesCell,
} from "@/features/billing/lib/facturacion-mock-format";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type BillingSortKey =
  | "label"
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

const SORT_KEYS: BillingSortKey[] = [
  "label",
  "servicios",
  "factTotal",
  "comision",
  "neto",
  "app",
  "efectivo",
  "tarjeta",
  "t3",
  "propinas",
  "primas",
  "peajes",
];

function cellNum(row: BillingTableRow, index: number): number {
  if (index === 0) return parseServicesCell(row.cells[0] ?? "0");
  return parseEuroCell(row.cells[index] ?? "0 €");
}

function sumColumn(rows: BillingTableRow[], index: number): string {
  if (rows.length === 0) return index === 0 ? "0" : "0 €";
  if (index === 0) {
    const total = rows.reduce((acc, row) => acc + parseServicesCell(row.cells[0]), 0);
    return formatServicesCell(total);
  }
  const total = rows.reduce((acc, row) => acc + parseEuroCell(row.cells[index] ?? "0 €"), 0);
  return formatEuroCell(total);
}

export function billingTableHeaders(labelColumn: string, metricHeaders: string[]): string[] {
  return [labelColumn, ...metricHeaders];
}

export function BillingMetricsTable({
  labelColumn,
  rows,
  emptyMessage,
}: {
  labelColumn: string;
  rows: BillingTableRow[];
  emptyMessage?: string;
}) {
  const { t } = useTranslations();
  const resolvedEmpty = emptyMessage ?? t("billing.empty.noRows");

  const metricHeaders = useMemo(
    () => [
      t("billing.metrics.servicios"),
      t("billing.metrics.factTotal"),
      t("billing.metrics.comision"),
      t("billing.metrics.neto"),
      t("billing.metrics.app"),
      t("billing.metrics.efectivo"),
      t("billing.metrics.tarjeta"),
      t("billing.metrics.t3"),
      t("billing.metrics.propinas"),
      t("billing.metrics.primas"),
      t("billing.metrics.peajes"),
    ],
    [t],
  );

  const headerLabels: Record<BillingSortKey, string> = useMemo(
    () => ({
      label: "",
      servicios: metricHeaders[0] ?? "",
      factTotal: metricHeaders[1] ?? "",
      comision: metricHeaders[2] ?? "",
      neto: metricHeaders[3] ?? "",
      app: metricHeaders[4] ?? "",
      efectivo: metricHeaders[5] ?? "",
      tarjeta: metricHeaders[6] ?? "",
      t3: metricHeaders[7] ?? "",
      propinas: metricHeaders[8] ?? "",
      primas: metricHeaders[9] ?? "",
      peajes: metricHeaders[10] ?? "",
    }),
    [metricHeaders],
  );

  const { sortedRows, toggle, dirFor } = useTableSort<BillingSortKey, BillingTableRow>(
    rows,
    "factTotal",
    "desc",
    {
      label: (a, b, d) => compareStrings(a.label, b.label, d),
      servicios: (a, b, d) =>
        compareNumbers(cellNum(a, 0), cellNum(b, 0), d),
      factTotal: (a, b, d) =>
        compareNumbers(cellNum(a, 1), cellNum(b, 1), d),
      comision: (a, b, d) =>
        compareNumbers(cellNum(a, 2), cellNum(b, 2), d),
      neto: (a, b, d) => compareNumbers(cellNum(a, 3), cellNum(b, 3), d),
      app: (a, b, d) => compareNumbers(cellNum(a, 4), cellNum(b, 4), d),
      efectivo: (a, b, d) =>
        compareNumbers(cellNum(a, 5), cellNum(b, 5), d),
      tarjeta: (a, b, d) =>
        compareNumbers(cellNum(a, 6), cellNum(b, 6), d),
      t3: (a, b, d) => compareNumbers(cellNum(a, 7), cellNum(b, 7), d),
      propinas: (a, b, d) =>
        compareNumbers(cellNum(a, 8), cellNum(b, 8), d),
      primas: (a, b, d) =>
        compareNumbers(cellNum(a, 9), cellNum(b, 9), d),
      peajes: (a, b, d) =>
        compareNumbers(cellNum(a, 10), cellNum(b, 10), d),
    },
  );

  const tableTotals = useMemo(
    () => metricHeaders.map((_, i) => sumColumn(rows, i)),
    [metricHeaders, rows],
  );

  return (
    <VuiTableShell className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="vui-table-head">
          <tr>
            <VuiSortableTh
              label={labelColumn}
              activeDir={dirFor("label")}
              onSort={() => toggle("label")}
            />
            {SORT_KEYS.filter((k) => k !== "label").map((key) => (
              <VuiSortableTh
                key={key}
                label={headerLabels[key]}
                align="right"
                className="text-right"
                activeDir={dirFor(key)}
                onSort={() => toggle(key)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr className="vui-table-row">
              <td colSpan={metricHeaders.length + 1} className="py-8 text-center text-sm text-zinc-500">
                {resolvedEmpty}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={row.rowKey} className="vui-table-row">
                <td className="font-semibold text-zinc-900">{row.label}</td>
                {row.cells.map((c, j) => (
                  <td
                    key={j}
                    className={
                      j === 2
                        ? "text-right tabular-nums font-medium text-red-600"
                        : "text-right tabular-nums text-zinc-800"
                    }
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-bold text-zinc-900">
              <td className="px-3 py-2.5 uppercase tracking-wide">{t("billing.export.total")}</td>
              {tableTotals.map((value, j) => (
                <td
                  key={j}
                  className={`px-3 py-2.5 text-right tabular-nums ${j === 2 ? "text-red-600" : ""}`}
                >
                  {value}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </VuiTableShell>
  );
}
