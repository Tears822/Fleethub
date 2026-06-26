"use client";

import Link from "next/link";
import type { SuperAdminTenantRow } from "@/features/super-admin/server/tenants.queries";
import { SuperAdminDeleteTenantButton } from "@/features/super-admin/ui/super-admin-delete-tenant-button";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { compareDates, compareStrings, useTableSort } from "@/shared/lib/table-sort";

function statusClass(row: SuperAdminTenantRow): string {
  if (row.commercialStatus === "ACTIVE") return "font-semibold text-emerald-600";
  if (row.commercialStatus === "TRIAL") return "font-semibold text-amber-600";
  return "font-semibold text-red-600";
}

type CompactSortKey = "nombre" | "plan" | "estado" | "alta";

type FullSortKey = "nombre" | "cif" | "email" | "empresa" | "plan" | "estado" | "alta";

export function SuperAdminTenantsTableCompact({
  tenants,
  showActions = false,
}: {
  tenants: SuperAdminTenantRow[];
  showActions?: boolean;
}) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    CompactSortKey,
    SuperAdminTenantRow
  >(tenants, "nombre", "asc", {
    nombre: (a, b, d) => compareStrings(a.name, b.name, d),
    plan: (a, b, d) => compareStrings(a.plan, b.plan, d),
    estado: (a, b, d) => compareStrings(a.status, b.status, d),
    alta: (a, b, d) => compareDates(a.createdAt, b.createdAt, d),
  });

  if (tenants.length === 0) {
    return <p className="px-4 py-4 text-xs text-zinc-500">{t("superAdmin.tenants.emptyDb")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left">
        <thead className="sa-table-head">
          <tr>
            <SaSortableTh
              label={t("superAdmin.common.name")}
              activeDir={dirFor("nombre")}
              onSort={() => toggleSort("nombre")}
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
            {showActions ? <th>{t("common.actions")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((tenant) => (
            <tr key={tenant.id} className="sa-table-row">
              <td>
                <div className="font-semibold text-zinc-900">{tenant.name}</div>
                {tenant.contactEmail ? (
                  <div className="text-[11px] text-zinc-500">{tenant.contactEmail}</div>
                ) : null}
              </td>
              <td className="font-semibold text-emerald-600">{tenant.plan}</td>
              <td className={statusClass(tenant)}>{tenant.status}</td>
              <td>{tenant.createdAt.toLocaleDateString(dateLocale)}</td>
              {showActions ? (
                <td>
                  <Link href={`/super-admin/tenants/${tenant.id}`} className="sa-btn-edit">
                    {t("common.edit")}
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SuperAdminTenantsTableFull({ tenants }: { tenants: SuperAdminTenantRow[] }) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    FullSortKey,
    SuperAdminTenantRow
  >(tenants, "nombre", "asc", {
    nombre: (a, b, d) => compareStrings(a.name, b.name, d),
    cif: (a, b, d) => compareStrings(a.taxId ?? "", b.taxId ?? "", d),
    email: (a, b, d) => compareStrings(a.contactEmail ?? "", b.contactEmail ?? "", d),
    empresa: (a, b, d) => compareStrings(a.companyName ?? "", b.companyName ?? "", d),
    plan: (a, b, d) => compareStrings(a.plan, b.plan, d),
    estado: (a, b, d) => compareStrings(a.status, b.status, d),
    alta: (a, b, d) => compareDates(a.createdAt, b.createdAt, d),
  });

  if (tenants.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-zinc-500">{t("superAdmin.tenants.emptyNone")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left">
        <thead className="sa-table-head">
          <tr>
            <th className="w-10">#</th>
            <SaSortableTh
              label={t("superAdmin.common.name")}
              activeDir={dirFor("nombre")}
              onSort={() => toggleSort("nombre")}
            />
            <SaSortableTh
              label={t("superAdmin.common.taxId")}
              activeDir={dirFor("cif")}
              onSort={() => toggleSort("cif")}
            />
            <SaSortableTh
              label={t("superAdmin.common.email")}
              activeDir={dirFor("email")}
              onSort={() => toggleSort("email")}
            />
            <SaSortableTh
              label={t("superAdmin.common.company")}
              activeDir={dirFor("empresa")}
              onSort={() => toggleSort("empresa")}
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
                <div className="text-[11px] text-zinc-500">{tenant.slug}</div>
              </td>
              <td className="font-mono text-zinc-700">{tenant.taxId ?? "—"}</td>
              <td>{tenant.contactEmail ?? "—"}</td>
              <td>{tenant.companyName ?? "—"}</td>
              <td className="font-semibold text-emerald-600">{tenant.plan}</td>
              <td className={statusClass(tenant)}>{tenant.status}</td>
              <td>{tenant.createdAt.toLocaleDateString(dateLocale)}</td>
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
  );
}
