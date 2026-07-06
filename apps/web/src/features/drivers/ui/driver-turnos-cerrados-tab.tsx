"use client";

import Link from "next/link";
import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { shiftRowKey } from "@/features/shifts/ui/cerrar-turnos-types";
import { turnosCerradosHref } from "@/features/shifts/lib/turnos-cerrados-url";
import { platformSlugsFromRow } from "@/features/shifts/lib/shift-platform";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { ShiftPlatformDots } from "@/shared/ui/shift-platform-dots";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { Eye } from "lucide-react";
import {
  ShiftMetricsSortableHead,
  useClosedShiftTableSort,
} from "@/features/shifts/ui/shift-metrics-sortable-head";
import { formatClosedShiftDateCell } from "@/features/shifts/lib/closed-shift-sort";
import { displayTaximetro } from "@/features/shifts/ui/shift-metrics-cells";

export function DriverTurnosCerradosTab({ rows }: { rows: ClosedShiftRow[] }) {
  const { t } = useTranslations();
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useClosedShiftTableSort(rows);

  if (rows.length === 0) {
    return (
      <VuiPanel className="p-8 text-center">
        <p className="text-sm text-zinc-600">{t("conductores.closedShiftsTab.empty")}</p>
      </VuiPanel>
    );
  }

  return (
    <VuiPanel className="p-4 md:p-5">
      <h3 className="text-sm font-bold text-zinc-900">{t("conductores.closedShiftsTab.title")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{t("conductores.closedShiftsTab.hint")}</p>
      <VuiTableShell className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1024px] text-left text-sm">
          <thead className="vui-table-head">
            <ShiftMetricsSortableHead
              dirFor={dirFor}
              toggle={toggleSort}
              showClosedDate
              actionsLabel=""
            />
          </thead>
          <tbody>
            {displayRows.map((r) => {
              const href = turnosCerradosHref(r);
              return (
                <tr key={shiftRowKey(r)} className="vui-table-row group">
                  <td>
                    <Link href={href} className="block py-1">
                      <ShiftPlatformDots
                        slugs={platformSlugsFromRow(r.plataformas, r.desglose)}
                      />
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-[11px] tabular-nums text-zinc-700">
                    <Link href={href} className="block py-1">
                      {formatClosedShiftDateCell(r)}
                    </Link>
                  </td>
                  <td>
                    <Link
                      href={href}
                      className="block py-1 text-inherit no-underline hover:text-emerald-800"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        <div>
                          <div className="font-medium text-zinc-900 group-hover:text-emerald-800">
                            {r.conductor}
                          </div>
                          <div className="text-[11px] text-zinc-600">{r.rango}</div>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.viajes}
                    </Link>
                  </td>
                  <td className="text-right font-semibold text-zinc-900">
                    <Link href={href} className="block py-1">
                      {r.total}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {displayTaximetro(r)}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.t3}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.app}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.efectivo}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.tarjetas}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.propinas}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.primas}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">
                    <Link href={href} className="block py-1">
                      {r.peajes}
                    </Link>
                  </td>
                  <td className="text-right">
                    <Link
                      href={href}
                      className="erp-btn-edit ml-auto inline-flex h-[2.35rem] w-[5.75rem] shrink-0 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 no-underline"
                      title={t("conductores.closedShiftsTab.viewShift")}
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="whitespace-nowrap text-[9px] font-semibold leading-none">
                        {t("conductores.closedShiftsTab.view")}
                      </span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </VuiTableShell>
    </VuiPanel>
  );
}
