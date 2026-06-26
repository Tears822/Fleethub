import type { RidePlatform } from "@fleethub/db";

export type SyncPlatform = Extract<RidePlatform, "UBER" | "FREENOW">;

/** Stale when last successful sync is older than 2× polling interval (min 30 min). */
export function syncStaleThresholdMs(pollingMinutes: number): number {
  const minutes = Math.max(5, Number(pollingMinutes) || 15);
  return Math.max(minutes * 2, 30) * 60_000;
}

export function syncPlatformLabel(platform: SyncPlatform): string {
  return platform === "UBER" ? "Uber" : "FreeNow";
}

export function isSyncReferenceStale(
  referenceAt: Date | null | undefined,
  pollingMinutes: number,
): boolean {
  if (!referenceAt) return true;
  return Date.now() - referenceAt.getTime() > syncStaleThresholdMs(pollingMinutes);
}
