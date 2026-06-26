"use client";

import { ErpEyeLink } from "@/shared/ui/erp-eye-link";
import { formatServicesCell, parseEuroCell } from "@/features/billing/lib/facturacion-mock-format";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";
import { VuiSortableTh } from "@/shared/ui/vui-sortable-th";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";
import type { CompanyListRow } from "@/features/companies/server/companies.queries";
import { EmpresaLicenciasDisplay } from "@/features/companies/ui/empresa-licencias-display";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function EmpresasPrototypeLayout({
  companies,
  canManage = false,
}: {
  companies: CompanyListRow[];
  canManage?: boolean;
}) {
  const { t } = useTranslations();
  const activeCompanies = companies.filter((c) => c.isActive);
  const activeCount = activeCompanies.length;
  const totalDrivers = activeCompanies.reduce((s, c) => s + c._count.drivers, 0);
  const totalLicenses = activeCompanies.reduce((s, c) => s + (c.licensedDrivers ?? 0), 0);
  const withQuota = companies.filter((c) => c.licensedDrivers != null && c.licensedDrivers > 0);
  const overQuota = withQuota.filter(
    (c) => c.licensedDrivers != null && c.activeDrivers > c.licensedDrivers,
  ).length;

  type EmpSortKey =
    | "legalName"
    | "taxId"
    | "contacto"
    | "licencias"
    | "conductores"
    | "facturacion"
    | "estado";

  const { sortedRows, toggle, dirFor } = useTableSort<EmpSortKey, CompanyListRow>(
    companies,
    "legalName",
    "asc",
    {
      legalName: (a, b, d) => compareStrings(a.legalName, b.legalName, d),
      taxId: (a, b, d) => compareStrings(a.taxId ?? "", b.taxId ?? "", d),
      contacto: (a, b, d) => compareStrings(a.contactName, b.contactName, d),
      licencias: (a, b, d) =>
        compareNumbers(a.licensedDrivers ?? 0, b.licensedDrivers ?? 0, d),
      conductores: (a, b, d) => compareNumbers(a.activeDrivers, b.activeDrivers, d),
      facturacion: (a, b, d) =>
        compareNumbers(parseEuroCell(a.billingMonth), parseEuroCell(b.billingMonth), d),
      estado: (a, b, d) => compareNumbers(a.isActive ? 1 : 0, b.isActive ? 1 : 0, d),
    },
  );

  return (
    <div className="space-y-4">
      {companies.length === 0 ? (
        <p className="text-sm text-zinc-600">
          {t("empresas.noCompanies")}{" "}
          {canManage ? t("empresas.createFirst") : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-zinc-500">
        <p>
          {t("empresas.activeCount", { count: activeCount })}
          {companies.length !== activeCount ? (
            <>
              {" "}
              · <span className="font-semibold text-zinc-900">{companies.length}</span>{" "}
              {t("empresas.inList")}
            </>
          ) : null}
        </p>
        {companies.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="font-semibold tabular-nums text-zinc-900">
                {formatServicesCell(totalDrivers)}
              </span>{" "}
              {t("empresas.drivers")}
            </span>
            <span>
              <span className="font-semibold tabular-nums text-zinc-900">
                {formatServicesCell(totalLicenses)}
              </span>{" "}
              {t("empresas.licenses")}
            </span>
            {overQuota > 0 ? (
              <span className="text-xs font-semibold text-amber-700">
                {t("empresas.overQuota", { count: overQuota })}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {companies.length > 0 ? (
        <VuiPanel className="overflow-hidden p-0">
          <VuiTableShell className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="vui-table-head">
                <tr>
                  <VuiSortableTh
                    label={t("empresas.legalName")}
                    activeDir={dirFor("legalName")}
                    onSort={() => toggle("legalName")}
                  />
                  <VuiSortableTh
                    label={t("empresas.taxId")}
                    activeDir={dirFor("taxId")}
                    onSort={() => toggle("taxId")}
                  />
                  <VuiSortableTh
                    label={t("empresas.contact")}
                    activeDir={dirFor("contacto")}
                    onSort={() => toggle("contacto")}
                  />
                  <VuiSortableTh
                    label={t("empresas.licensesCol")}
                    align="right"
                    className="tabular-nums"
                    activeDir={dirFor("licencias")}
                    onSort={() => toggle("licencias")}
                  />
                  <VuiSortableTh
                    label={t("nav.conductores")}
                    align="right"
                    className="tabular-nums"
                    activeDir={dirFor("conductores")}
                    onSort={() => toggle("conductores")}
                  />
                  <VuiSortableTh
                    label={t("empresas.billingMonth")}
                    activeDir={dirFor("facturacion")}
                    onSort={() => toggle("facturacion")}
                  />
                  <VuiSortableTh
                    label={t("common.status")}
                    activeDir={dirFor("estado")}
                    onSort={() => toggle("estado")}
                  />
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="vui-table-row">
                    <td>
                      <div className="font-medium text-zinc-900">{r.legalName}</div>
                      <div className="text-[11px] text-zinc-500">{r.listAddress}</div>
                    </td>
                    <td className="font-mono text-xs text-zinc-700">{r.taxId ?? "—"}</td>
                    <td>
                      <div className="text-zinc-900">{r.contactName}</div>
                      <div className="text-[11px] text-zinc-500">{r.email}</div>
                    </td>
                    <td className="tabular-nums">
                      <EmpresaLicenciasDisplay
                        activeDrivers={r.activeDrivers}
                        licensedDrivers={r.licensedDrivers}
                      />
                    </td>
                    <td className="tabular-nums text-zinc-700">
                      {r._count.drivers}
                      {r.activeDrivers !== r._count.drivers ? (
                        <span className="ml-1 text-[11px] text-zinc-500">
                          {t("empresas.activeDrivers", { count: r.activeDrivers })}
                        </span>
                      ) : null}
                    </td>
                    <td className="font-semibold text-zinc-900">{r.billingMonth}</td>
                    <td>
                      {r.isActive ? (
                        <span className="text-xs font-semibold text-emerald-600">{t("empresas.activeStatus")}</span>
                      ) : (
                        <span className="text-xs text-zinc-500">{t("empresas.inactiveStatus")}</span>
                      )}
                    </td>
                    <td className="space-x-2">
                      <ErpEyeLink href={`/empresas/${r.id}`} label={t("common.viewDetail")} />
                      {canManage ? (
                        <ErpEyeLink href={`/empresas/${r.id}/editar`} label={t("common.edit")} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </VuiTableShell>
        </VuiPanel>
      ) : null}
    </div>
  );
}
