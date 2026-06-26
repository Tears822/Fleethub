"use client";

import Link from "next/link";
import type { SuperAdminUserRow } from "@/features/super-admin/server/users.queries";
import { SuperAdminDeleteUserButton } from "@/features/super-admin/ui/super-admin-delete-user-button";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { compareStrings, useTableSort } from "@/shared/lib/table-sort";

function roleBadgeClass(role: string): string {
  if (role === "superadmin") {
    return "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700";
  }
  return "rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700";
}

function editHref(u: SuperAdminUserRow): string {
  return `/super-admin/usuarios/${u.id}`;
}

function tenantsSortKey(row: SuperAdminUserRow): string {
  return row.tenants.join(", ");
}

type CompactSortKey = "usuario" | "rol" | "tenants";

type FullSortKey = "nombre" | "email" | "rol" | "tenants" | "estado";

export function SuperAdminUsersTableCompact({
  users,
  showActions = false,
}: {
  users: SuperAdminUserRow[];
  showActions?: boolean;
}) {
  const { t } = useTranslations();
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    CompactSortKey,
    SuperAdminUserRow
  >(users, "usuario", "asc", {
    usuario: (a, b, d) => compareStrings(a.name, b.name, d),
    rol: (a, b, d) => compareStrings(a.role, b.role, d),
    tenants: (a, b, d) => compareStrings(tenantsSortKey(a), tenantsSortKey(b), d),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left">
        <thead className="sa-table-head">
          <tr>
            <SaSortableTh
              label={t("superAdmin.common.user")}
              activeDir={dirFor("usuario")}
              onSort={() => toggleSort("usuario")}
            />
            <SaSortableTh
              label={t("superAdmin.common.role")}
              activeDir={dirFor("rol")}
              onSort={() => toggleSort("rol")}
            />
            <SaSortableTh
              label={t("superAdmin.common.tenants")}
              activeDir={dirFor("tenants")}
              onSort={() => toggleSort("tenants")}
            />
            {showActions ? <th>{t("common.actions")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((u) => (
            <tr key={u.id} className="sa-table-row">
              <td>
                <div className="font-semibold text-zinc-900">{u.name}</div>
                <div className="text-[11px] text-zinc-500">{u.email}</div>
              </td>
              <td>
                <span className={roleBadgeClass(u.role)}>{u.role}</span>
              </td>
              <td className="text-zinc-600">
                {u.tenants.length === 0 ? t("superAdmin.common.unassigned") : u.tenants.length}
              </td>
              {showActions ? (
                <td>
                  <Link href={editHref(u)} className="sa-btn-edit">
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

export function SuperAdminUsersTableFull({ users }: { users: SuperAdminUserRow[] }) {
  const { t } = useTranslations();
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    FullSortKey,
    SuperAdminUserRow
  >(users, "nombre", "asc", {
    nombre: (a, b, d) => compareStrings(a.name, b.name, d),
    email: (a, b, d) => compareStrings(a.email, b.email, d),
    rol: (a, b, d) => compareStrings(a.role, b.role, d),
    tenants: (a, b, d) => compareStrings(tenantsSortKey(a), tenantsSortKey(b), d),
    estado: (a, b, d) => compareStrings(a.status, b.status, d),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-left">
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
              label={t("superAdmin.common.status")}
              activeDir={dirFor("estado")}
              onSort={() => toggleSort("estado")}
            />
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((u) => (
            <tr key={u.id} className="sa-table-row">
              <td className="font-semibold text-zinc-900">{u.name}</td>
              <td>{u.email}</td>
              <td>
                <span className={roleBadgeClass(u.role)}>{u.role}</span>
              </td>
              <td className="max-w-xs">
                {u.tenants.length === 0 ? (
                  <span className="text-zinc-400">{t("superAdmin.common.unassigned")}</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {u.tenants.map((tenantName) => (
                      <span key={tenantName} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700">
                        {tenantName}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="font-semibold text-emerald-600">{u.status}</td>
              <td>
                <div className="flex gap-1">
                  <Link href={editHref(u)} className="sa-btn-edit">
                    {t("common.edit")}
                  </Link>
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
  );
}
