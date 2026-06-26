import "server-only";

import { parseSyncRunCursorHint } from "@/features/integrations/lib/ingest-source";
import { parseSyncTrigger } from "@/features/integrations/lib/sync-trigger";
import { withTenant } from "@/infrastructure/database";

const syncRunSelect = {
  id: true,
  platform: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  errorMessage: true,
  cursorHint: true,
} as const;

function mapSyncRunRow(row: {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  cursorHint: unknown;
}) {
  const hint = parseSyncRunCursorHint(row.cursorHint);
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorMessage: row.errorMessage,
    trigger: hint.trigger ?? parseSyncTrigger(row.cursorHint),
    ingestSource: hint.ingestSource,
    tripsUpserted: hint.tripsUpserted,
    ingestCollisions: hint.ingestCollisions,
    tripsMissingAmounts: hint.tripsMissingAmounts,
    tripsWithAmounts: hint.tripsWithAmounts,
    paymentsComplete: hint.paymentsComplete,
  };
}

export async function getRecentSyncRuns(tenantId: string, limit = 15) {
  const rows = await withTenant(tenantId, (tx) =>
    tx.syncRun.findMany({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: syncRunSelect,
    }),
  );
  return rows.map(mapSyncRunRow);
}

/** FRD §13 — últimos 30 días de historial de sincronización. */
export async function getSyncRunsLast30Days(tenantId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await withTenant(tenantId, (tx) =>
    tx.syncRun.findMany({
      where: { tenantId, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: syncRunSelect,
    }),
  );
  return rows.map(mapSyncRunRow);
}
