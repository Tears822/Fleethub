"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BILLING_DEMO_RANGE_QUERY,
  billingMonthQuickOptions,
  billingRangeQueryFromEs,
} from "@/features/billing/lib/billing-date-range";
import {
  periodKpisFromTableRows,
  rowsForPeriodKpiTotals,
  type BillingTabId,
} from "@/features/billing/lib/billing-period-kpis";
import {
  billingPlatformFilterLabel,
  collectBillingPlatformFilters,
  rowMatchesBillingPlatform,
  type BillingPlatformFilter,
} from "@/features/billing/lib/billing-platform-filter";
import type { BillingPeriodKpi, BillingReport, BillingTableRow } from "@/features/billing/lib/billing-types";
import {
  appsPlatformDisplayName,
  appsPlatformLogoId,
  ridePlatformToSlug,
} from "@/features/apps/lib/apps-platform";
import {
  formatEuroCell,
  formatServicesCell,
  parseEuroCell,
  parseServicesCell,
} from "@/features/billing/lib/facturacion-mock-format";
import { BillingMetricsTable } from "@/features/billing/ui/billing-metrics-table";
import { downloadExcelTable } from "@/shared/lib/download-spreadsheet";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import { matchesSearchQuery } from "@/shared/lib/normalize-search";
import { ErpDateInput } from "@/shared/ui/erp-date-input";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { useToast } from "@/shared/ui/toast-provider";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import type { Translator } from "@fleethub/i18n";

const TAB_IDS = ["byDriver", "byDay", "global"] as const satisfies readonly BillingTabId[];

function displayPeriodKpi(kpi: BillingPeriodKpi, t: Translator) {
  return {
    title: t(`billing.kpi.${kpi.id}`),
    value: kpi.value,
    hint: kpi.hintKey ? t(kpi.hintKey, kpi.hintParams) : kpi.hint,
    danger: kpi.danger,
    highlight: kpi.highlight,
  };
}

function filterRows(
  rows: BillingTableRow[],
  platformFilter: BillingPlatformFilter,
  searchQuery: string,
): BillingTableRow[] {
  return rows.filter((row) => {
    if (!rowMatchesBillingPlatform(row, platformFilter)) return false;
    return matchesSearchQuery(row.label, searchQuery);
  });
}

function sumFromRows(rows: BillingTableRow[]) {
  const servicios = rows.reduce((acc, row) => acc + parseServicesCell(row.cells[0]), 0);
  const factTotal = rows.reduce((acc, row) => acc + parseEuroCell(row.cells[1]), 0);
  const comision = rows.reduce((acc, row) => acc + parseEuroCell(row.cells[2]), 0);
  const neto = rows.reduce((acc, row) => acc + parseEuroCell(row.cells[3]), 0);
  return { servicios, factTotal, comision, neto };
}

function MiniKpiCard({
  title,
  value,
  hint,
  danger,
  highlight,
}: {
  title: string;
  value: string;
  hint?: string;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`min-w-[7.25rem] shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm ${highlight ? "border-t-[3px] border-t-orange-500" : ""}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-zinc-500">{title}</p>
      <p
        className={`mt-1 text-base font-bold leading-tight tabular-nums tracking-tight ${danger ? "text-red-600" : "text-zinc-900"}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function SummaryKpiCard({
  title,
  value,
  hint,
  danger,
  highlight,
}: {
  title: string;
  value: string;
  hint?: string;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5 ${
        highlight ? "border-t-4 border-t-orange-500" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{title}</p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums tracking-tight md:text-3xl ${danger ? "text-red-600" : "text-zinc-900"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function platformPillClass(active: boolean): string {
  return [
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition",
    active
      ? "bg-orange-500 text-white shadow-sm"
      : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
  ].join(" ");
}

function tabConfig(
  tab: BillingTabId,
  t: Translator,
): {
  labelColumn: string;
  searchPlaceholder: string;
  sectionTitle: string;
  countLabel: string;
  exportSheet: string;
  exportFilename: string;
} {
  if (tab === "byDay") {
    return {
      labelColumn: t("billing.columns.day"),
      searchPlaceholder: t("billing.search.day"),
      sectionTitle: t("billing.sections.byDay"),
      countLabel: t("billing.countLabels.days"),
      exportSheet: t("billing.exportSheets.byDay"),
      exportFilename: t("billing.exportFiles.byDay"),
    };
  }
  if (tab === "global") {
    return {
      labelColumn: t("billing.columns.concept"),
      searchPlaceholder: t("billing.search.concept"),
      sectionTitle: t("billing.sections.global"),
      countLabel: t("billing.countLabels.lines"),
      exportSheet: t("billing.exportSheets.global"),
      exportFilename: t("billing.exportFiles.global"),
    };
  }
  return {
    labelColumn: t("billing.columns.driver"),
    searchPlaceholder: t("billing.search.driver"),
    sectionTitle: t("billing.sections.byDriver"),
    countLabel: t("billing.countLabels.drivers"),
    exportSheet: t("billing.exportSheets.byDriver"),
    exportFilename: t("billing.exportFiles.byDriver"),
  };
}

export function FacturacionMockView({
  initialReport,
  usingLiveData = false,
  dateFrom: dateFromProp = "01/04/2026",
  dateTo: dateToProp = "31/05/2026",
  canExportExcel = true,
  companyScopeLabel,
}: {
  initialReport?: BillingReport;
  usingLiveData?: boolean;
  dateFrom?: string;
  dateTo?: string;
  canExportExcel?: boolean;
  companyScopeLabel?: string;
}) {
  const { t, locale } = useTranslations();
  const router = useRouter();
  const toast = useToast();
  const scopeLabel = companyScopeLabel ?? t("billing.allCompanies");
  const driverRows = useMemo(() => initialReport?.byDriver ?? [], [initialReport]);
  const dayRows = useMemo(() => initialReport?.byDay ?? [], [initialReport]);
  const globalRows = useMemo(() => initialReport?.globalRows ?? [], [initialReport]);
  const periodKpis = useMemo(() => initialReport?.periodKpis ?? [], [initialReport]);
  const pendingInPeriod = initialReport?.pendingInPeriod;

  const [tab, setTab] = useState<BillingTabId>("byDriver");
  const [platformFilter, setPlatformFilter] = useState<BillingPlatformFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const platformFilterOptions = useMemo(
    () => collectBillingPlatformFilters(driverRows, globalRows),
    [driverRows, globalRows],
  );

  useEffect(() => {
    if (platformFilter === "all") return;
    if (!platformFilterOptions.includes(platformFilter)) {
      setPlatformFilter("all");
    }
  }, [platformFilter, platformFilterOptions]);
  const [dateFrom, setDateFrom] = useState(dateFromProp);
  const [dateTo, setDateTo] = useState(dateToProp);

  useEffect(() => {
    setDateFrom(dateFromProp);
    setDateTo(dateToProp);
  }, [dateFromProp, dateToProp]);

  const applyDateRange = () => {
    const built = billingRangeQueryFromEs(dateFrom, dateTo);
    if (!built.ok) {
      toast.error(built.message);
      return;
    }
    router.push(`/facturacion?${built.query}`);
    router.refresh();
  };

  const activeRows = useMemo(() => {
    if (tab === "byDay") return dayRows;
    if (tab === "global") return globalRows;
    return driverRows;
  }, [tab, driverRows, dayRows, globalRows]);

  const filteredRows = useMemo(
    () => filterRows(activeRows, platformFilter, searchQuery),
    [activeRows, platformFilter, searchQuery],
  );

  const hasActiveFilters = searchQuery.trim() !== "" || platformFilter !== "all";
  const monthOptions = useMemo(() => billingMonthQuickOptions(undefined, locale), [locale]);

  const displayPeriodKpis = useMemo(() => {
    const raw =
      !hasActiveFilters
        ? periodKpis
        : periodKpisFromTableRows(
            rowsForPeriodKpiTotals(filteredRows, tab),
            tab === "byDriver"
              ? filteredRows.length
              : filterRows(driverRows, platformFilter, "").length,
          );
    return raw.map((k) => displayPeriodKpi(k, t));
  }, [driverRows, filteredRows, hasActiveFilters, periodKpis, platformFilter, tab, t]);

  const cfg = tabConfig(tab, t);

  const summaryKpi = useMemo(() => {
    const { servicios, factTotal, comision, neto } = sumFromRows(filteredRows);
    return [
      {
        title: t("billing.kpi.factTotal"),
        value: formatEuroCell(factTotal),
        hint: hasActiveFilters
          ? t("billing.kpiHint.filteredRows", { count: filteredRows.length })
          : t("billing.kpiHint.selectedPeriod"),
      },
      {
        title: t("billing.kpi.comision"),
        value: formatEuroCell(comision),
        hint: t("billing.kpiHint.platformFees"),
        danger: true,
      },
      {
        title: t("billing.kpi.neto"),
        value: formatEuroCell(neto),
        hint: t("billing.kpiHint.afterFees"),
        highlight: true,
      },
      {
        title: t("billing.kpi.servicios"),
        value: formatServicesCell(servicios),
        hint: t("billing.kpiHint.trips"),
      },
    ];
  }, [filteredRows, hasActiveFilters, t]);

  const handleExportExcel = () => {
    if (!canExportExcel) return;
    const numericRows = filteredRows.map((row) => [
      row.label,
      parseServicesCell(row.cells[0]),
      ...row.cells.slice(1).map((c) => parseEuroCell(c)),
    ]);
    const totalRow =
      filteredRows.length > 0
        ? [
            t("billing.export.total"),
            filteredRows.reduce((a, r) => a + parseServicesCell(r.cells[0]), 0),
            ...Array.from({ length: 10 }, (_, j) => {
              const idx = j + 1;
              return filteredRows.reduce(
                (acc, row) => acc + parseEuroCell(row.cells[idx] ?? "0 €"),
                0,
              );
            }),
          ]
        : null;
    void downloadExcelTable({
      filename: cfg.exportFilename,
      sheetName: cfg.exportSheet,
      headers: [
        cfg.labelColumn,
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
      rows: [
        [t("billing.export.from"), dateFromProp],
        [t("billing.export.to"), dateToProp],
        [t("billing.export.company"), scopeLabel],
        [t("billing.export.platform"), billingPlatformFilterLabel(platformFilter)],
        [t("billing.export.view"), t(`billing.tabs.${tab}`)],
        [],
        ...numericRows,
        ...(totalRow ? [[], totalRow] : []),
      ],
    });
  };

  const emptyMessage =
    activeRows.length === 0
      ? t("billing.empty.noClosedTrips")
      : tab === "byDay"
        ? t("billing.empty.noDays")
        : tab === "global"
          ? t("billing.empty.noGlobal")
          : t("billing.empty.noDrivers");

  return (
    <VuiPanel className="space-y-5 p-4 md:p-6">
      {!usingLiveData ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t("billing.noDataHint", {
            demoUrl: `/facturacion?${BILLING_DEMO_RANGE_QUERY}`,
          })}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {t("billing.liveHint", { from: dateFromProp, to: dateToProp })}
        </p>
      )}

      {pendingInPeriod ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("billing.pendingBanner", {
            tripCount: pendingInPeriod.tripCount,
            driverCount: pendingInPeriod.driverCount,
          })}{" "}
          <Link href="/cerrar-turnos" className="font-semibold text-amber-900 underline hover:no-underline">
            {t("billing.goToCloseShifts")}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-5">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
          {t("turnos.dateFrom")}
          <ErpDateInput value={dateFrom} onChange={setDateFrom} aria-label={t("analitica.dateFrom")} />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
          {t("turnos.dateTo")}
          <ErpDateInput value={dateTo} onChange={setDateTo} aria-label={t("analitica.dateTo")} />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
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
              router.push(`/facturacion?${opt.query}`);
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
        <button type="button" onClick={applyDateRange} className="erp-btn-primary text-xs">
          {t("turnos.apply")}
        </button>
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={!canExportExcel}
          className="erp-inline-input ml-auto inline-flex items-center justify-center transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Excel
        </button>
      </div>

      <section aria-labelledby="facturacion-period-summary">
        <p
          id="facturacion-period-summary"
          className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500"
        >
          {t("billing.periodSummary")}
        </p>
        <div className="vision-scrollbar flex gap-2 overflow-x-auto pb-1 pt-0.5">
          {displayPeriodKpis.map((k) => (
            <MiniKpiCard key={k.title} {...k} />
          ))}
        </div>
      </section>

      <nav className="erp-tabs-underline" aria-label={t("billing.viewNav")}>
        {TAB_IDS.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => {
              setTab(tabId);
              setSearchQuery("");
            }}
            className={tab === tabId ? "erp-tab-underline-active" : "erp-tab-underline"}
          >
            {t(`billing.tabs.${tabId}`)}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("billing.filterPlatform")}>
          <button
            type="button"
            onClick={() => setPlatformFilter("all")}
            className={platformPillClass(platformFilter === "all")}
          >
            {t("billing.allPlatforms")}
          </button>
          {platformFilterOptions.map((p) => {
            const slug = ridePlatformToSlug(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlatformFilter(p)}
                className={platformPillClass(platformFilter === p)}
              >
                <PlatformLogo id={appsPlatformLogoId(slug)} size="sm" />
                {appsPlatformDisplayName(slug)}
              </button>
            );
          })}
        </div>
        <ErpSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={cfg.searchPlaceholder}
          aria-label={cfg.searchPlaceholder}
          wrapperClassName="w-full min-w-0 max-w-md flex-1 sm:max-w-xs sm:flex-initial"
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("billing.summaryFiltered")}>
        {summaryKpi.map((k) => (
          <SummaryKpiCard key={k.title} {...k} />
        ))}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 md:text-base">{cfg.sectionTitle}</h2>
          <p className="mt-1 text-xs text-zinc-600">
            {billingPlatformFilterLabel(platformFilter)}
            {hasActiveFilters ? t("billing.filtered") : ""}
          </p>
        </div>
        <p className="text-xs font-semibold text-zinc-600">
          <span className="text-zinc-900">{filteredRows.length}</span>
          {hasActiveFilters && filteredRows.length !== activeRows.length ? (
            <>
              {t("common.of")}
              <span className="text-zinc-900">{activeRows.length}</span>
            </>
          ) : null}{" "}
          {cfg.countLabel}
        </p>
      </div>

      <BillingMetricsTable labelColumn={cfg.labelColumn} rows={filteredRows} emptyMessage={emptyMessage} />
    </VuiPanel>
  );
}
