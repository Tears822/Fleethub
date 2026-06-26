"use client";

import {
  syncStatusClass,
  syncStatusLabel,
} from "@/features/integrations/lib/sync-run-status";
import {
  ingestSourceLabel,
  type TripIngestSource,
} from "@/features/integrations/lib/ingest-source";
import type { PlatformSyncTrigger } from "@/features/integrations/lib/sync-trigger";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiTableShell } from "@/shared/ui/vui-table-shell";

import { formatDateTimeShortInTenantTz } from "@/shared/lib/tenant-timezone";

export type SyncHistoryRow = {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  trigger?: PlatformSyncTrigger;
  ingestSource?: TripIngestSource | null;
  tripsUpserted?: number | null;
  ingestCollisions?: number | null;
  tripsMissingAmounts?: number | null;
  tripsWithAmounts?: number | null;
  paymentsComplete?: boolean | null;
};

/** Filas visibles sin scroll; el resto del listado se desplaza en el contenedor. */
const VISIBLE_ROW_COUNT = 10;
/** ~3.25rem por fila de datos + cabecera fija */
const SCROLL_MAX_HEIGHT = "calc(3.25rem * 10 + 2.5rem)";

export function SyncHistoryTable({
  rows,
  retentionDays = 30,
}: {
  rows: SyncHistoryRow[];
  retentionDays?: number;
}) {
  const { t } = useTranslations();

  if (rows.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        {t("config.syncHistory.noRuns", { days: retentionDays })}
      </p>
    );
  }

  const summaryText =
    rows.length <= VISIBLE_ROW_COUNT
      ? rows.length === 1
        ? t("config.syncHistory.runCountOne", { count: rows.length, days: retentionDays })
        : t("config.syncHistory.runCountMany", { count: rows.length, days: retentionDays })
      : t("config.syncHistory.showingRecent", {
          count: rows.length,
          days: retentionDays,
          visible: VISIBLE_ROW_COUNT,
        });

  return (
    <>
      <p className="mb-2 text-[11px] text-zinc-500">{summaryText}</p>
      <VuiTableShell className="overflow-hidden">
        <div className="overflow-y-auto" style={{ maxHeight: SCROLL_MAX_HEIGHT }}>
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(228_228_231)]">
              <tr className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">{t("config.syncHistory.platform")}</th>
                <th className="px-3 py-2">{t("config.syncHistory.ingest")}</th>
                <th className="px-3 py-2">{t("config.syncHistory.status")}</th>
                <th className="px-3 py-2">{t("config.syncHistory.started")}</th>
                <th className="px-3 py-2">{t("config.syncHistory.finished")}</th>
                <th className="px-3 py-2">{t("config.syncHistory.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{row.platform}</td>
                  <td className="px-3 py-2.5 text-zinc-600">
                    <span>{ingestSourceLabel(row.ingestSource)}</span>
                    {typeof row.tripsUpserted === "number" ? (
                      <span className="mt-0.5 block text-[10px] text-zinc-500">
                        {t("config.syncHistory.tripsCount", { count: row.tripsUpserted })}
                        {typeof row.tripsMissingAmounts === "number" &&
                        row.tripsMissingAmounts > 0 ? (
                          <span className="text-amber-700">
                            {" "}
                            · {row.tripsMissingAmounts} sin importes
                          </span>
                        ) : null}
                        {row.ingestCollisions && row.ingestCollisions > 0
                          ? ` · ${row.ingestCollisions} colisión(es)`
                          : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className={`px-3 py-2.5 font-semibold ${syncStatusClass(row.status)}`}>
                    {syncStatusLabel(row.status, t)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700">
                    {formatDateTimeShortInTenantTz(row.startedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-700">
                    {row.finishedAt ? formatDateTimeShortInTenantTz(row.finishedAt) : "—"}
                  </td>
                  <td
                    className="max-w-xs px-3 py-2.5 text-zinc-600"
                    title={row.errorMessage ?? ""}
                  >
                    {row.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VuiTableShell>
    </>
  );
}
