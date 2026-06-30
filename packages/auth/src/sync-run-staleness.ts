/**
 * Heartbeat-aware staleness checks for `sync_runs` RUNNING rows.
 *
 * A long-but-alive sync (e.g. a 28-day Uber report backfill that takes 20+ min)
 * must not be reconciled as orphaned just because it started a while ago. While
 * a sync runs it refreshes `cursorHint.heartbeatAt`; the reconciler/guards treat
 * a run as stale only when the last heartbeat (not the start time) is too old.
 */

export function heartbeatAtFromCursorHint(cursorHint: unknown): Date | null {
  if (!cursorHint || typeof cursorHint !== "object") return null;
  const raw = (cursorHint as Record<string, unknown>).heartbeatAt;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Most recent sign of life: heartbeat when present and newer than start, else start time. */
export function syncRunLastActivity(startedAt: Date, cursorHint: unknown): Date {
  const hb = heartbeatAtFromCursorHint(cursorHint);
  return hb && hb.getTime() > startedAt.getTime() ? hb : startedAt;
}

export function isSyncRunStale(
  startedAt: Date,
  cursorHint: unknown,
  staleMs: number,
  now: number = Date.now(),
): boolean {
  return now - syncRunLastActivity(startedAt, cursorHint).getTime() > staleMs;
}

/** Align with worker poll reconciler and platform-sync guard. */
export const SYNC_RUN_RUNNING_STALE_MS = 12 * 60_000;
