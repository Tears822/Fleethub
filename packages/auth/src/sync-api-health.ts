import { withoutTenant } from "@fleethub/db";

export type SyncApiSuccess24h = {
  since: Date;
  total: number;
  success: number;
  failed: number;
  successPct: number;
};

/** Éxito de jobs de sync por plataforma (últimas 24 h) — proxy FRD §4.6. */
export async function getGlobalSyncApiSuccess24h(): Promise<SyncApiSuccess24h> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await withoutTenant((tx) =>
    tx.syncRun.groupBy({
      by: ["status"],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
    }),
  );

  let success = 0;
  let failed = 0;
  for (const row of rows) {
    const status = row.status.toLowerCase();
    const n = row._count._all;
    if (status === "success") success += n;
    else if (status === "failed") failed += n;
  }

  const total = success + failed;
  const successPct = total > 0 ? Math.round((success / total) * 100) : 100;

  return { since, total, success, failed, successPct };
}
