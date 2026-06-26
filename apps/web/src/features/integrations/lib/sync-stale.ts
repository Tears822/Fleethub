import { syncStaleThresholdMs as thresholdFromPolling } from "@fleethub/auth";

/** @deprecated Use tenant `pollingMinutes*` via `syncStaleThresholdMs(minutes)` from @fleethub/auth */
export const PLATFORM_SYNC_STALE_MINUTES: Record<"UBER" | "FREENOW", number> = {
  UBER: 15,
  FREENOW: 15,
};

export function syncStaleThresholdMs(
  platform: "UBER" | "FREENOW",
  pollingMinutes?: number,
): number {
  const minutes =
    pollingMinutes ??
    (platform === "UBER"
      ? PLATFORM_SYNC_STALE_MINUTES.UBER
      : PLATFORM_SYNC_STALE_MINUTES.FREENOW);
  return thresholdFromPolling(minutes);
}
