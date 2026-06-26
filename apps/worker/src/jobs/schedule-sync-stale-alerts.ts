import { runOperationalDigestsForAllTenants } from "@fleethub/auth";

const DEFAULT_TICK_MS = 5 * 60_000;

function enabled(): boolean {
  const v =
    process.env.FLEET_OPERATIONAL_EMAIL_ENABLED?.trim().toLowerCase() ??
    process.env.FLEET_SYNC_STALE_EMAIL_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function tickMs(): number {
  const n = Number(
    process.env.FLEET_OPERATIONAL_EMAIL_TICK_MS ??
      process.env.FLEET_SYNC_STALE_EMAIL_TICK_MS,
  );
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_TICK_MS;
}

/**
 * Email admins/gestors when operational alerts fire:
 * pending shifts, productivity, sync stale/failed (tenant notification prefs).
 */
export function scheduleSyncStaleEmailAlerts(): void {
  if (!enabled()) {
    console.log(
      "[worker] Operational email alerts disabled (set FLEET_OPERATIONAL_EMAIL_ENABLED=1).",
    );
    return;
  }

  const intervalMs = tickMs();
  console.log(
    `[worker] Operational email digest every ${intervalMs / 1000}s (pending + productivity + sync; cooldown via OPERATIONAL_EMAIL_COOLDOWN_HOURS).`,
  );

  const run = async () => {
    try {
      const { tenants, emailed } = await runOperationalDigestsForAllTenants();
      if (emailed > 0) {
        console.log(
          `[worker] operational digest: ${emailed}/${tenants} tenant(s) emailed.`,
        );
      }
    } catch (err) {
      console.error("[worker] operational email error:", err);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
}
