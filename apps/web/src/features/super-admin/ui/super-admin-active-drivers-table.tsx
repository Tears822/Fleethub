"use client";

import type { ActiveDriversMonthRow } from "@/features/super-admin/server/reports.queries";
import { SaSortableTh } from "@/features/super-admin/ui/sa-sortable-th";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import {
  compareNumbers,
  compareStrings,
  useTableSort,
} from "@/shared/lib/table-sort";

type DriverReportSortKey =
  | "tenant"
  | "estado"
  | "conductores"
  | "conductoresUber"
  | "conductoresFreeNow"
  | "viajes"
  | "viajesUber"
  | "viajesFreeNow";

export function SuperAdminActiveDriversTable({ rows }: { rows: ActiveDriversMonthRow[] }) {
  const { t } = useTranslations();
  const { sortedRows: displayRows, toggle: toggleSort, dirFor } = useTableSort<
    DriverReportSortKey,
    ActiveDriversMonthRow
  >(rows, "tenant", "asc", {
    tenant: (a, b, d) => compareStrings(a.tenantName, b.tenantName, d),
    estado: (a, b, d) => compareStrings(a.commercialStatusLabel, b.commercialStatusLabel, d),
    conductores: (a, b, d) => compareNumbers(a.activeDrivers, b.activeDrivers, d),
    conductoresUber: (a, b, d) => compareNumbers(a.activeDriversUber, b.activeDriversUber, d),
    conductoresFreeNow: (a, b, d) =>
      compareNumbers(a.activeDriversFreeNow, b.activeDriversFreeNow, d),
    viajes: (a, b, d) => compareNumbers(a.closedTrips, b.closedTrips, d),
    viajesUber: (a, b, d) => compareNumbers(a.closedTripsUber, b.closedTripsUber, d),
    viajesFreeNow: (a, b, d) => compareNumbers(a.closedTripsFreeNow, b.closedTripsFreeNow, d),
  });

  const totalDrivers = rows.reduce((s, r) => s + r.activeDrivers, 0);
  const totalDriversUber = rows.reduce((s, r) => s + r.activeDriversUber, 0);
  const totalDriversFn = rows.reduce((s, r) => s + r.activeDriversFreeNow, 0);
  const totalTrips = rows.reduce((s, r) => s + r.closedTrips, 0);
  const totalTripsUber = rows.reduce((s, r) => s + r.closedTripsUber, 0);
  const totalTripsFn = rows.reduce((s, r) => s + r.closedTripsFreeNow, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-600">
        {t("superAdmin.informe.summaryIntro")}{" "}
        {t("superAdmin.informe.driversCount", { count: totalDrivers })} (
        <span className="tabular-nums">
          {t("superAdmin.common.platformUber")} {totalDriversUber}
        </span>{" "}
        ·{" "}
        <span className="tabular-nums">
          {t("superAdmin.common.platformFreeNow")} {totalDriversFn}
        </span>
        ) · {t("superAdmin.informe.tripsCount", { count: totalTrips })} (
        <span className="tabular-nums">
          {t("superAdmin.common.platformUber")} {totalTripsUber}
        </span>{" "}
        ·{" "}
        <span className="tabular-nums">
          {t("superAdmin.common.platformFreeNow")} {totalTripsFn}
        </span>
        )
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead className="sa-table-head">
            <tr>
              <SaSortableTh
                label={t("superAdmin.common.tenant")}
                activeDir={dirFor("tenant")}
                onSort={() => toggleSort("tenant")}
              />
              <SaSortableTh
                label={t("superAdmin.common.status")}
                activeDir={dirFor("estado")}
                onSort={() => toggleSort("estado")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.activeDrivers")}
                activeDir={dirFor("conductores")}
                onSort={() => toggleSort("conductores")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.activeDriversUber")}
                activeDir={dirFor("conductoresUber")}
                onSort={() => toggleSort("conductoresUber")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.activeDriversFreeNow")}
                activeDir={dirFor("conductoresFreeNow")}
                onSort={() => toggleSort("conductoresFreeNow")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.closedTrips")}
                activeDir={dirFor("viajes")}
                onSort={() => toggleSort("viajes")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.closedTripsUber")}
                activeDir={dirFor("viajesUber")}
                onSort={() => toggleSort("viajesUber")}
              />
              <SaSortableTh
                label={t("superAdmin.informe.closedTripsFreeNow")}
                activeDir={dirFor("viajesFreeNow")}
                onSort={() => toggleSort("viajesFreeNow")}
              />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.tenantId} className="sa-table-row">
                <td>
                  <div className="font-semibold text-zinc-900">{r.tenantName}</div>
                  <div className="text-[11px] text-zinc-500">{r.tenantSlug}</div>
                </td>
                <td className="text-sm text-zinc-700">{r.commercialStatusLabel}</td>
                <td className="tabular-nums font-semibold text-zinc-900">{r.activeDrivers}</td>
                <td className="tabular-nums text-zinc-700">{r.activeDriversUber}</td>
                <td className="tabular-nums text-zinc-700">{r.activeDriversFreeNow}</td>
                <td className="tabular-nums font-semibold text-zinc-900">{r.closedTrips}</td>
                <td className="tabular-nums text-zinc-700">{r.closedTripsUber}</td>
                <td className="tabular-nums text-zinc-700">{r.closedTripsFreeNow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
