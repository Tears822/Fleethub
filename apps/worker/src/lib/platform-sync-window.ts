import { RidePlatform } from "@fleethub/db";
import type { PlatformSyncTrigger } from "@fleethub/auth";

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 1 ? Math.min(28, Math.round(n)) : fallback;
}

/** Shorter window on automatic poll (today + yesterday). */
export const UBER_POLL_SYNC_DAYS = () => envInt("UBER_POLL_SYNC_DAYS", 2);
export const FREENOW_POLL_SYNC_DAYS = () => envInt("FREENOW_POLL_SYNC_DAYS", 2);
/** On-demand sync before shift liquidation. */
export const LIQUIDATION_SYNC_DAYS = () => envInt("LIQUIDATION_SYNC_DAYS", 2);

export function resolvePlatformSyncDays(args: {
  platform: RidePlatform;
  trigger: PlatformSyncTrigger;
  tenantDays: number;
  syncDaysOverride?: number;
}): number {
  if (args.syncDaysOverride != null && args.syncDaysOverride >= 1) {
    return Math.min(28, Math.round(args.syncDaysOverride));
  }
  if (args.trigger === "liquidation") {
    return LIQUIDATION_SYNC_DAYS();
  }
  if (args.trigger === "poll") {
    return args.platform === RidePlatform.UBER
      ? Math.min(args.tenantDays, UBER_POLL_SYNC_DAYS())
      : Math.min(args.tenantDays, FREENOW_POLL_SYNC_DAYS());
  }
  return args.tenantDays;
}
