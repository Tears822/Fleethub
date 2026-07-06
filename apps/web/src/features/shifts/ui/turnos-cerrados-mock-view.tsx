"use client";

import {
  BILLING_DEMO_RANGE_QUERY,
  billingMonthQuickOptions,
  billingRangeQueryFromEs,
  last7DaysRangeEs,
} from "@/features/billing/lib/billing-date-range";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  shiftLiveDetailFromRow,
  shiftRowKey,
  type ClosedShiftRow,
} from "@/features/shifts/ui/cerrar-turnos-types";
import { formatDateEs, dateEsToIso, parseDateEs } from "@/shared/lib/date-es";
import { ShiftDetailToggleButton } from "@/features/shifts/ui/shift-detail-toggle-button";
import { ShiftRowDetailPanel } from "@/features/shifts/ui/shift-row-detail-panel";
import { matchesSearchQuery } from "@/shared/lib/normalize-search";
import { ErpDateInput } from "@/shared/ui/erp-date-input";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import {
  collectPlatformFiltersFromRows,
  isMultiPlatform,
  platformSlugsFromRow,
  shiftPlatformDisplayName,
} from "@/features/shifts/lib/shift-platform";
import { ShiftPlatformDots } from "@/shared/ui/shift-platform-dots";
import { SuperAdminRevertCloseButton, AdminReopenClosedShiftButton } from "@/features/shifts/ui/super-admin-revert-close-button";
import {
  filterShiftRowsForPlatform,
  shiftExportXlsxHref,
  type ShiftPlatformFilter,
} from "@/features/shifts/lib/shift-platform-filter";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import {
  ShiftMetricsSortableHead,
  useClosedShiftTableSort,
} from "@/features/shifts/ui/shift-metrics-sortable-head";
import { formatClosedShiftDateCell } from "@/features/shifts/lib/closed-shift-sort";
import { appendTurnosCerradosContextParams } from "@/features/shifts/lib/turnos-cerrados-url";
import { displayTaximetro } from "@/features/shifts/ui/shift-metrics-cells";

function shiftRowDomId(key: string): string {
  return `shift-${encodeURIComponent(key)}`;
}

function rowOverlapsRange(row: ClosedShiftRow, from: Date, to: Date): boolean {
  const start = new Date(`${row.periodStart}T00:00:00`);
  const end = new Date(`${row.periodEnd}T23:59:59.999`);
  const rangeStart = new Date(from);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(to);
  rangeEnd.setHours(23, 59, 59, 999);
  return start <= rangeEnd && end >= rangeStart;
}

const DEFAULT_CLOSED_SHIFTS_RANGE = last7DaysRangeEs();

export function TurnosCerradosMockView({
  initialDbRows = [],
  dateFrom: dateFromProp = DEFAULT_CLOSED_SHIFTS_RANGE.fromEs,
  dateTo: dateToProp = DEFAULT_CLOSED_SHIFTS_RANGE.toEs,
  initialOpenShiftKey,
  initialDriverId,
  canExportCsv = false,
  canExportExcel = false,
  canRevertClose = false,
  canReopenClosedShift = false,
  tenantId,
}: {
  initialDbRows?: ClosedShiftRow[];
  dateFrom?: string;
  dateTo?: string;
  /** Abre el detalle del turno (p. ej. desde ficha de conductor). */
  initialOpenShiftKey?: string;
  /** Filtra la lista a un conductor (p. ej. enlace desde ficha). */
  initialDriverId?: string;
  canExportCsv?: boolean;
  canExportExcel?: boolean;
  /** Super Admin impersonating — puede revertir cierres erróneos (FRD §7.5). */
  canRevertClose?: boolean;
  /** Administrador del tenant — puede reabrir un turno cerrado para corregirlo. */
  canReopenClosedShift?: boolean;
  tenantId?: string;
}) {
  const router = useRouter();
  const { t, locale } = useTranslations();
  const toast = useToast();
  const usingLiveData = initialDbRows.length > 0;
  const rows = initialDbRows;
  const monthOptions = useMemo(() => billingMonthQuickOptions(undefined, locale), [locale]);

  const [driverFilterId, setDriverFilterId] = useState<string | undefined>(initialDriverId);
  const [searchQuery, setSearchQuery] = useState(() => {
    if (!initialDriverId) return "";
    const match = initialDbRows.find((r) => r.driverId === initialDriverId);
    return match?.conductor ?? "";
  });
  const [platformFilter, setPlatformFilter] = useState<ShiftPlatformFilter>("all");
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(
    initialOpenShiftKey ?? null,
  );
  const [dateFrom, setDateFrom] = useState(dateFromProp);
  const [dateTo, setDateTo] = useState(dateToProp);
  const [appliedFrom, setAppliedFrom] = useState<Date | null>(() => parseDateEs(dateFromProp));
  const [appliedTo, setAppliedTo] = useState<Date | null>(() => parseDateEs(dateToProp));

  useEffect(() => {
    setDateFrom(dateFromProp);
    setDateTo(dateToProp);
    setAppliedFrom(parseDateEs(dateFromProp));
    setAppliedTo(parseDateEs(dateToProp));
  }, [dateFromProp, dateToProp]);

  useEffect(() => {
    setDriverFilterId(initialDriverId);
    if (!initialDriverId) return;
    const match = rows.find((r) => r.driverId === initialDriverId);
    if (match) setSearchQuery(match.conductor);
  }, [initialDriverId, rows]);

  const navContext = useMemo(
    () => ({
      shift: expandedRowKey ?? initialOpenShiftKey,
      driver: driverFilterId,
    }),
    [driverFilterId, expandedRowKey, initialOpenShiftKey],
  );

  const platformFilterOptions = useMemo(
    () => collectPlatformFiltersFromRows(rows),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const platformScoped = filterShiftRowsForPlatform(rows, platformFilter);
    return platformScoped.filter((row) => {
      if (driverFilterId && row.driverId !== driverFilterId) return false;
      if (!matchesSearchQuery(row.conductor, searchQuery)) return false;
      if (appliedFrom && appliedTo && !rowOverlapsRange(row, appliedFrom, appliedTo)) {
        return false;
      }
      return true;
    });
  }, [appliedFrom, appliedTo, driverFilterId, platformFilter, rows, searchQuery]);

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } =
    useClosedShiftTableSort(filteredRows);

  const exportFromIso = appliedFrom ? dateEsToIso(formatDateEs(appliedFrom)) : undefined;
  const exportToIso = appliedTo ? dateEsToIso(formatDateEs(appliedTo)) : undefined;
  const exportHref = useMemo(
    () =>
      shiftExportXlsxHref("turnos-cerrados", {
        platform: platformFilter,
        fromIso: exportFromIso,
        toIso: exportToIso,
        search: searchQuery,
      }),
    [exportFromIso, exportToIso, platformFilter, searchQuery],
  );

  useEffect(() => {
    if (!initialOpenShiftKey) {
      if (platformFilter !== "all") setExpandedRowKey(null);
      return;
    }
    if (rows.length === 0) return;
    const target = rows.find((r) => shiftRowKey(r) === initialOpenShiftKey);
    if (!target) return;
    setExpandedRowKey(initialOpenShiftKey);
    setDriverFilterId(target.driverId);
    setSearchQuery(target.conductor);
    const toEs = (iso: string) => {
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const fromEs = toEs(target.periodStart);
    const endEs = toEs(target.periodEnd);
    setDateFrom(fromEs);
    setDateTo(endEs);
    setAppliedFrom(parseDateEs(fromEs));
    setAppliedTo(parseDateEs(endEs));
  }, [initialOpenShiftKey, platformFilter, rows]);

  useEffect(() => {
    if (
      expandedRowKey &&
      expandedRowKey !== initialOpenShiftKey &&
      !filteredRows.some((r) => shiftRowKey(r) === expandedRowKey)
    ) {
      setExpandedRowKey(null);
    }
  }, [expandedRowKey, filteredRows, initialOpenShiftKey]);

  useEffect(() => {
    if (!expandedRowKey) return;
    const el = document.getElementById(shiftRowDomId(expandedRowKey));
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [expandedRowKey]);

  const toggleDetail = useCallback((key: string) => {
    setExpandedRowKey((current) => (current === key ? null : key));
  }, []);

  const applyDateRange = useCallback(() => {
    const built = billingRangeQueryFromEs(dateFrom, dateTo);
    if (!built.ok) {
      toast.error(built.message);
      return;
    }
    const params = appendTurnosCerradosContextParams(
      new URLSearchParams(built.query),
      navContext,
    );
    router.push(`/turnos-cerrados?${params.toString()}`);
    router.refresh();
  }, [dateFrom, dateTo, navContext, router, toast]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setPlatformFilter("all");
    setDriverFilterId(undefined);
    setExpandedRowKey(null);
    setDateFrom(dateFromProp);
    setDateTo(dateToProp);
    setAppliedFrom(parseDateEs(dateFromProp));
    setAppliedTo(parseDateEs(dateToProp));
    const built = billingRangeQueryFromEs(dateFromProp, dateToProp);
    if (built.ok) {
      router.push(`/turnos-cerrados?${built.query}`);
      router.refresh();
    }
  }, [dateFromProp, dateToProp, router]);

  const setQuickRange = useCallback(
    (preset: "today" | "yesterday" | "7d" | "30d") => {
      const end = new Date();
      const start = new Date();
      if (preset === "yesterday") {
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
      } else if (preset === "7d") {
        start.setDate(start.getDate() - 6);
      } else if (preset === "30d") {
        start.setDate(start.getDate() - 29);
      }
      const built = billingRangeQueryFromEs(formatDateEs(start), formatDateEs(end));
      if (!built.ok) return;
      const params = appendTurnosCerradosContextParams(
        new URLSearchParams(built.query),
        navContext,
      );
      router.push(`/turnos-cerrados?${params.toString()}`);
      router.refresh();
    },
    [navContext, router],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (driverFilterId) setDriverFilterId(undefined);
  }, [driverFilterId]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    platformFilter !== "all" ||
    Boolean(driverFilterId) ||
    dateFrom !== dateFromProp ||
    dateTo !== dateToProp;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        {!usingLiveData ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            No hay liquidaciones en este periodo ({dateFromProp} – {dateToProp}). Liquida en{" "}
            <a href="/cerrar-turnos" className="font-medium text-zinc-800 underline">
              Cerrar turnos
            </a>{" "}
            o prueba{" "}
            <code className="text-xs">/turnos-cerrados?{BILLING_DEMO_RANGE_QUERY}</code> tras el seed.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Liquidaciones en caja (fecha de cierre en el periodo {dateFromProp} – {dateToProp}).
            Ajuste fechas y plataforma para acotar la lista.
            {canRevertClose ? (
              <>
                {" "}
                Como Super Admin puede{" "}
                <span className="font-medium text-amber-800">revertir un cierre</span> para devolver
                viajes a pendientes.
              </>
            ) : canReopenClosedShift ? (
              <>
                {" "}
                Como administrador puede{" "}
                <span className="font-medium text-amber-800">modificar un turno cerrado</span>{" "}
                (los viajes vuelven a Cerrar turnos).
              </>
            ) : null}
          </p>
        )}
        <p className="text-sm text-zinc-600">
          {hasActiveFilters && filteredRows.length !== rows.length
            ? t("turnos.closedCountFiltered", {
                filtered: filteredRows.length,
                total: rows.length,
              })
            : t("turnos.closedCount", { count: filteredRows.length })}
        </p>
      </div>

      <VuiPanel className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-5">
        <div className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ErpSearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={t("turnos.searchConductor")}
            aria-label={t("conductores.searchAria")}
            wrapperClassName="min-w-[10rem] flex-1 md:max-w-xs"
          />
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as ShiftPlatformFilter)}
            className="erp-inline-input min-w-[10rem]"
            aria-label={t("turnos.filterPlatform")}
          >
            <option value="all">{t("turnos.allPlatforms")}</option>
            {platformFilterOptions.map((p) => (
              <option key={p} value={p}>
                {shiftPlatformDisplayName(p)}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                [t("turnos.presetToday"), "today"],
                [t("turnos.presetYesterday"), "yesterday"],
                [t("turnos.preset7d"), "7d"],
                [t("turnos.preset30d"), "30d"],
              ] as const
            ).map(([label, preset]) => (
              <button
                key={label}
                type="button"
                className="erp-filter-btn py-1.5 text-[10px]"
                onClick={() => setQuickRange(preset)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("turnos.dateFrom")}
            <ErpDateInput
              value={dateFrom}
              onChange={setDateFrom}
              aria-label={t("turnos.dateFrom")}
            />
          </label>
          <span className="pb-1.5 text-zinc-600">—</span>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("turnos.dateTo")}
            <ErpDateInput value={dateTo} onChange={setDateTo} aria-label={t("turnos.dateTo")} />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("turnos.month")}
            <select
              className="erp-inline-input mt-1 block min-w-[9rem]"
              defaultValue=""
              aria-label={t("turnos.month")}
              onChange={(e) => {
                const opt = monthOptions.find((m) => m.key === e.target.value);
                if (!opt) return;
                setDateFrom(opt.fromEs);
                setDateTo(opt.toEs);
                const params = appendTurnosCerradosContextParams(
                  new URLSearchParams(opt.query),
                  navContext,
                );
                router.push(`/turnos-cerrados?${params.toString()}`);
                router.refresh();
              }}
            >
              <option value="">{t("turnos.quickMonth")}</option>
              {monthOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="erp-btn-primary"
            disabled={!parseDateEs(dateFrom) || !parseDateEs(dateTo)}
            onClick={applyDateRange}
          >
            {t("turnos.apply")}
          </button>
          <button
            type="button"
            className="erp-filter-btn"
            disabled={!hasActiveFilters}
            onClick={clearFilters}
          >
            {t("turnos.clearFilters")}
          </button>
          {canExportCsv ? (
            <p className="ml-auto text-[11px] text-zinc-500">{t("turnos.csvExportHint")}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{t("turnos.cerrados")}</h3>
            <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
              {t("turnos.cerradosBadge", { count: filteredRows.length })}
            </span>
            {platformFilter !== "all" ? (
              <span className="text-[10px] font-medium uppercase text-zinc-500">
                · {shiftPlatformDisplayName(platformFilter)}
              </span>
            ) : null}
          </div>
          {canExportExcel ? (
            <ExportFileButton
              href={exportHref}
              label={t("turnos.exportExcel")}
              filename="turnos-cerrados.xlsx"
            />
          ) : null}
        </div>
        </div>

        <VuiTableShell className="shift-list-table-scroll min-h-[8rem]">
          <table className="w-full min-w-[1024px] text-left text-sm">
            <thead className="vui-table-head vui-table-sticky-head">
              <ShiftMetricsSortableHead
                dirFor={dirFor}
                toggle={toggleSort}
                showClosedDate
                actionsLabel=""
              />
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr className="vui-table-row">
                  <td colSpan={14} className="py-8 text-center text-sm text-zinc-500">
                    {rows.length === 0
                      ? t("turnos.noClosed")
                      : t("turnos.noClosedFilterMatch")}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((r) => {
                const rowKey = shiftRowKey(r);
                const isExpanded = expandedRowKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      id={shiftRowDomId(rowKey)}
                      className={`vui-table-row ${isExpanded ? "bg-zinc-50" : ""}`}
                    >
                      <td className="w-0 whitespace-nowrap">
                        <ShiftPlatformDots
                          slugs={platformSlugsFromRow(r.plataformas, r.desglose)}
                        />
                      </td>
                      <td className="whitespace-nowrap text-[11px] tabular-nums text-zinc-700">
                        {formatClosedShiftDateCell(r)}
                      </td>
                      <td className="min-w-[10rem] max-w-[14rem]">
                        <div className="font-medium text-zinc-900">{r.conductor}</div>
                        <div className="text-[11px] text-zinc-600">{r.rango}</div>
                      </td>
                      <td className="text-right tabular-nums">{r.viajes}</td>
                      <td className="text-right font-semibold text-zinc-900">{r.total}</td>
                      <td className="text-right tabular-nums">{displayTaximetro(r)}</td>
                      <td className="text-right tabular-nums">{r.t3}</td>
                      <td className="text-right tabular-nums">{r.app}</td>
                      <td className="text-right tabular-nums">{r.efectivo}</td>
                      <td className="text-right tabular-nums">{r.tarjetas}</td>
                      <td className="text-right tabular-nums">{r.propinas}</td>
                      <td className="text-right tabular-nums">{r.primas}</td>
                      <td className="text-right tabular-nums">{r.peajes}</td>
                      <td className="w-0 whitespace-nowrap text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <ShiftDetailToggleButton
                            expanded={isExpanded}
                            onToggle={() => toggleDetail(rowKey)}
                          />
                          {canRevertClose && tenantId ? (
                            <SuperAdminRevertCloseButton tenantId={tenantId} row={r} />
                          ) : null}
                          {canReopenClosedShift ? (
                            <AdminReopenClosedShiftButton row={r} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="vui-table-row">
                        <td colSpan={14} className="p-0">
                          <ShiftRowDetailPanel
                            row={r}
                            variant="cerrado"
                            live={shiftLiveDetailFromRow(r, "closed")}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </VuiTableShell>
      </VuiPanel>
    </div>
  );
}
