"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SuperAdminUserRow } from "@/features/super-admin/server/users.queries";
import { SuperAdminDeleteUserButton } from "@/features/super-admin/ui/super-admin-delete-user-button";
import { SuperAdminResetUser2faButton } from "@/features/super-admin/ui/super-admin-reset-user-2fa-button";
import { SuperAdminResetPasswordButton } from "@/features/super-admin/ui/super-admin-reset-password-button";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { ErpSearchInput } from "@/shared/ui/erp-search-input";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import {
  compareBooleans,
  compareStrings,
  useTableSort,
} from "@/shared/lib/table-sort";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

type RoleFilter = "all" | SuperAdminUserRow["role"];

function matchesSearch(row: SuperAdminUserRow, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const haystack = normalize(
    [
      row.name,
      row.firstName,
      row.lastName,
      row.email,
      row.roleLabel,
      row.role,
      row.tenantSlug ?? "",
      ...row.tenants,
      row.status,
    ].join(" "),
  );
  return haystack.includes(q);
}

function matchesRole(row: SuperAdminUserRow, role: RoleFilter): boolean {
  if (role === "all") return true;
  return row.role === role;
}

function editHref(u: SuperAdminUserRow): string {
  return `/super-admin/usuarios/${u.id}`;
}

function roleBadgeClass(role: string): string {
  if (role === "superadmin") {
    return "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700";
  }
  return "rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700";
}

type UserSortKey = "nombre" | "email" | "rol" | "tenants" | "2fa" | "estado";

function tenantsSortKey(row: SuperAdminUserRow): string {
  return row.tenants.join(", ");
}

type Props = {
  users: SuperAdminUserRow[];
};

export function SuperAdminUsersList({ users }: Props) {
  const { t } = useTranslations();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const filtered = useMemo(
    () => users.filter((u) => matchesSearch(u, search) && matchesRole(u, roleFilter)),
    [users, search, roleFilter],
  );

  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    UserSortKey,
    SuperAdminUserRow
  >(filtered, "nombre", "asc", {
    nombre: (a, b, d) => compareStrings(a.name, b.name, d),
    email: (a, b, d) => compareStrings(a.email, b.email, d),
    rol: (a, b, d) => compareStrings(a.roleLabel, b.roleLabel, d),
    tenants: (a, b, d) => compareStrings(tenantsSortKey(a), tenantsSortKey(b), d),
    "2fa": (a, b, d) => compareBooleans(a.totpEnabled, b.totpEnabled, d),
    estado: (a, b, d) => compareStrings(a.status, b.status, d),
  });

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <ErpSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("superAdmin.users.searchPlaceholder")}
            aria-label={t("superAdmin.users.searchAria")}
            wrapperClassName="min-w-0 flex-1 sm:max-w-md"
            inputClassName="text-sm py-1.5"
          />
          <label className="block shrink-0 text-xs">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.common.role")}
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="erp-inline-input mt-0.5 w-full min-w-[9rem] py-1.5 text-sm sm:w-auto"
              aria-label={t("superAdmin.users.filterRoleAria")}
            >
              <option value="all">{t("superAdmin.common.all")}</option>
              <option value="superadmin">{t("shell.roles.superAdmin")}</option>
              <option value="admin">{t("shell.roles.admin")}</option>
              <option value="gestor">{t("shell.roles.gestor")}</option>
              <option value="lectura">{t("shell.roles.readOnly")}</option>
            </select>
          </label>
        </div>
        <ExportFileButton
          href="/api/super-admin/export/usuarios.xlsx"
          label={t("common.exportExcel")}
          filename="FleetHub_usuarios.xlsx"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">
          {users.length === 0
            ? t("superAdmin.users.emptyNone")
            : t("superAdmin.common.noFilterMatch")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="sa-table-head">
              <tr>
                <SaSortableTh
                  label={t("superAdmin.common.name")}
                  activeDir={dirFor("nombre")}
                  onSort={() => toggleSort("nombre")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.email")}
                  activeDir={dirFor("email")}
                  onSort={() => toggleSort("email")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.role")}
                  activeDir={dirFor("rol")}
                  onSort={() => toggleSort("rol")}
                />
                <SaSortableTh
                  label={t("superAdmin.common.assignedTenants")}
                  activeDir={dirFor("tenants")}
                  onSort={() => toggleSort("tenants")}
                />
                <SaSortableTh
                  label="2FA"
                  activeDir={dirFor("2fa")}
                  onSort={() => toggleSort("2fa")}
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
              {displayRows.map((u) => (
                <tr key={`${u.kind}-${u.id}`} className="sa-table-row">
                  <td className="font-semibold text-zinc-900">{u.name}</td>
                  <td className="max-w-[200px] truncate text-sm">{u.email}</td>
                  <td>
                    <span className={roleBadgeClass(u.role)}>{u.roleLabel}</span>
                  </td>
                  <td className="max-w-xs">
                    {u.tenants.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.tenants.map((tenantName) => (
                          <span
                            key={tenantName}
                            className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700"
                          >
                            {tenantName}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {u.totpEnabled ? (
                      <span
                        className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800"
                        title={t("superAdmin.users.totpActiveTitle")}
                      >
                        {t("superAdmin.common.active")}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">{t("common.no")}</span>
                    )}
                  </td>
                  <td className="font-semibold text-emerald-600">{u.status}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Link href={editHref(u)} className="sa-btn-edit">
                        {t("common.edit")}
                      </Link>
                      <SuperAdminResetPasswordButton
                        userId={u.id}
                        userName={u.name}
                        email={u.email}
                        kind={u.kind}
                        tenantId={u.tenantId}
                        className="sa-btn-outline text-[10px]"
                      />
                      {u.totpEnabled ? (
                        <SuperAdminResetUser2faButton
                          userId={u.id}
                          userName={u.name}
                          kind={u.kind}
                          tenantId={u.tenantId}
                          totpEnabled={u.totpEnabled}
                        />
                      ) : null}
                      {"self" in u && u.self ? (
                        <span className="px-2 py-1 text-[10px] text-zinc-400">
                          {t("superAdmin.common.self")}
                        </span>
                      ) : (
                        <SuperAdminDeleteUserButton
                          userId={u.id}
                          userName={u.name}
                          kind={u.kind}
                          tenantId={u.tenantId}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {search.trim() || roleFilter !== "all" ? (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
          {t("superAdmin.common.showingFiltered", {
            shown: filtered.length,
            total: users.length,
            entity: t("superAdmin.users.showingUsers"),
          })}
        </p>
      ) : null}
    </>
  );
}
