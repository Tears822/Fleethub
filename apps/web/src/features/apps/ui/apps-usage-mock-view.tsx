"use client";

import { useCallback, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { appsPlatformDisplayName, appsPlatformLogoId } from "@/features/apps/lib/apps-platform";
import { exportAppsUsageToExcel } from "@/features/apps/lib/apps-usage-export";
import { appsProductivityLegendText } from "@/features/apps/lib/apps-usage-productivity-legend";
import type {
  AppsMetricSource,
  AppsUsageRow,
  AppsUsageTodaySnapshot,
} from "@/features/apps/lib/apps-usage-types";
import { AppsPlatformTab } from "@/features/apps/ui/apps-platform-tab";
import { AppsRefreshButton } from "@/features/apps/ui/apps-refresh-button";
import type { ProductivityThresholds } from "@fleethub/auth/apps-productivity";
import {
  formatAppsEurHoraFromLabel,
  resolveEurPerHourFromLabel,
} from "@fleethub/auth/eur-per-hour";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type AppsTab = "all" | string;

type AppsSortKey =
  | "platform"
  | "conductor"
  | "viajes"
  | "facturacion"
  | "horas"
  | "eurH"
  | "aceptacion"
  | "productividad";

type Row = AppsUsageRow;

const connectionDotClass: Record<Row["connectionDot"], string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  unknown: "bg-zinc-300",
};

function productivityClass(p: Row["productividad"]) {
  if (p === "Óptimo") return "font-semibold text-emerald-700";
  if (p === "Medio") return "font-semibold text-amber-600";
  return "font-semibold text-red-600";
}

type ProductivityFilter = "all" | "optimo" | "medio" | "bajo";

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function rowEurPerHour(row: Row): number {
  return resolveEurPerHourFromLabel(row.facturacionEur, row.horas);
}

function rowEurHLabel(row: Row): string {
  return formatAppsEurHoraFromLabel(row.facturacionEur, row.horas);
}

function matchesProductivityFilter(row: Row, filter: ProductivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "optimo") return row.productividad === "Óptimo";
  if (filter === "medio") return row.productividad === "Medio";
  return row.productividad === "Bajo umbral";
}

function tabPlatformLabel(tab: AppsTab, t: (key: string) => string): string {
  if (tab === "all") return t("turnos.allPlatforms");
  return appsPlatformDisplayName(tab);
}

function metricSourceTitle(
  source: AppsMetricSource,
  kind: "horas" | "aceptacion",
  t: (key: string) => string,
): string {
  if (source === "platform") {
    return kind === "horas" ? t("apps.metricSource.hoursPlatform") : t("apps.metricSource.acceptancePlatform");
  }
  if (source === "trips") {
    return t("apps.metricSource.hoursTrips");
  }
  return kind === "horas" ? t("apps.metricSource.noHours") : t("apps.metricSource.acceptanceEstimated");
}

function mergeAllRows(usage: AppsUsageTodaySnapshot): Row[] {
  return usage.platformSlugs.flatMap((slug) => usage.byPlatform[slug] ?? []);
}

export function AppsUsageMockView({
  usage,
  productivityThresholds,
  isLive = false,
  canExportExcel = true,
  canRefreshMetrics = false,
}: {
  usage: AppsUsageTodaySnapshot;
  productivityThresholds: ProductivityThresholds;
  isLive?: boolean;
  canExportExcel?: boolean;
  canRefreshMetrics?: boolean;
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const [tab, setTab] = useState<AppsTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<ProductivityFilter>("all");

  const { platformSlugs, byPlatform } = usage;

  const allRows = useMemo(() => {
    if (tab === "all") return mergeAllRows(usage);
    return byPlatform[tab] ?? [];
  }, [tab, usage, byPlatform]);

  const filteredRows = useMemo(() => {
    const q = normalizeForSearch(searchQuery.trim());
    return allRows.filter((row) => {
      if (!matchesProductivityFilter(row, levelFilter)) return false;
      if (!q) return true;
      return (
        normalizeForSearch(row.conductor).includes(q) ||
        normalizeForSearch(row.empresa).includes(q)
      );
    });
  }, [allRows, levelFilter, searchQuery]);

  const showPlatformColumn = tab === "all";

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    AppsSortKey,
    Row
  >(filteredRows, "facturacion", "desc", {
    platform: (a, b, d) => compareStrings(a.platform, b.platform, d),
    conductor: (a, b, d) => compareStrings(a.conductor, b.conductor, d),
    viajes: (a, b, d) => compareNumbers(a.viajes, b.viajes, d),
    facturacion: (a, b, d) => compareNumbers(a.facturacionEur, b.facturacionEur, d),
    horas: (a, b, d) => compareNumbers(a.horasDecimal, b.horasDecimal, d),
    eurH: (a, b, d) => compareNumbers(rowEurPerHour(a), rowEurPerHour(b), d),
    aceptacion: (a, b, d) => compareNumbers(a.aceptacionPct, b.aceptacionPct, d),
    productividad: (a, b, d) => compareStrings(a.productividad, b.productividad, d),
  });

  const legend = useMemo(
    () => appsProductivityLegendText(productivityThresholds, usage.fleetDayAverages, t),
    [productivityThresholds, t, usage.fleetDayAverages],
  );

  const handleTabChange = useCallback((next: AppsTab) => {
    setTab(next);
    setSearchQuery("");
    setLevelFilter("all");
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setLevelFilter("all");
  }, []);

  const handleExportExcel = useCallback(() => {
    void (async () => {
      try {
        await exportAppsUsageToExcel(tab, filteredRows);
        const label = tabPlatformLabel(tab, t);
        toast.success(t("apps.exportSuccess", { count: filteredRows.length, label }));
      } catch {
        toast.error(t("turnos.pdfError"));
      }
    })();
  }, [filteredRows, t, tab, toast]);

  const connectionDotLabel: Record<Row["connectionDot"], string> = {
    online: t("apps.connectionOnline"),
    offline: t("apps.connectionOffline"),
    unknown: t("apps.connectionUnknown"),
  };

  const hasActiveFilters = searchQuery.trim() !== "" || levelFilter !== "all";
  const platformLabel = tabPlatformLabel(tab, t);
  const colCount = showPlatformColumn ? 8 : 7;

  return (
    <div className="space-y-4">
      {!isLive ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          No hay viajes registrados hoy. Tras el seed en demo-a deberían aparecer conductores con
          actividad del día actual.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          Actividad de hoy por plataforma (viajes cerrados y pendientes).
        </p>
      )}

      <VuiPanel className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="erp-tabs-underline flex flex-wrap">
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className={`erp-tab-underline ${tab === "all" ? "erp-tab-underline-active" : ""}`}
            >
              <span className="inline-flex items-center gap-2">
                {platformSlugs.slice(0, 4).map((slug) => (
                  <PlatformLogo key={slug} id={appsPlatformLogoId(slug)} size="sm" />
                ))}
                <span>{t("turnos.allPlatforms")}</span>
              </span>
            </button>
            {platformSlugs.map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => handleTabChange(slug)}
                className={`erp-tab-underline ${tab === slug ? "erp-tab-underline-active" : ""}`}
              >
                <AppsPlatformTab slug={slug} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AppsRefreshButton enabled={canRefreshMetrics} />
            {canExportExcel ? (
              <button
                type="button"
                onClick={handleExportExcel}
                className="erp-btn-outline inline-flex items-center gap-2 text-xs font-semibold normal-case"
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("turnos.exportExcel")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("apps.searchPlaceholder")}
            className="erp-inline-input min-w-[12rem] flex-1 md:max-w-xs"
            aria-label={t("apps.searchPlaceholder")}
          />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as ProductivityFilter)}
            className="erp-inline-input"
            aria-label={t("apps.filterProductivity")}
          >
            <option value="all">{t("apps.allLevels")}</option>
            <option value="optimo">{t("apps.optimal")}</option>
            <option value="medio">{t("apps.medium")}</option>
            <option value="bajo">{t("apps.low")}</option>
          </select>
          <button
            type="button"
            onClick={handleClearFilters}
            className="erp-filter-btn disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasActiveFilters}
          >
            {t("turnos.clearFilters")}
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs leading-relaxed text-zinc-700">
          <p className="mb-2 font-medium text-zinc-800">{legend.modeLabel}</p>
          {legend.fleetLine ? (
            <p className="mb-2 text-zinc-600">{legend.fleetLine}</p>
          ) : null}
          <span className="font-semibold text-zinc-900">{t("apps.levelsLabel")}</span>{" "}
          <span className="font-semibold text-emerald-700">{t("apps.optimal")}</span>
          <span className="text-zinc-600"> {legend.optimo}</span>
          <span className="mx-2 text-zinc-300" aria-hidden>
            ·
          </span>
          <span className="font-semibold text-amber-600">{t("apps.medium")}</span>
          <span className="text-zinc-600"> {legend.medio}</span>
          <span className="mx-2 text-zinc-300" aria-hidden>
            ·
          </span>
          <span className="font-semibold text-red-600">{t("apps.low")}</span>
          <span className="text-zinc-600"> {legend.bajo}</span>
        </div>
        <p className="text-[11px] text-zinc-500">
          {t("apps.footerGross")}{" "}
          {t("apps.footerMetrics")}{" "}
          {t("apps.footerDot")}
        </p>

        <p className="text-xs font-semibold text-zinc-800">
          {filteredRows.length}
          {hasActiveFilters && filteredRows.length !== allRows.length
            ? `${t("common.of")}${allRows.length}`
            : ""}{" "}
          {tab === "all" ? t("apps.countRows") : t("apps.countDrivers")} · {t("apps.today")} · {platformLabel}
        </p>

        <VuiTableShell className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <colgroup>
              {showPlatformColumn ? <col className="w-[10%]" /> : null}
              <col className={showPlatformColumn ? "w-[26%]" : "w-[32%]"} />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="vui-table-head">
              <tr>
                {showPlatformColumn ? (
                  <VuiSortableTh
                    label={t("apps.columns.platform")}
                    activeDir={dirFor("platform")}
                    onSort={() => toggleSort("platform")}
                  />
                ) : null}
                <VuiSortableTh
                  label={t("apps.columns.conductor")}
                  activeDir={dirFor("conductor")}
                  onSort={() => toggleSort("conductor")}
                />
                <VuiSortableTh
                  label={t("apps.columns.trips")}
                  className="tabular-nums"
                  activeDir={dirFor("viajes")}
                  onSort={() => toggleSort("viajes")}
                />
                <VuiSortableTh
                  label={t("apps.columns.billing")}
                  className="tabular-nums"
                  activeDir={dirFor("facturacion")}
                  onSort={() => toggleSort("facturacion")}
                />
                <VuiSortableTh
                  label={t("apps.columns.hours")}
                  className="tabular-nums"
                  activeDir={dirFor("horas")}
                  onSort={() => toggleSort("horas")}
                />
                <VuiSortableTh
                  label={t("apps.columns.eurPerHour")}
                  className="tabular-nums"
                  activeDir={dirFor("eurH")}
                  onSort={() => toggleSort("eurH")}
                />
                <VuiSortableTh
                  label={t("apps.columns.acceptance")}
                  className="tabular-nums"
                  activeDir={dirFor("aceptacion")}
                  onSort={() => toggleSort("aceptacion")}
                />
                <VuiSortableTh
                  label={t("apps.columns.productivity")}
                  activeDir={dirFor("productividad")}
                  onSort={() => toggleSort("productividad")}
                />
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr className="vui-table-row">
                  <td colSpan={colCount} className="py-8 text-center text-sm text-zinc-500">
                    {allRows.length === 0
                      ? `No hay viajes hoy en ${platformLabel}.`
                      : t("conductores.noFilterMatch")}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((r) => (
                <tr key={`${r.platform}-${r.conductor}`} className="vui-table-row">
                  {showPlatformColumn ? (
                    <td>
                      <PlatformLogo id={appsPlatformLogoId(r.platform)} size="sm" />
                    </td>
                  ) : null}
                  <td>
                    <span className="flex items-center gap-2 font-medium text-zinc-900">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${connectionDotClass[r.connectionDot]}`}
                        title={connectionDotLabel[r.connectionDot]}
                        aria-label={connectionDotLabel[r.connectionDot]}
                      />
                      <span>
                        {r.conductor}
                        {r.empresa ? (
                          <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                            {r.empresa}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="tabular-nums text-zinc-800">{r.viajes}</td>
                  <td className="tabular-nums font-medium text-emerald-700">{r.facturacion}</td>
                  <td
                    className="tabular-nums text-zinc-800"
                    title={metricSourceTitle(r.horasSource, "horas", t)}
                  >
                    {r.horas}
                  </td>
                  <td className="tabular-nums text-zinc-800">{rowEurHLabel(r)}</td>
                  <td
                    className="tabular-nums text-zinc-800"
                    title={metricSourceTitle(r.aceptacionSource, "aceptacion", t)}
                  >
                    {r.aceptacion}
                  </td>
                  <td>
                    <span className={productivityClass(r.productividad)}>{r.productividad}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </VuiTableShell>
      </VuiPanel>
    </div>
  );
}
