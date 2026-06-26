"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SuperAdminCompanyRow } from "@/features/super-admin/server/companies.queries";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import {
  compareBooleans,
  compareNumbers,
  compareStrings,
  useTableSort,
} from "@/shared/lib/table-sort";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesSearch(row: SuperAdminCompanyRow, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = normalize(
    [
      row.legalName,
      row.taxId ?? "",
      row.tenantName,
      row.tenantSlug,
      row.contactEmail ?? "",
    ].join(" "),
  );
  return haystack.includes(q);
}

type CompanySortKey =
  | "empresa"
  | "cif"
  | "operador"
  | "email"
  | "conductores"
  | "estado";

type Props = {
  companies: SuperAdminCompanyRow[];
};

export function SuperAdminCompaniesList({ companies }: Props) {
  const { t } = useTranslations();
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => companies.filter((c) => matchesSearch(c, search)),
    [companies, search],
  );

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    CompanySortKey,
    SuperAdminCompanyRow
  >(filtered, "empresa", "asc", {
    empresa: (a, b, d) => compareStrings(a.legalName, b.legalName, d),
    cif: (a, b, d) => compareStrings(a.taxId ?? "", b.taxId ?? "", d),
    operador: (a, b, d) => compareStrings(a.tenantName, b.tenantName, d),
    email: (a, b, d) => compareStrings(a.contactEmail ?? "", b.contactEmail ?? "", d),
    conductores: (a, b, d) => compareNumbers(a.driverCount, b.driverCount, d),
    estado: (a, b, d) => compareBooleans(a.isActive, b.isActive, d),
  });

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <ErpSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("superAdmin.companies.searchPlaceholder")}
          aria-label={t("superAdmin.companies.searchAria")}
          wrapperClassName="min-w-0 flex-1 sm:max-w-md"
          inputClassName="text-sm py-1.5"
        />
        <ExportFileButton
          href="/api/super-admin/export/empresas.xlsx"
          label={t("common.exportExcel")}
          filename="FleetHub_empresas.xlsx"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">
          {companies.length === 0
            ? t("superAdmin.companies.emptyNone")
            : t("superAdmin.common.noSearchResults")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left">
            <thead className="sa-table-head">
              <tr>
                <th className="w-10">#</th>
                <SaSortableTh
                  label={t("superAdmin.common.company")}
                  activeDir={dirFor("empresa")}
                  onSort={() => toggleSort("empresa")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.taxId")}
                  activeDir={dirFor("cif")}
                  onSort={() => toggleSort("cif")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.operator")}
                  activeDir={dirFor("operador")}
                  onSort={() => toggleSort("operador")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.contactEmail")}
                  activeDir={dirFor("email")}
                  onSort={() => toggleSort("email")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.drivers")}
                  activeDir={dirFor("conductores")}
                  onSort={() => toggleSort("conductores")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.status")}
                  activeDir={dirFor("estado")}
                  onSort={() => toggleSort("estado")}
                />
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((c, index) => (
                <tr key={c.id} className="sa-table-row">
                  <td className="text-zinc-500">{index + 1}</td>
                  <td className="font-semibold text-zinc-900">{c.legalName}</td>
                  <td className="font-mono text-zinc-700">{c.taxId ?? "—"}</td>
                  <td>
                    <div className="font-medium text-zinc-800">{c.tenantName}</div>
                    <div className="font-mono text-[11px] text-zinc-500">{c.tenantSlug}</div>
                  </td>
                  <td className="max-w-[180px] truncate text-sm">{c.contactEmail ?? "—"}</td>
                  <td className="tabular-nums">{c.driverCount}</td>
                  <td className={c.isActive ? "text-emerald-600" : "text-amber-700"}>
                    {c.isActive ? t("superAdmin.common.activeCompany") : t("superAdmin.common.inactive")}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Link
                        href={`/super-admin/empresas/${c.id}/editar`}
                        className="sa-btn-edit"
                      >
                        {t("common.edit")}
                      </Link>
                      <Link
                        href={`/super-admin/tenants/${c.tenantId}`}
                        className="sa-btn-edit text-zinc-600"
                        title={t("superAdmin.common.operator")}
                      >
                        {t("superAdmin.common.operator")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {search.trim() ? (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
          {t("superAdmin.common.showingFiltered", {
            shown: filtered.length,
            total: companies.length,
            entity: t("superAdmin.companies.showingCompanies"),
          })}
        </p>
      ) : null}
    </>
  );
}
