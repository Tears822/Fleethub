"use client";

import type { PlatformShiftMetrics } from "@/features/shifts/ui/cerrar-turnos-types";
import type { ReactNode } from "react";
import { parseEuroCell } from "@/features/billing/lib/facturacion-mock-format";
import { useTranslations } from "@/shared/i18n/i18n-provider";

const METRIC_CELL =
  "whitespace-nowrap tabular-nums text-right text-zinc-800 [&:has(button)]:text-left [&:has(select)]:text-left";

function formatEuroDisplay(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function displayTaximetro(
  metrics: Pick<PlatformShiftMetrics, "taximetro" | "total" | "t3">,
): string {
  if (metrics.taximetro) return metrics.taximetro;
  return formatEuroDisplay(Math.max(0, parseEuroCell(metrics.total) - parseEuroCell(metrics.t3)));
}

export const SHIFT_METRIC_LABELS = {
  viajes: "Viajes",
  total: "Importe total",
  taximetro: "Taxímetro",
  t3: "Tarifa 3",
  app: "Pago app",
  efectivo: "Efectivo",
  tarjetas: "Tarjetas",
  propinas: "Propinas",
  primas: "Primas",
  peajes: "Peajes",
  avisos: "Avisos",
} as const;

type ShiftMetricsCellsProps = {
  metrics: PlatformShiftMetrics;
  showAvisos?: boolean;
  /** Extra classes on each metric `<td>` (e.g. inner breakdown table padding). */
  cellClassName?: string;
};

export function ShiftMetricsCells({
  metrics,
  showAvisos = true,
  cellClassName = "",
}: ShiftMetricsCellsProps) {
  const td = [METRIC_CELL, cellClassName].filter(Boolean).join(" ");

  return (
    <>
      <td className={td}>{metrics.viajes}</td>
      <td className={`${td} font-semibold text-emerald-700`}>{metrics.total}</td>
      <td className={td}>{displayTaximetro(metrics)}</td>
      <td className={td}>{metrics.t3}</td>
      <td className={td}>{metrics.app}</td>
      <td className={td}>{metrics.efectivo}</td>
      <td className={td}>{metrics.tarjetas}</td>
      <td className={td}>{metrics.propinas}</td>
      <td className={td}>{metrics.primas}</td>
      <td className={td}>{metrics.peajes}</td>
      {showAvisos ? (
        <td className={`${cellClassName} whitespace-nowrap text-right`}>
          {(metrics.avisos ?? 0) > 0 ? (
            <span className="inline-flex min-w-[1.5rem] justify-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-200">
              {metrics.avisos}
            </span>
          ) : (
            <span className="text-zinc-500">—</span>
          )}
        </td>
      ) : null}
    </>
  );
}

type SummaryItem = { label: string; value: ReactNode; emphasis?: boolean };

export function ShiftMetricsSummaryStrip({
  metrics,
  showAvisos = true,
}: {
  metrics: PlatformShiftMetrics;
  showAvisos?: boolean;
}) {
  const { t } = useTranslations();
  const items: SummaryItem[] = [
    { label: t("turnos.columns.viajes"), value: metrics.viajes },
    { label: t("turnos.columns.total"), value: metrics.total, emphasis: true },
    { label: t("turnos.columns.taximetro"), value: displayTaximetro(metrics) },
    { label: t("turnos.columns.t3"), value: metrics.t3 },
    { label: t("turnos.columns.app"), value: metrics.app },
    { label: t("turnos.columns.efectivo"), value: metrics.efectivo },
    { label: t("turnos.columns.tarjetas"), value: metrics.tarjetas },
    { label: t("turnos.columns.propinas"), value: metrics.propinas },
    { label: t("turnos.columns.primas"), value: metrics.primas },
    { label: t("turnos.columns.peajes"), value: metrics.peajes },
  ];
  if (showAvisos) {
    items.push({
      label: t("turnos.columns.avisos"),
      value:
        (metrics.avisos ?? 0) > 0 ? (
          <span className="inline-flex min-w-[1.5rem] justify-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-200">
            {metrics.avisos}
          </span>
        ) : (
          "—"
        ),
    });
  }

  return (
    <div
      className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5"
      aria-label={t("turnos.detail.shiftSummaryAria")}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-[4.5rem] text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">
            {item.label}
          </div>
          <div
            className={[
              "mt-0.5 tabular-nums text-xs",
              item.emphasis ? "font-semibold text-emerald-700" : "font-medium text-zinc-800",
            ].join(" ")}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
