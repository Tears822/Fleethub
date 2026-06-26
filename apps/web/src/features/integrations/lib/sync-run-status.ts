import type { Translator } from "@fleethub/i18n";
import type { TripIngestSource } from "@/features/integrations/lib/ingest-source";
import type { PlatformSyncTrigger } from "@/features/integrations/lib/sync-trigger";

export type SyncRunDto = {
  id: string;
  platform: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  trigger?: PlatformSyncTrigger;
  ingestSource?: TripIngestSource | null;
  tripsUpserted?: number | null;
  ingestCollisions?: number | null;
  tripsMissingAmounts?: number | null;
  tripsWithAmounts?: number | null;
  paymentsComplete?: boolean | null;
};

export function normalizeSyncStatus(status: string): string {
  return status.trim().toUpperCase();
}

export function syncStatusLabel(status: string, t?: Translator): string {
  const s = normalizeSyncStatus(status);
  if (t) {
    if (s === "SUCCESS") return t("sync.statusOk");
    if (s === "PARTIAL") return t("sync.statusPartial");
    if (s === "FAILED") return t("sync.statusFailed");
    if (s === "RUNNING") return t("sync.statusRunning");
    if (s === "SKIPPED") return t("sync.statusSkipped");
  }
  if (s === "SUCCESS") return "OK";
  if (s === "PARTIAL") return "Importes pendientes";
  if (s === "FAILED") return "Error";
  if (s === "RUNNING") return "En curso";
  if (s === "SKIPPED") return "Omitido";
  return status;
}

export function syncStatusClass(status: string): string {
  const s = normalizeSyncStatus(status);
  if (s === "SUCCESS") return "text-emerald-700";
  if (s === "PARTIAL") return "text-amber-700";
  if (s === "FAILED") return "text-red-600";
  if (s === "RUNNING") return "text-amber-700";
  return "text-zinc-600";
}

export function hasRunningSyncRuns(rows: { status: string }[]): boolean {
  return rows.some((r) => normalizeSyncStatus(r.status) === "RUNNING");
}

export function parseSyncRunDto(row: SyncRunDto): {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  trigger: PlatformSyncTrigger;
  ingestSource: TripIngestSource | null;
  tripsUpserted: number | null;
  ingestCollisions: number | null;
  tripsMissingAmounts: number | null;
  tripsWithAmounts: number | null;
  paymentsComplete: boolean | null;
} {
  return {
    ...row,
    startedAt: new Date(row.startedAt),
    finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
    trigger: row.trigger ?? "manual",
    ingestSource: row.ingestSource ?? null,
    tripsUpserted: row.tripsUpserted ?? null,
    ingestCollisions: row.ingestCollisions ?? null,
    tripsMissingAmounts: row.tripsMissingAmounts ?? null,
    tripsWithAmounts: row.tripsWithAmounts ?? null,
    paymentsComplete: row.paymentsComplete ?? null,
  };
}
