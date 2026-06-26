"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { SHELL_ROUTE_TRANSITION_EVENT } from "@/features/shell/ui/use-shell-route-transition";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";
import { getPlatformBreakdown } from "@/features/shifts/lib/cerrar-turnos-mock-detail";
import {
  type CerrarTurnosRow,
  type PlatformShiftMetrics,
  type ShiftPlatformName,
  parsePlatformTripDetailKey,
  platformTripDetailKey,
  SHIFT_CLOSE_BUTTON_CLASS,
  shiftLiveDetailFromRow,
  shiftRowKey,
} from "@/features/shifts/ui/cerrar-turnos-types";
import { ShiftDetailToggleButton } from "@/features/shifts/ui/shift-detail-toggle-button";
import { ShiftPlatformBreakdown } from "@/features/shifts/ui/shift-platform-breakdown";
import { ShiftPlatformTripDetailPanel } from "@/features/shifts/ui/shift-row-detail-panel";
import { matchesSearchQuery } from "@/shared/lib/normalize-search";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { OperativaWriteButton } from "@/shared/ui/operativa-write-button";
import {
  collectPlatformFiltersFromRows,
  displayNameToRidePlatform,
  isMultiPlatform,
  platformSlugsFromRow,
  shiftPlatformDisplayName,
} from "@/features/shifts/lib/shift-platform";
import { appsPlatformDisplayName } from "@/features/apps/lib/apps-platform";
import { ShiftPlatformDots } from "@/shared/ui/shift-platform-dots";
import { RidePlatform } from "@prisma/client";
import type { LiquidationPreviewDto } from "@/features/shifts/lib/format-liquidation";
import {
  ShiftMetricsSortableHead,
  useShiftTableSort,
} from "@/features/shifts/ui/shift-metrics-sortable-head";
import {
  ShiftMetricsCells,
  ShiftMetricsSummaryStrip,
} from "@/features/shifts/ui/shift-metrics-cells";
import {
  ShiftCloseFranjaDialog,
  type ShiftCloseFranjaOptions,
} from "@/features/shifts/ui/shift-close-franja-dialog";
import {
  filterShiftRowsForPlatform,
  shiftExportXlsxHref,
  type ShiftPlatformFilter,
} from "@/features/shifts/lib/shift-platform-filter";
import { mergeRowWithDetailMetrics } from "@/features/shifts/lib/shift-row-metrics-sync";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type StatusFilter = "all" | "activo" | "inactivo";

function matchesStatus(row: CerrarTurnosRow, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const turnoAbierto = row.turnoAbierto !== false;
  if (filter === "activo") return turnoAbierto;
  return !turnoAbierto;
}

function statusFilterBtnClass(selected: boolean): string {
  return [
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
    selected
      ? "border-zinc-400 bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300"
      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
  ].join(" ");
}

function singlePlatformName(row: CerrarTurnosRow): ShiftPlatformName {
  if (row.desglose?.length === 1) return row.desglose[0]!.platform;
  const slugs = platformSlugsFromRow(row.plataformas, row.desglose);
  return appsPlatformDisplayName(slugs[0] ?? "uber");
}

function closePlatformForRow(row: CerrarTurnosRow): RidePlatform | undefined {
  if (isMultiPlatform(row.plataformas)) return undefined;
  const slugs = platformSlugsFromRow(row.plataformas, row.desglose);
  const upper = slugs[0]?.toUpperCase();
  if (upper && upper in RidePlatform) return upper as RidePlatform;
  return RidePlatform.UBER;
}

/** Franja horaria / plataforma solo cuando el turno no se puede cerrar de un clic. */
function needsFranjaDialog(row: CerrarTurnosRow, initialPlatform?: RidePlatform): boolean {
  const defaultFrom = row.periodFromIso ? new Date(row.periodFromIso) : new Date();
  const defaultTo = row.periodToIso ? new Date(row.periodToIso) : new Date();
  const spansMultipleDays =
    defaultFrom.toDateString() !== defaultTo.toDateString() ||
    defaultTo.getTime() - defaultFrom.getTime() > 20 * 60 * 60 * 1000;
  if (spansMultipleDays || (row.avisos ?? 0) > 0) return true;
  if (isMultiPlatform(row.plataformas) && !initialPlatform) return true;
  return false;
}

export function CerrarTurnosMockView({
  initialDbRows = [],
  canExportExcel = false,
}: {
  initialDbRows?: CerrarTurnosRow[];
  canExportExcel?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const navigationGuardRef = useRef(false);
  const [rows, setRows] = useState<CerrarTurnosRow[]>(initialDbRows);
  const usingLiveData = initialDbRows.length > 0;

  useEffect(() => {
    setRows(initialDbRows);
  }, [initialDbRows]);

  const [listRefreshing, setListRefreshing] = useState(false);

  const refreshPendingList = useCallback(() => {
    setListRefreshing(true);
    router.refresh();
    window.setTimeout(() => setListRefreshing(false), 600);
  }, [router]);
  const [closingDriverId, setClosingDriverId] = useState<string | null>(null);
  const [closeFranja, setCloseFranja] = useState<{
    row: CerrarTurnosRow;
    initialPlatform?: RidePlatform;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<ShiftPlatformFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedDriverKey, setExpandedDriverKey] = useState<string | null>(null);
  const [expandedTripDetailKey, setExpandedTripDetailKey] = useState<string | null>(null);

  useEffect(() => {
    const onShellNavigate = () => {
      navigationGuardRef.current = true;
      setExpandedDriverKey(null);
      setExpandedTripDetailKey(null);
    };
    window.addEventListener(SHELL_ROUTE_TRANSITION_EVENT, onShellNavigate);
    return () => window.removeEventListener(SHELL_ROUTE_TRANSITION_EVENT, onShellNavigate);
  }, []);

  useEffect(() => {
    if (!usingLiveData) return;
    const detailOpen = expandedDriverKey !== null || expandedTripDetailKey !== null;
    const closeDialogOpen = closeFranja !== null;
    if (detailOpen || closeDialogOpen) return;
    const timer = window.setInterval(() => router.refresh(), 90_000);
    return () => window.clearInterval(timer);
  }, [router, usingLiveData, expandedDriverKey, expandedTripDetailKey, closeFranja]);

  const platformFilterOptions = useMemo(
    () => collectPlatformFiltersFromRows(rows),
    [rows],
  );

  const executeCloseShift = useCallback(
    async (row: CerrarTurnosRow, options: ShiftCloseFranjaOptions) => {
      if (!row.driverId) return;
      setClosingDriverId(row.driverId);
      setCloseFranja(null);
      try {
        const body: Record<string, string> = { driverId: row.driverId };
        if (options.platform) body.platform = options.platform;
        if (options.useTimeRange && options.timeFrom && options.timeTo) {
          body.timeFrom = options.timeFrom;
          body.timeTo = options.timeTo;
        }
        const previewRes = await fetch(buildApiUrl("/api/tenant/shifts/liquidation-preview"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const preview = (await previewRes.json()) as LiquidationPreviewDto & { error?: string };
        if (!previewRes.ok) {
          toast.error(preview.error ?? t("turnos.settlementError"));
          return;
        }
        if (preview.unvalidatedCount > 0) {
          toast.error(t("turnos.closeDialog.unvalidated", { count: preview.unvalidatedCount }));
          return;
        }
        if ((preview.unbalancedPaymentCount ?? 0) > 0) {
          toast.error(
            t("turnos.closeDialog.unbalanced", { count: preview.unbalancedPaymentCount ?? 0 }),
          );
          return;
        }

        const tripIds = preview.tripIds;
        const res = await fetch(buildApiUrl("/api/tenant/shifts/close"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverId: row.driverId,
            tripIds,
            platform: options.platform,
            timeFrom: options.useTimeRange ? options.timeFrom : undefined,
            timeTo: options.useTimeRange ? options.timeTo : undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          closedCount?: number;
          tripIds?: string[];
          driverId?: string;
        };
        if (!res.ok) {
          toast.error(data.error ?? t("turnos.closeError"));
          return;
        }
        toast.success(
          data.closedCount === 1
            ? t("turnos.closeSuccess")
            : t("turnos.closeSuccessMany", { count: data.closedCount ?? 0 }),
        );
        const closedTripIds = data.tripIds ?? tripIds;
        const partialClose =
          options.useTimeRange ||
          Boolean(options.platform) ||
          closedTripIds.length < (row.tripIds?.length ?? 0);
        if (!partialClose) {
          setRows((current) => current.filter((r) => r.driverId !== row.driverId));
        }
        router.refresh();
      } catch {
        toast.error(t("turnos.closeConnectionError"));
      } finally {
        setClosingDriverId(null);
      }
    },
    [router, t, toast],
  );

  const requestCloseShift = useCallback(
    (row: CerrarTurnosRow, initialPlatform?: RidePlatform) => {
      if (!row.driverId || !row.tripIds?.length) {
        toast.error(t("turnos.noTripsToClose"));
        return;
      }
      setExpandedDriverKey(null);
      setExpandedTripDetailKey(null);
      const options: ShiftCloseFranjaOptions = {
        useTimeRange: false,
        platform: initialPlatform ?? closePlatformForRow(row),
      };
      if (needsFranjaDialog(row, initialPlatform)) {
        setCloseFranja({ row, initialPlatform });
        return;
      }
      void executeCloseShift(row, options);
    },
    [executeCloseShift, t, toast],
  );

  const handlePaymentsValidated = useCallback(() => {
    /* Detail panel refetches via detailRefresh; avoid router.refresh() — freezes with large trip lists. */
  }, []);

  const handleDetailMetricsLoaded = useCallback(
    (driverId: string, metrics: PlatformShiftMetrics) => {
      if (navigationGuardRef.current) return;
      setRows((current) =>
        current.map((r) =>
          r.driverId === driverId ? mergeRowWithDetailMetrics(r, metrics) : r,
        ),
      );
    },
    [],
  );

  const filteredRows = useMemo(() => {
    const platformScoped = filterShiftRowsForPlatform(rows, platformFilter);
    return platformScoped.filter((row) => {
      if (!matchesStatus(row, statusFilter)) return false;
      return matchesSearchQuery(row.conductor, searchQuery);
    });
  }, [platformFilter, rows, searchQuery, statusFilter]);

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } =
    useShiftTableSort(filteredRows);

  const exportHref = useMemo(
    () => shiftExportXlsxHref("cerrar-turnos", { platform: platformFilter }),
    [platformFilter],
  );

  useEffect(() => {
    setExpandedDriverKey(null);
    setExpandedTripDetailKey(null);
  }, [platformFilter]);

  useEffect(() => {
    if (expandedDriverKey && !filteredRows.some((r) => shiftRowKey(r) === expandedDriverKey)) {
      setExpandedDriverKey(null);
      setExpandedTripDetailKey(null);
    }
    if (expandedTripDetailKey) {
      const parsed = parsePlatformTripDetailKey(expandedTripDetailKey);
      if (!parsed || !filteredRows.some((r) => shiftRowKey(r) === parsed.driverKey)) {
        setExpandedTripDetailKey(null);
      }
    }
  }, [expandedDriverKey, expandedTripDetailKey, filteredRows]);

  const hasActiveFilters =
    searchQuery.trim() !== "" || platformFilter !== "all" || statusFilter !== "all";

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setPlatformFilter("all");
    setStatusFilter("all");
  }, []);

  const toggleStatusFilter = useCallback((next: "activo" | "inactivo") => {
    setStatusFilter((current) => (current === next ? "all" : next));
  }, []);

  const toggleDriverSummary = useCallback((row: CerrarTurnosRow) => {
    const key = shiftRowKey(row);
    if (isMultiPlatform(row.plataformas)) {
      setExpandedDriverKey((current) => {
        if (current === key) {
          setExpandedTripDetailKey(null);
          return null;
        }
        const breakdown = getPlatformBreakdown(row);
        if (breakdown.length === 1) {
          setExpandedTripDetailKey(
            platformTripDetailKey(key, breakdown[0]!.platform),
          );
        } else {
          setExpandedTripDetailKey(null);
        }
        return key;
      });
      return;
    }

    const platform = singlePlatformName(row);
    const tripKey = platformTripDetailKey(key, platform);
    setExpandedTripDetailKey((current) => {
      const next = current === tripKey ? null : tripKey;
      setExpandedDriverKey(next ? key : null);
      return next;
    });
  }, []);

  const togglePlatformTripDetail = useCallback((driverKey: string, platform: ShiftPlatformName) => {
    const tripKey = platformTripDetailKey(driverKey, platform);
    setExpandedTripDetailKey((current) => (current === tripKey ? null : tripKey));
    setExpandedDriverKey(driverKey);
  }, []);

  return (
    <div className="space-y-4">
      {!usingLiveData ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          No hay turnos pendientes de liquidar. Cierre viajes desde operativa o ejecute{" "}
          <code className="text-xs">npm run seed -w @fleethub/db</code> en el tenant demo-a.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {t("turnos.helpIntro")}{" "}
          <span className="font-medium text-zinc-700">{t("turnos.helpAvisos")}</span>
        </p>
      )}
      <p className="text-sm text-zinc-600">
        {hasActiveFilters && filteredRows.length !== rows.length ? (
          <>
            <span className="font-semibold text-zinc-900">
              {t("turnos.driversPendingFiltered", {
                filtered: filteredRows.length,
                total: rows.length,
              })}
            </span>
          </>
        ) : (
          <span className="font-semibold text-zinc-900">
            {t("turnos.driversPending", { count: filteredRows.length })}
          </span>
        )}
      </p>

      <VuiPanel className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ErpSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("turnos.searchConductor")}
            aria-label={t("turnos.searchConductor")}
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
          <button
            type="button"
            onClick={() => toggleStatusFilter("activo")}
            className={statusFilterBtnClass(statusFilter === "activo")}
            title={t("turnos.turnoAbierto")}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            {t("turnos.active")}
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("inactivo")}
            className={statusFilterBtnClass(statusFilter === "inactivo")}
            title={t("turnos.turnoCerrado")}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
            {t("turnos.inactive")}
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="erp-filter-btn disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasActiveFilters}
          >
            {t("turnos.clearFilters")}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{t("turnos.pendingClosure")}</h3>
            <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
              {t("turnos.pendingBadge", { count: filteredRows.length })}
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
              filename="cerrar-turnos.xlsx"
            />
          ) : null}
          {usingLiveData ? (
            <button
              type="button"
              onClick={() => refreshPendingList()}
              disabled={listRefreshing}
              title={t("turnos.refreshListTitle")}
              className="erp-btn-outline inline-flex items-center gap-1.5 text-xs normal-case"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${listRefreshing ? "animate-spin" : ""}`}
                aria-hidden
              />
              {listRefreshing ? t("turnos.refreshingList") : t("turnos.refreshList")}
            </button>
          ) : null}
        </div>

        <VuiTableShell className="overflow-x-auto overflow-y-visible">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="vui-table-head vui-table-sticky-head">
              <ShiftMetricsSortableHead
                dirFor={dirFor}
                toggle={toggleSort}
                showAvisos
              />
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr className="vui-table-row">
                  <td colSpan={14} className="py-8 text-center text-sm text-zinc-500">
                    {rows.length === 0 ? t("turnos.noPending") : t("turnos.noFilterMatch")}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((r) => {
                const rowKey = shiftRowKey(r);
                const isMulti = isMultiPlatform(r.plataformas);
                const driverExpanded = expandedDriverKey === rowKey;
                const breakdown = getPlatformBreakdown(r);
                const totalMetrics: PlatformShiftMetrics = {
                  platform: "Uber",
                  viajes: r.viajes,
                  total: r.total,
                  taximetro: r.taximetro,
                  t3: r.t3,
                  app: r.app,
                  efectivo: r.efectivo,
                  tarjetas: r.tarjetas,
                  propinas: r.propinas,
                  primas: r.primas,
                  peajes: r.peajes,
                  avisos: r.avisos,
                };

                const singleTripKey = !isMulti
                  ? platformTripDetailKey(rowKey, singlePlatformName(r))
                  : null;
                const singleTripExpanded =
                  singleTripKey !== null && expandedTripDetailKey === singleTripKey;

                const rowExpanded = driverExpanded || singleTripExpanded;

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={[
                        "vui-table-row",
                        driverExpanded && isMulti
                          ? "border-b-0 bg-zinc-50 ring-1 ring-inset ring-orange-200/80"
                          : driverExpanded || singleTripExpanded
                            ? "bg-zinc-50"
                            : "",
                      ].join(" ")}
                    >
                      <td className="w-0 whitespace-nowrap align-middle">
                        <ShiftPlatformDots
                          slugs={platformSlugsFromRow(r.plataformas, r.desglose)}
                        />
                      </td>
                      <td className="min-w-[10rem] max-w-[14rem]">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.turnoAbierto !== false ? "bg-emerald-500" : "bg-red-500"}`}
                            title={
                              r.turnoAbierto !== false
                                ? t("turnos.turnoAbierto")
                                : t("turnos.turnoCerrado")
                            }
                            aria-label={
                              r.turnoAbierto !== false
                                ? t("turnos.shiftOpenShort")
                                : t("turnos.shiftClosedShort")
                            }
                          />
                          <div>
                            <p className="font-medium text-zinc-900">{r.conductor}</p>
                            <div className="text-[11px] text-zinc-600">
                              {r.rango}
                              {isMulti ? (
                                <span className="font-semibold text-zinc-700"> · TOTAL</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <ShiftMetricsCells metrics={totalMetrics} showAvisos />
                      <td className="w-0 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ShiftDetailToggleButton
                            expanded={isMulti ? driverExpanded : singleTripExpanded}
                            onToggle={() => toggleDriverSummary(r)}
                            labelCollapsed={t("turnos.viewDetail")}
                            labelExpanded={t("turnos.hideDetail")}
                          />
                          <OperativaWriteButton
                            kind="shifts"
                            className={SHIFT_CLOSE_BUTTON_CLASS}
                            disabled={
                              closingDriverId !== null &&
                              r.driverId !== undefined &&
                              closingDriverId === r.driverId
                            }
                            title={
                              (r.avisos ?? 0) > 0 ? t("turnos.closeWithWarningsHint") : undefined
                            }
                            onClick={() => void requestCloseShift(r, closePlatformForRow(r))}
                          >
                            {closingDriverId === r.driverId
                              ? t("turnos.calculating")
                              : isMulti
                                ? t("turnos.cerrar")
                                : t("turnos.closeShift")}
                          </OperativaWriteButton>
                        </div>
                      </td>
                    </tr>

                    {rowExpanded && isMulti ? (
                      <tr className="vui-table-row">
                        <td colSpan={14} className="!p-0">
                          <ShiftMetricsSummaryStrip metrics={totalMetrics} showAvisos />
                        </td>
                      </tr>
                    ) : null}

                    {isMulti && driverExpanded ? (
                      <ShiftPlatformBreakdown
                        row={r}
                        driverKey={rowKey}
                        breakdown={breakdown}
                        expandedTripDetailKey={expandedTripDetailKey}
                        closingDriverId={closingDriverId}
                        onTogglePlatformTrip={(platform) =>
                          togglePlatformTripDetail(rowKey, platform)
                        }
                        onClosePlatform={(platform) => {
                          const ride = displayNameToRidePlatform(platform);
                          if (ride) void requestCloseShift(r, ride);
                        }}
                        onPaymentsValidated={handlePaymentsValidated}
                        onDetailMetricsLoaded={(metrics) => {
                          if (r.driverId) handleDetailMetricsLoaded(r.driverId, metrics);
                        }}
                      />
                    ) : null}

                    {!isMulti && singleTripExpanded ? (
                      <tr className="vui-table-row">
                        <td colSpan={14} className="p-0">
                          <ShiftPlatformTripDetailPanel
                            row={r}
                            platform={singlePlatformName(r)}
                            live={shiftLiveDetailFromRow(
                              r,
                              "pending",
                              displayNameToRidePlatform(singlePlatformName(r)) ?? undefined,
                            )}
                            onPaymentsValidated={handlePaymentsValidated}
                            onDetailMetricsLoaded={(metrics) => {
                              if (r.driverId) handleDetailMetricsLoaded(r.driverId, metrics);
                            }}
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

      {closeFranja ? (
        <ShiftCloseFranjaDialog
          row={closeFranja.row}
          initialPlatform={closeFranja.initialPlatform}
          loading={closingDriverId === closeFranja.row.driverId}
          onContinue={(options) => void executeCloseShift(closeFranja.row, options)}
          onCancel={() => setCloseFranja(null)}
        />
      ) : null}
    </div>
  );
}
