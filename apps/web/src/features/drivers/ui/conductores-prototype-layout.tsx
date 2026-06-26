"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErpEyeLink } from "@/shared/ui/erp-eye-link";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { matchesSearchQuery } from "@/shared/lib/normalize-search";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import { ridePlatformsToLogoIds } from "@/shared/lib/ride-platform-logos";
import type { PlatformLogoId } from "@/shared/lib/ride-platform-logos";
import { appsPlatformDisplayName } from "@/features/apps/lib/apps-platform";
import { MockPlatformDots } from "@/shared/ui/mock-platform-dots";
import { ProductivityBadge } from "@/features/drivers/ui/productivity-badge";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import type { DriverProductivityMap } from "@/features/drivers/server/driver-productivity.queries";
import type { ProductivityLevel } from "@fleethub/auth/driver-productivity";
import {
  connectionDotLabel,
  type ConnectionDot,
} from "@/features/drivers/lib/driver-connection-labels";

export type ConductoresPrototypeDriver = {
  id: string;
  fullName: string;
  company: { legalName: string };
  isActive: boolean;
  dni?: string | null;
  email?: string | null;
  licenseNumber?: string | null;
  driverPlatformAccounts?: { platform: "UBER" | "FREENOW" | "BOLT" | "CABIFY" }[];
};

const connectionDotClass: Record<ConnectionDot, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  unknown: "bg-zinc-400",
};

type Row = {
  id?: string;
  name: string;
  company: string;
  subtitle: string;
  platforms: PlatformLogoId[];
  active: boolean;
  productivity?: ProductivityLevel;
  connectionDot?: ConnectionDot;
};

type StatusFilter = "all" | "activo" | "inactivo";
type PlatformFilter = "all" | PlatformLogoId;

const PLATFORM_FILTER_ORDER: PlatformLogoId[] = ["uber", "freenow", "bolt", "cabify"];

function collectPlatformFilterOptions(rows: Row[]): PlatformLogoId[] {
  const seen = new Set<PlatformLogoId>();
  for (const row of rows) {
    for (const platform of row.platforms) seen.add(platform);
  }
  return PLATFORM_FILTER_ORDER.filter((p) => seen.has(p));
}

function matchesPlatform(row: Row, filter: PlatformFilter): boolean {
  if (filter === "all") return true;
  return row.platforms.includes(filter);
}

function formatLicense(licenseNumber: string | null | undefined): string {
  const lic = licenseNumber?.trim();
  if (!lic) return "";
  return lic.toUpperCase().startsWith("LICENCIA") ? lic : `Lic. VTC ${lic}`;
}

function formatDriverSubtitle(
  dni: string | null | undefined,
  email: string | null | undefined,
  licenseNumber: string | null | undefined,
  noDniEmail: string,
): string {
  const parts: string[] = [];
  const dniVal = dni?.trim();
  const emailVal = email?.trim();
  const lic = formatLicense(licenseNumber);
  if (dniVal) parts.push(`DNI ${dniVal}`);
  if (emailVal) parts.push(emailVal);
  if (lic) parts.push(lic);
  return parts.length > 0 ? parts.join(" · ") : noDniEmail;
}

function matchesStatus(row: Row, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "activo") return row.active;
  return !row.active;
}

function matchesSearch(row: Row, query: string): boolean {
  return (
    matchesSearchQuery(row.name, query) ||
    matchesSearchQuery(row.company, query) ||
    matchesSearchQuery(row.subtitle, query)
  );
}

export function ConductoresPrototypeLayout({
  drivers,
  productivityMap = {},
  connectionMap = {},
  canCreate = false,
}: {
  drivers: ConductoresPrototypeDriver[];
  productivityMap?: DriverProductivityMap;
  connectionMap?: Record<string, ConnectionDot>;
  canCreate?: boolean;
}) {
  const { t } = useTranslations();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  const allRows: Row[] = useMemo(
    () =>
      drivers.map((d) => ({
        id: d.id,
        name: d.fullName,
        company: d.company.legalName,
        subtitle: formatDriverSubtitle(d.dni, d.email, d.licenseNumber, t("conductores.noDniEmail")),
        platforms: ridePlatformsToLogoIds(d.driverPlatformAccounts?.map((a) => a.platform)),
        active: d.isActive,
        productivity: productivityMap[d.id],
        connectionDot: connectionMap[d.id],
      })),
    [drivers, productivityMap, connectionMap, t],
  );

  const platformFilterOptions = useMemo(
    () => collectPlatformFilterOptions(allRows),
    [allRows],
  );

  useEffect(() => {
    if (platformFilter === "all") return;
    if (!platformFilterOptions.includes(platformFilter)) {
      setPlatformFilter("all");
    }
  }, [platformFilter, platformFilterOptions]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (!matchesStatus(row, statusFilter)) return false;
      if (!matchesPlatform(row, platformFilter)) return false;
      return matchesSearch(row, searchQuery);
    });
  }, [allRows, searchQuery, statusFilter, platformFilter]);

  type CondSortKey = "estado" | "conductor" | "empresa" | "productividad";
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    CondSortKey,
    Row
  >(filteredRows, "conductor", "asc", {
    estado: (a, b, d) => compareNumbers(a.active ? 1 : 0, b.active ? 1 : 0, d),
    conductor: (a, b, d) => compareStrings(a.name, b.name, d),
    empresa: (a, b, d) => compareStrings(a.company, b.company, d),
    productividad: (a, b, d) =>
      compareStrings(a.productivity ?? "", b.productivity ?? "", d),
  });

  const activeCount = filteredRows.filter((r) => r.active).length;
  const hasActiveFilters =
    searchQuery.trim() !== "" || statusFilter !== "all" || platformFilter !== "all";

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setPlatformFilter("all");
  }, []);

  return (
    <div className="space-y-4">
      {drivers.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t("conductores.noDriversTenant")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {hasActiveFilters && filteredRows.length !== allRows.length
            ? t("conductores.countSummaryFiltered", {
                filtered: filteredRows.length,
                total: allRows.length,
                active: activeCount,
              })
            : t("conductores.countSummary", {
                count: filteredRows.length,
                active: activeCount,
              })}
        </p>
        {canCreate ? (
          <Link href="/conductores/nuevo" className="erp-btn-primary">
            {t("conductores.newDriver")}
          </Link>
        ) : null}
      </div>

      <VuiPanel className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ErpSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("conductores.searchPlaceholder")}
            aria-label={t("conductores.searchAria")}
            wrapperClassName="min-w-[10rem] flex-1 md:max-w-xs"
          />
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
            className="erp-inline-input min-w-[10rem]"
            aria-label={t("turnos.filterPlatform")}
          >
            <option value="all">{t("turnos.allPlatforms")}</option>
            {platformFilterOptions.map((p) => (
              <option key={p} value={p}>
                {appsPlatformDisplayName(p)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="erp-inline-input min-w-[10rem]"
            aria-label={t("conductores.filterStatusAria")}
          >
            <option value="all">{t("common.allStatuses")}</option>
            <option value="activo">{t("turnos.active")}</option>
            <option value="inactivo">{t("turnos.inactive")}</option>
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

        <VuiTableShell className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="vui-table-head">
              <tr>
                <VuiSortableTh
                  label={t("common.status")}
                  activeDir={dirFor("estado")}
                  onSort={() => toggleSort("estado")}
                />
                <VuiSortableTh
                  label={t("turnos.columns.conductor")}
                  activeDir={dirFor("conductor")}
                  onSort={() => toggleSort("conductor")}
                />
                <VuiSortableTh
                  label={t("common.company")}
                  activeDir={dirFor("empresa")}
                  onSort={() => toggleSort("empresa")}
                />
                <th>{t("common.platforms")}</th>
                <VuiSortableTh
                  label={t("common.productivity")}
                  activeDir={dirFor("productividad")}
                  onSort={() => toggleSort("productividad")}
                />
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr className="vui-table-row">
                  <td colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                    {allRows.length === 0
                      ? t("conductores.noDriversInList")
                      : t("conductores.noFilterMatch")}
                  </td>
                </tr>
              ) : null}
              {displayRows.map((r, i) => (
                <tr key={r.id ?? `${r.name}-${i}`} className="vui-table-row">
                  <td>
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${r.active ? "bg-emerald-500" : "bg-red-500"}`}
                      title={r.active ? t("turnos.active") : t("turnos.inactive")}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {r.connectionDot ? (
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${connectionDotClass[r.connectionDot]}`}
                          title={connectionDotLabel(r.connectionDot)}
                          aria-label={connectionDotLabel(r.connectionDot)}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-900">
                          {r.id ? (
                            <Link
                              href={`/conductores/${r.id}`}
                              className="text-orange-600 hover:underline"
                            >
                              {r.name}
                            </Link>
                          ) : (
                            r.name
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500">{r.subtitle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-zinc-900/90">{r.company}</td>
                  <td>
                    <MockPlatformDots platforms={r.platforms} />
                  </td>
                  <td>
                    <ProductivityBadge level={r.productivity} />
                  </td>
                  <td>
                    {r.id ? (
                      <ErpEyeLink href={`/conductores/${r.id}`} label={t("common.viewDetail")} />
                    ) : (
                      <span className="text-[11px] text-zinc-500">—</span>
                    )}
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
