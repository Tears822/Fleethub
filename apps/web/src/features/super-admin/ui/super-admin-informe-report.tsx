"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantCommercialStatus } from "@fleethub/db";
import type { ActiveDriversMonthRow } from "@/features/super-admin/server/reports.queries";
import {
  informeRangeQueryFromEs,
  shiftInformeMonth,
  type InformeDateRange,
} from "@/features/super-admin/lib/informe-date-range";
import { SuperAdminActiveDriversTable } from "@/features/super-admin/ui/super-admin-active-drivers-table";
import { ErpDateInput } from "@/shared/ui/erp-date-input";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { parseDateEs } from "@/shared/lib/date-es";

type PlatformFilter = "all" | "uber" | "freenow";
type StatusFilter = "all" | TenantCommercialStatus;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesSearch(row: ActiveDriversMonthRow, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = normalize(
    [row.tenantName, row.tenantSlug, ...row.companyNames].join(" "),
  );
  return haystack.includes(q);
}

function matchesStatus(row: ActiveDriversMonthRow, status: StatusFilter): boolean {
  if (status === "all") return true;
  return row.commercialStatus === status;
}

function matchesPlatform(row: ActiveDriversMonthRow, platform: PlatformFilter): boolean {
  if (platform === "all") return true;
  if (platform === "uber") {
    return row.activeDriversUber > 0 || row.closedTripsUber > 0;
  }
  return row.activeDriversFreeNow > 0 || row.closedTripsFreeNow > 0;
}

function appendFilterParams(
  base: string,
  opts: { q: string; status: StatusFilter; platform: PlatformFilter },
): string {
  const params = new URLSearchParams(base);
  const q = opts.q.trim();
  if (q) params.set("q", q);
  if (opts.status !== "all") params.set("status", opts.status);
  if (opts.platform !== "all") params.set("platform", opts.platform);
  return params.toString();
}

type Props = {
  rows: ActiveDriversMonthRow[];
  range: InformeDateRange;
  initialQ?: string;
  initialStatus?: StatusFilter;
  initialPlatform?: PlatformFilter;
};

export function SuperAdminInformeReport({
  rows,
  range,
  initialQ = "",
  initialStatus = "all",
  initialPlatform = "all",
}: Props) {
  const { t } = useTranslations();
  const router = useRouter();
  const [search, setSearch] = useState(initialQ);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [platform, setPlatform] = useState<PlatformFilter>(initialPlatform);
  const [dateFrom, setDateFrom] = useState(range.dateFromEs);
  const [dateTo, setDateTo] = useState(range.dateToEs);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesSearch(r, search) &&
          matchesStatus(r, status) &&
          matchesPlatform(r, platform),
      ),
    [rows, search, status, platform],
  );

  const filterOpts = { q: search, status, platform };

  const navigateRange = (next: InformeDateRange) => {
    const query = appendFilterParams(`from=${next.fromIso}&to=${next.toIso}`, filterOpts);
    router.push(`/super-admin/informe?${query}`);
  };

  const handleApplyDates = () => {
    const built = informeRangeQueryFromEs(dateFrom, dateTo);
    if (!built.ok) {
      setRangeError(t(`superAdmin.informe.errors.${built.errorKey}`));
      return;
    }
    setRangeError(null);
    const query = appendFilterParams(built.query, filterOpts);
    router.push(`/super-admin/informe?${query}`);
  };

  const handlePrevMonth = () => navigateRange(shiftInformeMonth(range, -1));
  const handleNextMonth = () => navigateRange(shiftInformeMonth(range, 1));

  return (
    <div className="space-y-0">
      <div className="space-y-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
            <div className="sm:col-span-2">
              <ErpSearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("superAdmin.informe.searchPlaceholder")}
                aria-label={t("superAdmin.informe.searchAria")}
                inputClassName="text-sm py-1.5"
              />
            </div>
            <label className="block text-xs">
              <span className="font-semibold uppercase tracking-wide text-zinc-500">
                {t("superAdmin.common.status")}
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="erp-inline-input mt-0.5 w-full py-1.5 text-sm"
                aria-label={t("superAdmin.informe.filterStatusAria")}
              >
                <option value="all">{t("superAdmin.common.all")}</option>
                <option value="ACTIVE">{t("superAdmin.common.commercialStatusActive")}</option>
                <option value="TRIAL">{t("superAdmin.common.commercialStatusTrial")}</option>
                <option value="SUSPENDED">{t("superAdmin.common.commercialStatusSuspended")}</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold uppercase tracking-wide text-zinc-500">
                {t("superAdmin.informe.platformLabel")}
              </span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformFilter)}
                className="erp-inline-input mt-0.5 w-full py-1.5 text-sm"
                aria-label={t("superAdmin.informe.filterPlatformAria")}
              >
                <option value="all">{t("superAdmin.common.allPlatforms")}</option>
                <option value="uber">{t("superAdmin.informe.uberWithActivity")}</option>
                <option value="freenow">{t("superAdmin.informe.freeNowWithActivity")}</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.informe.dateFrom")}
              <ErpDateInput
                value={dateFrom}
                onChange={setDateFrom}
                aria-label={t("superAdmin.informe.dateFromAria")}
              />
            </label>
            <span className="pb-1.5 text-zinc-600">—</span>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.informe.dateTo")}
              <ErpDateInput
                value={dateTo}
                onChange={setDateTo}
                aria-label={t("superAdmin.informe.dateToAria")}
              />
            </label>
            <button
              type="button"
              onClick={handleApplyDates}
              disabled={!parseDateEs(dateFrom) || !parseDateEs(dateTo)}
              className="sa-btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("superAdmin.informe.applyDates")}
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="sa-btn-outline px-3 py-1.5 text-xs"
            >
              {t("superAdmin.informe.prevMonth")}
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="sa-btn-outline px-3 py-1.5 text-xs"
            >
              {t("superAdmin.informe.nextMonth")}
            </button>
          </div>
        </div>
        {rangeError ? <p className="text-xs text-red-600">{rangeError}</p> : null}
        <p className="text-xs text-zinc-500">
          {t("superAdmin.informe.appliedPeriod")}{" "}
          <span className="font-medium text-zinc-700">
            {range.dateFromEs} – {range.dateToEs}
          </span>
          {filtered.length !== rows.length ? (
            <>
              {" "}
              · {t("superAdmin.common.showingFiltered", {
                shown: filtered.length,
                total: rows.length,
                entity: t("superAdmin.informe.showingOperators"),
              })}
            </>
          ) : null}
        </p>
      </div>

      <div className="px-4 py-3">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            {rows.length === 0
              ? t("superAdmin.tenants.emptyNone")
              : t("superAdmin.common.noOperatorFilterMatch")}
          </p>
        ) : (
          <SuperAdminActiveDriversTable rows={filtered} />
        )}
      </div>
    </div>
  );
}
