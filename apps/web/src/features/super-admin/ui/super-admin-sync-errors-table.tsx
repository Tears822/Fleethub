"use client";

import type {
  GlobalSyncErrorRow,
  GlobalSyncErrorSummary,
} from "@/features/super-admin/server/reports.queries";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { compareDates, compareStrings, useTableSort } from "@/shared/lib/table-sort";

type SyncErrorSortKey = "tenant" | "plataforma" | "inicio" | "error";

export function SuperAdminSyncErrorsSummary({ summary }: { summary: GlobalSyncErrorSummary }) {
  const { t } = useTranslations();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          {t("superAdmin.sync.failures24h")}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">{summary.failedLast24h}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          {t("superAdmin.sync.failures7d")}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">{summary.failedLast7Days}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          {t("superAdmin.sync.byPlatform")}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          {summary.byPlatform.length === 0 ? (
            <li className="text-zinc-500">{t("superAdmin.sync.noErrors")}</li>
          ) : (
            summary.byPlatform.map((p) => (
              <li key={p.platform}>
                <span className="font-semibold">{p.platform}</span>: {p.count}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function SuperAdminSyncErrorsTable({ rows }: { rows: GlobalSyncErrorRow[] }) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    SyncErrorSortKey,
    GlobalSyncErrorRow
  >(rows, "inicio", "desc", {
    tenant: (a, b, d) => compareStrings(a.tenantName, b.tenantName, d),
    plataforma: (a, b, d) => compareStrings(a.platform, b.platform, d),
    inicio: (a, b, d) => compareDates(a.startedAt, b.startedAt, d),
    error: (a, b, d) => compareStrings(a.errorMessage ?? "", b.errorMessage ?? "", d),
  });

  const formatWhen = (d: Date): string =>
    d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-zinc-500">{t("superAdmin.sync.errorsEmpty")}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead className="sa-table-head">
          <tr>
            <SaSortableTh
              label={t("superAdmin.common.tenant")}
              activeDir={dirFor("tenant")}
              onSort={() => toggleSort("tenant")}
            />
            <SaSortableTh
              label={t("superAdmin.common.platform")}
              activeDir={dirFor("plataforma")}
              onSort={() => toggleSort("plataforma")}
            />
            <SaSortableTh
              label={t("superAdmin.common.start")}
              activeDir={dirFor("inicio")}
              onSort={() => toggleSort("inicio")}
            />
            <SaSortableTh
              label={t("superAdmin.common.error")}
              activeDir={dirFor("error")}
              onSort={() => toggleSort("error")}
            />
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r) => (
            <tr key={r.id} className="sa-table-row">
              <td>
                <div className="font-semibold text-zinc-900">{r.tenantName}</div>
                <div className="text-[11px] text-zinc-500">{r.tenantSlug}</div>
              </td>
              <td>{r.platform}</td>
              <td className="tabular-nums text-zinc-700">{formatWhen(r.startedAt)}</td>
              <td className="max-w-xs truncate text-red-600" title={r.errorMessage ?? ""}>
                {r.errorMessage ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
