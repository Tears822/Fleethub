/**
 * Sync driver platform data before shift liquidation preview (short window, platform-scoped).
 */
import { RidePlatform } from "@fleethub/db";
import { runLiquidationDriverSync } from "@fleethub/worker/sync";

const DEFAULT_SYNC_TIMEOUT_MS = 25_000;

export type LiquidationSyncOptions = {
  /** Only sync this platform (e.g. FREENOW when closing FreeNow turno). */
  platform?: RidePlatform;
  /** Abort sync after this many ms and continue with preview. */
  timeoutMs?: number;
  /** Skip sync when closing a historical franja (trips already ingested). */
  skip?: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("liquidation sync timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Skip on-demand sync when closing trips that ended before yesterday (poll already ingested). */
export function shouldSkipLiquidationSync(body: {
  timeTo?: unknown;
}): boolean {
  const raw = typeof body.timeTo === "string" ? body.timeTo.trim() : "";
  if (!raw) return false;
  const end = new Date(raw);
  if (Number.isNaN(end.getTime())) return false;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return end.getTime() < yesterday.getTime();
}

function parsePlatform(raw: unknown): RidePlatform | undefined {
  if (raw === RidePlatform.UBER || raw === "UBER") return RidePlatform.UBER;
  if (raw === RidePlatform.FREENOW || raw === "FREENOW") return RidePlatform.FREENOW;
  return undefined;
}

export async function syncDriverPlatformsBeforeLiquidation(
  tenantId: string,
  driverId: string,
  body?: { platform?: unknown; timeTo?: unknown },
  options?: LiquidationSyncOptions,
): Promise<{ ok: boolean; message?: string; skipped?: boolean }> {
  if (options?.skip || shouldSkipLiquidationSync(body ?? {})) {
    return { ok: true, skipped: true };
  }

  const platform = options?.platform ?? parsePlatform(body?.platform);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;

  try {
    const result = await withTimeout(
      runLiquidationDriverSync(tenantId, driverId, { platform }),
      timeoutMs,
    );
    if (!result.ok) {
      console.warn("[server] liquidation sync:", result.message ?? "failed");
      return { ok: true };
    }
    if (result.uberTripsUpserted > 0 || result.freenowTripsUpserted > 0) {
      console.log(
        `[server] liquidation sync driver=${driverId.slice(0, 8)}… platform=${platform ?? "all"} uber=${result.uberTripsUpserted} fn=${result.freenowTripsUpserted}`,
      );
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[server] liquidation sync skipped:", message);
    return { ok: true };
  }
}
