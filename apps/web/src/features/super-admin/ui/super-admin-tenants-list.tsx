"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SuperAdminTenantRow } from "@/features/super-admin/server/tenants.queries";
import { SuperAdminDeleteTenantButton } from "@/features/super-admin/ui/super-admin-delete-tenant-button";
import {
  SuperAdminTenantCompanyLines,
  SuperAdminTenantPlatformIcons,
} from "@/features/super-admin/ui/super-admin-tenant-platform-icons";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import {
  compareDates,
  compareNumbers,
  compareStrings,
  useTableSort,
} from "@/shared/lib/table-sort";

function statusClass(row: SuperAdminTenantRow): string {
  if (row.commercialStatus === "ACTIVE") return "font-semibold text-emerald-600";
  if (row.commercialStatus === "TRIAL") return "font-semibold text-amber-600";
  return "font-semibold text-red-600";
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesSearch(row: SuperAdminTenantRow, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = normalize(
    [
      row.name,
      row.slug,
      row.companiesLabel,
      ...row.companyNames,
      ...row.companies.map((c) => c.taxId ?? ""),
      ...row.companies.map((c) => c.legalName),
      row.taxId ?? "",
      row.contactEmail ?? "",
      row.adminLoginEmail ?? "",
      row.contactPerson,
      row.contactPhone,
      row.plan,
      row.status,
    ].join(" "),
  );
  return haystack.includes(q);
}

type TenantSortKey =
  | "operador"
  | "cif"
  | "empresas"
  | "plataformas"
  | "contacto"
  | "telefono"
  | "email"
  | "plan"
  | "estado"
  | "alta";

function platformSortScore(row: SuperAdminTenantRow): number {
  return (row.hasUber ? 2 : 0) + (row.hasFreeNow ? 1 : 0);
}

function firstCompanyTaxId(row: SuperAdminTenantRow): string {
  return row.companies[0]?.taxId?.trim() ?? "";
}

function firstCompanyName(row: SuperAdminTenantRow): string {
  return row.companies[0]?.legalName ?? "";
}

function emailSortKey(row: SuperAdminTenantRow): string {
  return row.contactEmail?.trim() || row.adminLoginEmail?.trim() || "";
}

type Props = {
  tenants: SuperAdminTenantRow[];
};

export function SuperAdminTenantsList({ tenants }: Props) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => tenants.filter((tenant) => matchesSearch(tenant, search)),
    [tenants, search],
  );

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    TenantSortKey,
    SuperAdminTenantRow
  >(filtered, "operador", "asc", {
    operador: (a, b, d) => compareStrings(a.name, b.name, d),
    cif: (a, b, d) => compareStrings(firstCompanyTaxId(a), firstCompanyTaxId(b), d),
    empresas: (a, b, d) => compareStrings(firstCompanyName(a), firstCompanyName(b), d),
    plataformas: (a, b, d) => compareNumbers(platformSortScore(a), platformSortScore(b), d),
    contacto: (a, b, d) => compareStrings(a.contactPerson, b.contactPerson, d),
    telefono: (a, b, d) => compareStrings(a.contactPhone, b.contactPhone, d),
    email: (a, b, d) => compareStrings(emailSortKey(a), emailSortKey(b), d),
    plan: (a, b, d) => compareStrings(a.plan, b.plan, d),
    estado: (a, b, d) => compareStrings(a.status, b.status, d),
    alta: (a, b, d) => compareDates(a.createdAt, b.createdAt, d),
  });

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <ErpSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("superAdmin.tenants.searchPlaceholder")}
            aria-label={t("superAdmin.tenants.searchAria")}
            inputClassName="text-sm py-1.5"
          />
        </div>
        <ExportFileButton
          href="/api/super-admin/export/tenants.xlsx"
          label={t("common.exportExcel")}
          filename="FleetHub_tenants.xlsx"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">
          {tenants.length === 0
            ? t("superAdmin.tenants.emptyNone")
            : t("superAdmin.common.noSearchResults")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="sa-table-head">
              <tr>
                <th className="w-10">#</th>
                <SaSortableTh
                  label={t("superAdmin.common.operator")}
                  activeDir={dirFor("operador")}
                  onSort={() => toggleSort("operador")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.taxId")}
                  activeDir={dirFor("cif")}
                  onSort={() => toggleSort("cif")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.companies")}
                  activeDir={dirFor("empresas")}
                  onSort={() => toggleSort("empresas")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.platforms")}
                  activeDir={dirFor("plataformas")}
                  onSort={() => toggleSort("plataformas")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.contact")}
                  activeDir={dirFor("contacto")}
                  onSort={() => toggleSort("contacto")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.phone")}
                  activeDir={dirFor("telefono")}
                  onSort={() => toggleSort("telefono")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.email")}
                  activeDir={dirFor("email")}
                  onSort={() => toggleSort("email")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.plan")}
                  activeDir={dirFor("plan")}
                  onSort={() => toggleSort("plan")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.status")}
                  activeDir={dirFor("estado")}
                  onSort={() => toggleSort("estado")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.registeredAt")}
                  activeDir={dirFor("alta")}
                  onSort={() => toggleSort("alta")}
                />
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((tenant, index) => (
                <tr key={tenant.id} className="sa-table-row">
                  <td className="text-zinc-500">{index + 1}</td>
                  <td>
                    <div className="font-semibold text-zinc-900">{tenant.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">{tenant.slug}</div>
                  </td>
                  <td className="align-top">
                    <SuperAdminTenantCompanyLines companies={tenant.companies} field="taxId" />
                  </td>
                  <td className="max-w-[240px] align-top">
                    <SuperAdminTenantCompanyLines companies={tenant.companies} field="legalName" />
                  </td>
                  <td className="align-top">
                    <SuperAdminTenantPlatformIcons hasUber={tenant.hasUber} hasFreeNow={tenant.hasFreeNow} />
                  </td>
                  <td>{tenant.contactPerson || "—"}</td>
                  <td className="whitespace-nowrap">{tenant.contactPhone || "—"}</td>
                  <td className="max-w-[200px] text-sm">
                    {tenant.contactEmail ? (
                      <div className="truncate" title={tenant.contactEmail}>
                        {tenant.contactEmail}
                      </div>
                    ) : tenant.adminLoginEmail ? (
                      <div className="truncate text-zinc-600" title={tenant.adminLoginEmail}>
                        {tenant.adminLoginEmail}
                      </div>
                    ) : (
                      "—"
                    )}
                    {tenant.contactEmail && tenant.adminLoginEmail ? (
                      <div
                        className="truncate text-[11px] text-zinc-500"
                        title={t("superAdmin.common.adminAccessTitle", { email: tenant.adminLoginEmail })}
                      >
                        {t("superAdmin.common.accessLabel", { email: tenant.adminLoginEmail })}
                      </div>
                    ) : !tenant.contactEmail && tenant.adminLoginEmail ? (
                      <div className="text-[11px] text-zinc-500">
                        {t("superAdmin.common.accessEmailHint")}
                      </div>
                    ) : null}
                  </td>
                  <td className="font-semibold text-emerald-600">{tenant.plan}</td>
                  <td className={statusClass(tenant)}>{tenant.status}</td>
                  <td className="whitespace-nowrap">
                    {new Date(tenant.createdAt).toLocaleDateString(dateLocale)}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Link href={`/super-admin/tenants/${tenant.id}`} className="sa-btn-edit">
                        {t("common.edit")}
                      </Link>
                      <SuperAdminDeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
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
            total: tenants.length,
            entity: t("superAdmin.tenants.showingOperators"),
          })}
        </p>
      ) : null}
    </>
  );
}
