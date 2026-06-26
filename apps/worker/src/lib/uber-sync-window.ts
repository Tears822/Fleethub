const DEFAULT_UBER_SYNC_DAYS = 7;
const MAX_UBER_SYNC_DAYS = 28;

export function parseUberSyncDays(envValue?: string): number {
  const n = Number(envValue ?? process.env.UBER_SYNC_DAYS ?? DEFAULT_UBER_SYNC_DAYS);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_UBER_SYNC_DAYS;
  return Math.min(MAX_UBER_SYNC_DAYS, Math.round(n));
}

export function uberSyncRange(to: Date = new Date(), days?: number): { from: Date; to: Date } {
  const d = days ?? parseUberSyncDays();
  const end = new Date(Math.min(to.getTime(), Date.now()));
  const from = new Date(end.getTime() - d * 24 * 60 * 60 * 1000);
  return { from, to: end };
}
