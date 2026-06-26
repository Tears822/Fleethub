"use client";

import type { ShiftTableRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { parseEuroCell } from "@/features/billing/lib/facturacion-mock-format";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import { useOptionalTranslations } from "@/shared/i18n/i18n-provider";

export type ShiftSortKey =
  | "conductor"
  | "viajes"
  | "total"
  | "taximetro"
  | "t3"
  | "app"
  | "efectivo"
  | "tarjetas"
  | "propinas"
  | "primas"
  | "peajes"
  | "avisos";

const SHIFT_SORT_COMPARATORS = {
  conductor: (a: ShiftTableRow, b: ShiftTableRow, d) =>
    compareStrings(a.conductor, b.conductor, d),
  viajes: (a, b, d) => compareNumbers(a.viajes, b.viajes, d),
  total: (a, b, d) => compareNumbers(parseEuroCell(a.total), parseEuroCell(b.total), d),
  taximetro: (a, b, d) =>
    compareNumbers(parseEuroCell(a.taximetro), parseEuroCell(b.taximetro), d),
  t3: (a, b, d) => compareNumbers(parseEuroCell(a.t3), parseEuroCell(b.t3), d),
  app: (a, b, d) => compareNumbers(parseEuroCell(a.app), parseEuroCell(b.app), d),
  efectivo: (a, b, d) =>
    compareNumbers(parseEuroCell(a.efectivo), parseEuroCell(b.efectivo), d),
  tarjetas: (a, b, d) =>
    compareNumbers(parseEuroCell(a.tarjetas), parseEuroCell(b.tarjetas), d),
  propinas: (a, b, d) =>
    compareNumbers(parseEuroCell(a.propinas), parseEuroCell(b.propinas), d),
  primas: (a, b, d) => compareNumbers(parseEuroCell(a.primas), parseEuroCell(b.primas), d),
  peajes: (a, b, d) => compareNumbers(parseEuroCell(a.peajes), parseEuroCell(b.peajes), d),
  avisos: (a, b, d) =>
    compareNumbers(
      "avisos" in a ? Number((a as { avisos?: number }).avisos ?? 0) : 0,
      "avisos" in b ? Number((b as { avisos?: number }).avisos ?? 0) : 0,
      d,
    ),
} satisfies Record<
  ShiftSortKey,
  (a: ShiftTableRow, b: ShiftTableRow, dir: import("@/shared/lib/table-sort").SortDir) => number
>;

export function useShiftTableSort<T extends ShiftTableRow>(rows: T[]) {
  return useTableSort<ShiftSortKey, T>(rows, "total", "desc", SHIFT_SORT_COMPARATORS);
}

type HeadProps = {
  dirFor: (key: ShiftSortKey) => import("@/shared/lib/table-sort").SortDir | null;
  toggle: (key: ShiftSortKey) => void;
  showAvisos?: boolean;
  actionsLabel?: string;
};

export function ShiftMetricsSortableHead({
  dirFor,
  toggle,
  showAvisos = false,
  actionsLabel,
}: HeadProps) {
  const { t } = useOptionalTranslations();
  const actions = actionsLabel ?? t("turnos.columns.actions");
  return (
    <tr>
      <th className="w-0 whitespace-nowrap">{t("turnos.columns.platforms")}</th>
      <VuiSortableTh
        label={t("turnos.columns.conductor")}
        className="min-w-[10rem] max-w-[14rem]"
        activeDir={dirFor("conductor")}
        onSort={() => toggle("conductor")}
      />
      <VuiSortableTh
        label={t("turnos.columns.viajes")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("viajes")}
        onSort={() => toggle("viajes")}
      />
      <VuiSortableTh
        label={t("turnos.columns.total")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("total")}
        onSort={() => toggle("total")}
      />
      <VuiSortableTh
        label={t("turnos.columns.taximetro")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("taximetro")}
        onSort={() => toggle("taximetro")}
      />
      <VuiSortableTh
        label={t("turnos.columns.t3")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("t3")}
        onSort={() => toggle("t3")}
      />
      <VuiSortableTh
        label={t("turnos.columns.app")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("app")}
        onSort={() => toggle("app")}
      />
      <VuiSortableTh
        label={t("turnos.columns.efectivo")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("efectivo")}
        onSort={() => toggle("efectivo")}
      />
      <VuiSortableTh
        label={t("turnos.columns.tarjetas")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("tarjetas")}
        onSort={() => toggle("tarjetas")}
      />
      <VuiSortableTh
        label={t("turnos.columns.propinas")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("propinas")}
        onSort={() => toggle("propinas")}
      />
      <VuiSortableTh
        label={t("turnos.columns.primas")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("primas")}
        onSort={() => toggle("primas")}
      />
      <VuiSortableTh
        label={t("turnos.columns.peajes")}
        align="right"
        className="whitespace-nowrap tabular-nums"
        activeDir={dirFor("peajes")}
        onSort={() => toggle("peajes")}
      />
      {showAvisos ? (
        <VuiSortableTh
          label={t("turnos.columns.avisos")}
          align="right"
          className="whitespace-nowrap tabular-nums"
          activeDir={dirFor("avisos")}
          onSort={() => toggle("avisos")}
        />
      ) : null}
      <th className="w-0 whitespace-nowrap text-right">{actions}</th>
    </tr>
  );
}
