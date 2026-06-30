"use client";

import Link from "next/link";
import type { TenantSyncHealthRow } from "@fleethub/auth";
import type { FleetSyncQueueStats } from "@/features/super-admin/server/sync-monitor.queries";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { SuperAdminForceSyncButton } from "@/features/super-admin/ui/super-admin-force-sync-button";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { compareNumbers, compareStrings, useTableSort } from "@/shared/lib/table-sort";

function coverageClass(pct: number): string {
  if (pct >= 70) return "text-emerald-700";
  if (pct >= 40) return "text-amber-700";
  return "text-red-700";
}

export function SuperAdminSyncQueueSummary({ queue }: { queue: FleetSyncQueueStats }) {
  const { t } = useTranslations();

  if (!queue.available) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        {t("superAdmin.sync.queueUnavailable")}
      </div>
    );
  }

  const labels = [
    t("superAdmin.sync.queueWaiting"),
    t("superAdmin.sync.queueActive"),
    t("superAdmin.sync.queueDelayed"),
    t("superAdmin.sync.queueFailed"),
  ] as const;
  const values = [queue.waiting, queue.active, queue.delayed, queue.failed] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {labels.map((label, index) => (
        <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{values[index]}</p>
        </div>
      ))}
    </div>
  );
}

type HealthSortKey = "tenant" | "cobertura" | "uber" | "freenow" | "ultimoOk" | "fallos";

export function SuperAdminSyncHealthTable({ rows }: { rows: TenantSyncHealthRow[] }) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    HealthSortKey,
    TenantSyncHealthRow
  >(rows, "cobertura", "asc", {
    tenant: (a, b, d) => compareStrings(a.tenantName, b.tenantName, d),
    cobertura: (a, b, d) => compareNumbers(a.coverage.coveragePct, b.coverage.coveragePct, d),
    uber: (a, b, d) => {
      const au = a.coverage.byPlatform.find((p) => p.platform === "UBER");
      const bu = b.coverage.byPlatform.find((p) => p.platform === "UBER");
      return compareNumbers(au?.coveragePct ?? 0, bu?.coveragePct ?? 0, d);
    },
    freenow: (a, b, d) => {
      const af = a.coverage.byPlatform.find((p) => p.platform === "FREENOW");
      const bf = b.coverage.byPlatform.find((p) => p.platform === "FREENOW");
      return compareNumbers(af?.coveragePct ?? 0, bf?.coveragePct ?? 0, d);
    },
    ultimoOk: (a, b, d) =>
      compareNumbers(a.lastSuccessAt?.getTime() ?? 0, b.lastSuccessAt?.getTime() ?? 0, d),
    fallos: (a, b, d) => compareNumbers(a.failedLast7d, b.failedLast7d, d),
  });

  const formatWhen = (d: Date | null): string => {
    if (!d) return "—";
    return d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });
  };

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-zinc-500">{t("superAdmin.sync.noActiveTenants")}</p>
    );
  }

  const uberPct = (r: TenantSyncHealthRow) =>
    r.coverage.byPlatform.find((p) => p.platform === "UBER")?.coveragePct ?? 0;
  const fnPct = (r: TenantSyncHealthRow) =>
    r.coverage.byPlatform.find((p) => p.platform === "FREENOW")?.coveragePct ?? 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            <SaSortableTh
              label={t("superAdmin.common.tenant")}
              activeDir={dirFor("tenant")}
              onSort={() => toggleSort("tenant")}
            />
            <SaSortableTh
              label={t("superAdmin.sync.coverage24h")}
              activeDir={dirFor("cobertura")}
              onSort={() => toggleSort("cobertura")}
            />
            <SaSortableTh
              label={t("superAdmin.sync.uberPct")}
              activeDir={dirFor("uber")}
              onSort={() => toggleSort("uber")}
            />
            <SaSortableTh
              label={t("superAdmin.sync.freeNowPct")}
              activeDir={dirFor("freenow")}
              onSort={() => toggleSort("freenow")}
            />
            <SaSortableTh
              label={t("superAdmin.sync.lastSyncOk")}
              activeDir={dirFor("ultimoOk")}
              onSort={() => toggleSort("ultimoOk")}
            />
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.sync.runningColumn")}
            </th>
            <SaSortableTh
              label={t("superAdmin.sync.failures7dShort")}
              activeDir={dirFor("fallos")}
              onSort={() => toggleSort("fallos")}
            />
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.common.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r) => (
            <tr key={r.tenantId} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/super-admin/tenants/${r.tenantId}`}
                  className="font-semibold text-sky-700 hover:underline"
                >
                  {r.tenantName}
                </Link>
                <p className="text-xs text-zinc-500">{r.tenantSlug}</p>
              </td>
              <td className={`px-4 py-3 font-bold tabular-nums ${coverageClass(r.coverage.coveragePct)}`}>
                {r.coverage.coveragePct}%
                <span className="ml-1 text-xs font-normal text-zinc-500">
                  ({r.coverage.activeLast24h}/{r.coverage.linkedDrivers})
                </span>
              </td>
              <td className={`px-4 py-3 tabular-nums ${coverageClass(uberPct(r))}`}>{uberPct(r)}%</td>
              <td className={`px-4 py-3 tabular-nums ${coverageClass(fnPct(r))}`}>{fnPct(r)}%</td>
              <td className="px-4 py-3 text-zinc-700">{formatWhen(r.lastSuccessAt)}</td>
              <td className="px-4 py-3">
                {r.runningSyncs.length === 0 ? (
                  <span className="text-zinc-400">—</span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.runningSyncs.map((s) => (
                      <li
                        key={`${s.platform}-${s.startedAt.toISOString()}`}
                        className={`text-xs font-medium ${s.stale ? "text-red-700" : "text-amber-800"}`}
                      >
                        {s.platform} — {t("superAdmin.sync.runningMinutes", { minutes: s.minutesRunning })}
                        {s.stale ? ` (${t("superAdmin.sync.runningStale")})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td
                className={`px-4 py-3 tabular-nums font-semibold ${r.failedLast7d > 0 ? "text-red-600" : "text-zinc-500"}`}
              >
                {r.failedLast7d}
              </td>
              <td className="px-4 py-3">
                <SuperAdminForceSyncButton tenantId={r.tenantId} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
