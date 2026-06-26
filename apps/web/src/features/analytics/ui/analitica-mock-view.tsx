"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { billingRangeQueryFromEs } from "@/features/billing/lib/billing-date-range";
import { exportAnaliticaToExcel } from "@/features/analytics/lib/analitica-export";
import {
  KPI_BASE,
  PERIOD_PRESETS,
  SECTOR_KPI_BASE,
  averageAnalyticsRows,
  type AnalyticsRow,
  type PeriodPreset,
  type PlatformFilter,
  matchesPlatform,
  parseDateEs,
  periodScaleForCustomRange,
  platformKpiMultiplier,
  platformLabel,
} from "@/features/analytics/lib/analitica-mock-data";
import {
  analyticsEstadoFromSector,
  buildAnalyticsKpis,
  sectorDriverAveragesToDisplayCells,
  type AnalyticsMetrics,
  type SectorDriverAverages,
} from "@/features/analytics/lib/analytics-kpi";
import type { AnalyticsPlatformFilter } from "@/features/analytics/lib/analytics-platform";
import type { AnalyticsSectorByPlatform } from "@/features/analytics/lib/analytics-types";
import {
  formatEuro,
  formatEurHour,
  rowToDisplayCells,
  sumRows,
} from "@/features/analytics/lib/analitica-format";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import { ErpDateInput } from "@/shared/ui/erp-date-input";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import type { Translator } from "@fleethub/i18n";

type AnaliticaSortKey =
  | "conductor"
  | "facturacion"
  | "comisiones"
  | "viajes"
  | "turnos"
  | "mediaTurno"
  | "eurHora"
  | "propinas"
  | "primas"
  | "estado";

const ESTADO_ORDER: Record<AnalyticsRow["estado"], number> = {
  alerta: 0,
  medio: 1,
  ok: 2,
};

const PLAT: { id: AnalyticsPlatformFilter; labelKey?: string; label?: string; logo?: "uber" | "freenow" | "bolt" | "cabify" }[] = [
  { id: "total", labelKey: "analitica.platforms.total" },
  { id: "uber", label: "Uber", logo: "uber" },
  { id: "freenow", label: "FreeNow", logo: "freenow" },
  { id: "bolt", label: "Bolt", logo: "bolt" },
  { id: "cabify", label: "Cabify", logo: "cabify" },
];

const ANALYTICS_KPI_IDS = ["factTotal", "comisiones", "eurHora", "neto"] as const;

const ESTADO_ICON: Record<
  AnalyticsRow["estado"],
  { Icon: typeof CheckCircle2; wrap: string; icon: string }
> = {
  ok: {
    Icon: CheckCircle2,
    wrap: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80",
    icon: "text-emerald-700",
  },
  medio: {
    Icon: AlertTriangle,
    wrap: "bg-amber-100 text-amber-700 ring-1 ring-amber-200/80",
    icon: "text-amber-700",
  },
  alerta: {
    Icon: XCircle,
    wrap: "bg-red-100 text-red-700 ring-1 ring-red-200/80",
    icon: "text-red-700",
  },
};

function translateVsSector(line: string, t: Translator): string {
  const match = line.match(/^([+-]?\d+)% vs sector \((.+)\)$/);
  if (!match) return line;
  return t("analitica.vsSector", { pct: match[1] ?? "", value: match[2] ?? "" });
}

function EstadoCell({ code }: { code: AnalyticsRow["estado"] }) {
  const { t } = useTranslations();
  const meta = ESTADO_ICON[code];
  const label = t(`analitica.estado.${code}`);
  const { Icon, wrap, icon } = meta;
  return (
    <span
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-full",
        wrap,
      ].join(" ")}
      title={label}
      aria-label={label}
    >
      <Icon className={["h-5 w-5 shrink-0", icon].join(" ")} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

/** Ocho columnas métricas (facturación → primas). */
function MetricCells({
  values,
  variant,
}: {
  values: string[];
  variant: "driver" | "sector";
}) {
  const sector = variant === "sector";
  return (
    <>
      {values.map((value, j) => (
        <td
          key={j}
          className={[
            "text-right tabular-nums",
            sector
              ? "border-b border-zinc-100 bg-zinc-50/90 py-1.5 text-xs text-zinc-500"
              : "py-2.5 text-zinc-800",
            !sector && j === 1 ? "font-medium text-red-600" : "",
          ].join(" ")}
        >
          {value}
        </td>
      ))}
    </>
  );
}

function periodBtnClass(active: boolean): string {
  return [
    "rounded-lg border px-2 py-1 transition",
    active
      ? "border-zinc-900 bg-white text-zinc-900 shadow-sm"
      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800",
  ].join(" ");
}

function scaleMetrics(m: AnalyticsMetrics, scale: number): AnalyticsMetrics {
  return {
    facturacion: Math.round(m.facturacion * scale),
    comisiones: Math.round(m.comisiones * scale),
    neto: Math.round(m.neto * scale),
    eurHora: m.eurHora,
  };
}

function sectorForFilter(
  sector: AnalyticsSectorByPlatform,
  filter: PlatformFilter,
): AnalyticsMetrics {
  if (filter === "uber") return sector.uber;
  if (filter === "freenow") return sector.freenow;
  if (filter === "bolt") return sector.bolt;
  if (filter === "cabify") return sector.cabify;
  return sector.total;
}

function driverSectorForFilter(
  sector: AnalyticsSectorByPlatform | undefined,
  filter: PlatformFilter,
  demoSourceRows: AnalyticsRow[],
): SectorDriverAverages | null {
  if (sector) {
    const av = sector.driverAverages;
    if (filter === "uber") return av.uber;
    if (filter === "freenow") return av.freenow;
    if (filter === "bolt") return av.bolt;
    if (filter === "cabify") return av.cabify;
    return av.total;
  }
  const demoPool = demoSourceRows.filter((r) => matchesPlatform(r, filter));
  if (demoPool.length === 0) return null;
  return averageAnalyticsRows(demoPool);
}

export function AnaliticaMockView({
  initialRows,
  sectorBenchmarks,
  sectorBenchmarkOptIn = false,
  companyScopeLabel = "",
  usingLiveData = false,
  dateFrom: dateFromProp,
  dateTo: dateToProp,
  canExportExcel = true,
  initialPlatformFilter = "total",
}: {
  initialRows?: AnalyticsRow[];
  sectorBenchmarks?: AnalyticsSectorByPlatform;
  sectorBenchmarkOptIn?: boolean;
  companyScopeLabel?: string;
  initialPlatformFilter?: PlatformFilter;
  usingLiveData?: boolean;
  dateFrom?: string;
  dateTo?: string;
  canExportExcel?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const defaultPeriod = PERIOD_PRESETS.find((p) => p.id === "mesAnterior")!;
  const defaultRange = defaultPeriod.range();
  const sourceRows = useMemo(() => initialRows ?? [], [initialRows]);

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(
    initialPlatformFilter,
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("custom");
  const [periodScale, setPeriodScale] = useState(defaultPeriod.scale);
  const [dateFrom, setDateFrom] = useState(dateFromProp ?? defaultRange.from);
  const [dateTo, setDateTo] = useState(dateToProp ?? defaultRange.to);

  useEffect(() => {
    if (dateFromProp) setDateFrom(dateFromProp);
    if (dateToProp) setDateTo(dateToProp);
  }, [dateFromProp, dateToProp]);

  useEffect(() => {
    setPlatformFilter(initialPlatformFilter);
  }, [initialPlatformFilter]);

  const navigateRange = useCallback(
    (fromEs: string, toEs: string, platform: PlatformFilter = platformFilter) => {
      const built = billingRangeQueryFromEs(fromEs, toEs);
      if (!built.ok) {
        toast.error(built.message);
        return;
      }
      const params = new URLSearchParams(built.query);
      if (platform !== "total") params.set("platform", platform);
      router.push(`/analitica?${params.toString()}`);
      router.refresh();
    },
    [platformFilter, router, toast],
  );

  const applyPlatformFilter = useCallback(
    (id: PlatformFilter) => {
      setPlatformFilter(id);
      if (usingLiveData) {
        navigateRange(dateFrom, dateTo, id);
      }
    },
    [dateFrom, dateTo, navigateRange, usingLiveData],
  );

  const applyPeriodPreset = useCallback(
    (id: PeriodPreset) => {
      const preset = PERIOD_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const range = preset.range();
      setPeriodPreset(id);
      setPeriodScale(preset.scale);
      setDateFrom(range.from);
      setDateTo(range.to);
      if (usingLiveData) {
        navigateRange(range.from, range.to);
      }
    },
    [navigateRange, usingLiveData],
  );

  const handleApplyDates = useCallback(() => {
    if (usingLiveData) {
      navigateRange(dateFrom, dateTo);
      return;
    }
    const scale = periodScaleForCustomRange(dateFrom, dateTo);
    setPeriodPreset("custom");
    setPeriodScale(scale);
  }, [dateFrom, dateTo, navigateRange, usingLiveData]);

  const filteredRows = useMemo(() => {
    return sourceRows.filter((row) => matchesPlatform(row, platformFilter));
  }, [platformFilter, sourceRows]);

  const driverSector = useMemo(
    () => driverSectorForFilter(sectorBenchmarks, platformFilter, sourceRows),
    [sectorBenchmarks, platformFilter, sourceRows],
  );

  const rowsWithEstado = useMemo(() => {
    const sectorForEstado = driverSector
      ? {
          facturacion: driverSector.facturacion,
          viajes: driverSector.viajes,
          eurHora: driverSector.eurHora,
        }
      : { facturacion: 0, viajes: 0, eurHora: 0 };
    return filteredRows.map((row) => ({
      ...row,
      estado: analyticsEstadoFromSector(
        {
          facturacion: row.facturacion,
          viajes: row.viajes,
          eurHora: row.eurHora,
        },
        sectorForEstado,
      ),
    }));
  }, [filteredRows, driverSector]);

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    AnaliticaSortKey,
    AnalyticsRow
  >(rowsWithEstado, "facturacion", "desc", {
    conductor: (a, b, d) => compareStrings(a.conductor, b.conductor, d),
    facturacion: (a, b, d) => compareNumbers(a.facturacion, b.facturacion, d),
    comisiones: (a, b, d) => compareNumbers(a.comisiones, b.comisiones, d),
    viajes: (a, b, d) => compareNumbers(a.viajes, b.viajes, d),
    turnos: (a, b, d) => compareNumbers(a.turnos, b.turnos, d),
    mediaTurno: (a, b, d) => compareNumbers(a.mediaTurno, b.mediaTurno, d),
    eurHora: (a, b, d) => compareNumbers(a.eurHora, b.eurHora, d),
    propinas: (a, b, d) => compareNumbers(a.propinas, b.propinas, d),
    primas: (a, b, d) => compareNumbers(a.primas, b.primas, d),
    estado: (a, b, d) =>
      compareNumbers(ESTADO_ORDER[a.estado], ESTADO_ORDER[b.estado], d),
  });

  const tableTotals = useMemo(() => sumRows(filteredRows), [filteredRows]);

  const periodScaleValue = useMemo(() => {
    if (periodPreset !== "custom") {
      return PERIOD_PRESETS.find((p) => p.id === periodPreset)?.scale ?? 1;
    }
    return periodScaleForCustomRange(dateFrom, dateTo);
  }, [dateFrom, dateTo, periodPreset]);

  const kpiCards = useMemo(() => {
    const totals = sumRows(filteredRows);
    const current: AnalyticsMetrics = {
      facturacion: totals.facturacion,
      comisiones: totals.comisiones,
      eurHora: totals.eurHora,
      neto: totals.neto,
    };

    let sector: AnalyticsMetrics;
    if (usingLiveData && sectorBenchmarks) {
      sector = sectorForFilter(sectorBenchmarks, platformFilter);
    } else {
      const mult = platformKpiMultiplier(platformFilter) * periodScaleValue;
      sector = scaleMetrics(SECTOR_KPI_BASE, mult);
      if (!usingLiveData && filteredRows.length === 0) {
        return buildAnalyticsKpis(
          { facturacion: 0, comisiones: 0, eurHora: 0, neto: 0 },
          sector,
        ).map((k, i) => ({
          ...k,
          label: t(`analitica.kpi.${ANALYTICS_KPI_IDS[i]}`),
          vsSector: k.vsSector.includes("vs sector")
            ? t("analitica.noDataInPeriod")
            : translateVsSector(k.vsSector, t),
        }));
      }
      if (!usingLiveData) {
        const demoCurrent = scaleMetrics(KPI_BASE, mult);
        return buildAnalyticsKpis(demoCurrent, sector).map((k, i) => ({
          ...k,
          label: t(`analitica.kpi.${ANALYTICS_KPI_IDS[i]}`),
          vsSector: translateVsSector(k.vsSector, t),
        }));
      }
    }

    if (filteredRows.length === 0) {
      return buildAnalyticsKpis(
        { facturacion: 0, comisiones: 0, eurHora: 0, neto: 0 },
        sector,
      ).map((k, i) => ({
        ...k,
        label: t(`analitica.kpi.${ANALYTICS_KPI_IDS[i]}`),
        vsSector: t("analitica.noDataInPeriod"),
      }));
    }

    const noSector =
      sector.facturacion === 0 &&
      sector.neto === 0 &&
      sector.comisiones === 0 &&
      sector.eurHora === 0;
    const cards = buildAnalyticsKpis(current, sector);
    if (noSector) {
      return cards.map((k, i) => ({
        ...k,
        label: t(`analitica.kpi.${ANALYTICS_KPI_IDS[i]}`),
        vsSector: t("analitica.noOtherOperators"),
      }));
    }
    return cards.map((k, i) => ({
      ...k,
      label: t(`analitica.kpi.${ANALYTICS_KPI_IDS[i]}`),
      vsSector: translateVsSector(k.vsSector, t),
    }));
  }, [
    filteredRows,
    periodScaleValue,
    platformFilter,
    sectorBenchmarks,
    t,
    usingLiveData,
  ]);

  const handleExportExcel = useCallback(() => {
    if (!canExportExcel) return;
    void exportAnaliticaToExcel(rowsWithEstado, {
      platform: platformLabel(platformFilter),
      from: dateFrom,
      to: dateTo,
      sectorAverages: sectorBenchmarkOptIn ? driverSector : null,
    });
  }, [
    canExportExcel,
    dateFrom,
    dateTo,
    driverSector,
    platformFilter,
    rowsWithEstado,
    sectorBenchmarkOptIn,
  ]);

  const periodLabel =
    periodPreset === "custom"
      ? `${dateFrom} – ${dateTo}`
      : t(`analitica.periods.${periodPreset}`);

  return (
    <div className="space-y-4">
      {!sectorBenchmarkOptIn ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("analitica.sectorOptOutBefore")}
          <Link href="/configuracion" className="font-semibold text-orange-700 underline">
            {t("analitica.sectorOptOutLink")}
          </Link>
          {t("analitica.sectorOptOutAfter")}
        </p>
      ) : null}
      {!usingLiveData ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t("analitica.noClosedTrips")}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {t("analitica.liveHint")}
          {companyScopeLabel ? (
            <>
              {" "}
              · <span className="font-medium text-zinc-700">{companyScopeLabel}</span>
            </>
          ) : null}{" "}
          · {dateFromProp ?? dateFrom} – {dateToProp ?? dateTo}.
        </p>
      )}

      <VuiPanel className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex gap-1 rounded-xl bg-zinc-100 p-1 ring-1 ring-zinc-200"
            role="group"
            aria-label={t("analitica.platformAria")}
          >
            {PLAT.map((p) => {
              const active = platformFilter === p.id;
              const label = p.labelKey ? t(p.labelKey) : p.label!;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPlatformFilter(p.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
                    active
                      ? "bg-vision-brand text-white shadow-md"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {p.logo ? <PlatformLogo id={p.logo} size="sm" /> : null}
                  {label}
                </button>
              );
            })}
          </div>
          <div
            className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
            role="group"
            aria-label={t("analitica.periodAria")}
          >
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPeriodPreset(preset.id)}
                className={periodBtnClass(periodPreset === preset.id)}
              >
                {t(`analitica.periods.${preset.id}`)}
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
              aria-label={t("analitica.dateFrom")}
            />
          </label>
          <span className="pb-1.5 text-zinc-600">—</span>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {t("turnos.dateTo")}
            <ErpDateInput value={dateTo} onChange={setDateTo} aria-label={t("analitica.dateTo")} />
          </label>
          <button
            type="button"
            onClick={handleApplyDates}
            disabled={!parseDateEs(dateFrom) || !parseDateEs(dateTo)}
            className="rounded-xl bg-vision-brand px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("turnos.apply")}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredRows.length === 0}
            className="vui-btn-outline ml-auto py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Excel
          </button>
        </div>

        <p className="text-xs text-zinc-500">
          {platformLabel(platformFilter)} · {periodLabel}
          {filteredRows.length < sourceRows.length ? (
            <>
              {" "}
              · <span className="font-medium text-zinc-700">{t("analitica.driversCount", { count: filteredRows.length })}</span>
            </>
          ) : null}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((k) => (
            <div key={k.label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                {k.label}
              </p>
              <p
                className={`mt-2 text-xl font-bold tabular-nums ${k.danger ? "text-red-600" : "text-zinc-900"}`}
              >
                {k.value}
              </p>
              <p
                className={`mt-1 text-xs ${
                  k.vsSectorPositive === false
                    ? "text-red-600"
                    : k.danger && !k.vsSectorPositive
                      ? "text-red-600"
                      : "text-emerald-700"
                }`}
              >
                {k.vsSector}
              </p>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-zinc-900">{t("analitica.performanceTitle")}</h3>
        <VuiTableShell className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="vui-table-head">
              <tr>
                <VuiSortableTh
                  label={t("analitica.columns.conductor")}
                  activeDir={dirFor("conductor")}
                  onSort={() => toggleSort("conductor")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.facturacion")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("facturacion")}
                  onSort={() => toggleSort("facturacion")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.comisiones")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("comisiones")}
                  onSort={() => toggleSort("comisiones")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.viajes")}
                  align="right"
                  className="text-right tabular-nums"
                  activeDir={dirFor("viajes")}
                  onSort={() => toggleSort("viajes")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.turnos")}
                  align="right"
                  className="text-right tabular-nums"
                  activeDir={dirFor("turnos")}
                  onSort={() => toggleSort("turnos")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.mediaTurno")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("mediaTurno")}
                  onSort={() => toggleSort("mediaTurno")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.eurHora")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("eurHora")}
                  onSort={() => toggleSort("eurHora")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.propinas")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("propinas")}
                  onSort={() => toggleSort("propinas")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.primas")}
                  align="right"
                  className="text-right"
                  activeDir={dirFor("primas")}
                  onSort={() => toggleSort("primas")}
                />
                <VuiSortableTh
                  label={t("analitica.columns.estado")}
                  activeDir={dirFor("estado")}
                  onSort={() => toggleSort("estado")}
                />
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr className="vui-table-row">
                  <td colSpan={10} className="py-8 text-center text-sm text-zinc-500">
                    {sourceRows.length === 0
                      ? t("analitica.empty.noClosedTrips")
                      : t("analitica.empty.noFilterMatch")}
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                  const cells = rowToDisplayCells(row);
                  const sectorCells = driverSector
                    ? sectorDriverAveragesToDisplayCells(driverSector)
                    : null;
                  return (
                    <Fragment key={row.conductor}>
                      <tr className="vui-table-row">
                        <td className="align-top py-2.5 font-medium text-zinc-900">
                          {row.conductor}
                        </td>
                        <MetricCells values={cells} variant="driver" />
                        <td
                          rowSpan={sectorCells ? 2 : 1}
                          className="text-center align-middle"
                        >
                          <EstadoCell code={row.estado} />
                        </td>
                      </tr>
                      {sectorCells ? (
                        <tr
                          className="vui-table-row"
                          aria-label={t("analitica.sectorAvgAria", { name: row.conductor })}
                        >
                          <td className="border-b border-zinc-100 bg-zinc-50/90 py-1.5 text-xs font-medium text-zinc-500">
                            {t("analitica.sectorAvg")}
                          </td>
                          <MetricCells values={sectorCells} variant="sector" />
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
              {displayRows.length > 0 ? (
                (() => {
                  const sectorTotalCells = driverSector
                    ? sectorDriverAveragesToDisplayCells(driverSector)
                    : null;
                  const totalCells = [
                    formatEuro(tableTotals.facturacion),
                    formatEuro(tableTotals.comisiones),
                    String(tableTotals.viajes),
                    String(tableTotals.turnos),
                    formatEuro(tableTotals.mediaTurno),
                    formatEurHour(tableTotals.eurHora),
                    formatEuro(tableTotals.propinas),
                    formatEuro(tableTotals.primas),
                  ];
                  return (
                    <Fragment key="total-empresa">
                      <tr className="vui-table-row border-t-2 border-zinc-200 bg-zinc-50/50 font-semibold text-zinc-900">
                        <td className="align-top py-2.5">{t("analitica.companyTotal")}</td>
                        <MetricCells values={totalCells} variant="driver" />
                        <td rowSpan={sectorTotalCells ? 2 : 1} />
                      </tr>
                      {sectorTotalCells ? (
                        <tr
                          className="vui-table-row font-normal"
                          aria-label={t("analitica.sectorAvgAria", { name: t("analitica.companyTotal") })}
                        >
                          <td className="border-b border-zinc-100 bg-zinc-50/90 py-1.5 text-xs font-medium text-zinc-500">
                            {t("analitica.sectorAvg")}
                          </td>
                          <MetricCells values={sectorTotalCells} variant="sector" />
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })()
              ) : null}
            </tbody>
          </table>
        </VuiTableShell>
      </VuiPanel>
    </div>
  );
}
