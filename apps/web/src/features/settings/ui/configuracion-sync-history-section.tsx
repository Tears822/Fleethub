"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { fetchSyncRuns } from "@/features/integrations/lib/request-platform-sync";
import {
  hasRunningSyncRuns,
  parseSyncRunDto,
} from "@/features/integrations/lib/sync-run-status";
import {
  SyncHistoryTable,
  type SyncHistoryRow,
} from "@/features/settings/ui/sync-history-table";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { useTranslations } from "@/shared/i18n/i18n-provider";

const SYNC_HISTORY_DAYS = 30;

export function ConfiguracionSyncHistorySection({
  initialRows,
  canExport = false,
}: {
  initialRows: SyncHistoryRow[];
  canExport?: boolean;
}) {
  const { t } = useTranslations();
  const [rows, setRows] = useState(initialRows);
  const [watching, setWatching] = useState(false);

  const refreshRows = useCallback(async () => {
    const dtos = await fetchSyncRuns(SYNC_HISTORY_DAYS);
    const parsed = dtos.map(parseSyncRunDto);
    setRows(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    const onSyncStarted = () => {
      setWatching(true);
      void refreshRows();
    };
    window.addEventListener("fleethub:sync-started", onSyncStarted);
    return () => window.removeEventListener("fleethub:sync-started", onSyncStarted);
  }, [refreshRows]);

  useEffect(() => {
    if (!watching) return;
    const tick = async () => {
      const parsed = await refreshRows();
      if (!hasRunningSyncRuns(parsed)) {
        setWatching(false);
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    const stop = window.setTimeout(() => setWatching(false), 60_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [watching, refreshRows]);

  const exportHref = "/api/tenant/export/historial-sync.xlsx";

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
            <History className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <h2 className="text-sm font-semibold text-zinc-900">
            {t("config.syncHistory.title")} ({SYNC_HISTORY_DAYS} días)
          </h2>
        </div>
        {canExport && rows.length > 0 ? (
          <ExportFileButton
            href={exportHref}
            label={t("config.syncHistory.downloadExcel")}
            filename="historial-sync.xlsx"
          />
        ) : null}
      </div>

      <p className="mb-4 text-xs text-zinc-600">
        Ejecuciones de sincronización Uber y FreeNow en este tenant. Incluye sync programado y manual
        desde Integraciones. Horas en zona España (Europe/Madrid).
      </p>

      {watching ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {t("config.integrations.syncWatching")}
        </p>
      ) : null}

      <SyncHistoryTable rows={rows} retentionDays={SYNC_HISTORY_DAYS} />
    </VuiPanel>
  );
}
