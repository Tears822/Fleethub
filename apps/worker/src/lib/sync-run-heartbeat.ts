/**
 * Keeps sync_runs RUNNING heartbeats alive during long Uber API waits (rate limits, report polling).
 * Registered by process-platform-sync for the duration of each job.
 */

let poke: (() => Promise<void>) | null = null;

export function registerSyncRunHeartbeat(fn: () => Promise<void>): void {
  poke = fn;
}

export function clearSyncRunHeartbeat(): void {
  poke = null;
}

export async function pokeSyncRunHeartbeat(): Promise<void> {
  if (poke) await poke();
}

/** Sleep while refreshing heartbeat every intervalMs (default 30s). */
export async function sleepWithSyncHeartbeat(ms: number, intervalMs = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await pokeSyncRunHeartbeat();
    const remaining = end - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
  }
}
