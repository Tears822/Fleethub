export type DriverConnectionState = "online" | "offline" | "unknown";

export type DriverConnectionMetadata = {
  connectionState?: DriverConnectionState;
  connectionCheckedAt?: string;
  connectionSource?: "uber_api" | "trip_activity";
};

export function parseDriverConnectionMetadata(
  metadata: unknown,
): DriverConnectionMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const o = metadata as Record<string, unknown>;
  const state = o.connectionState;
  const connectionState =
    state === "online" || state === "offline" || state === "unknown" ? state : undefined;
  const connectionCheckedAt =
    typeof o.connectionCheckedAt === "string" ? o.connectionCheckedAt : undefined;
  const source = o.connectionSource;
  const connectionSource =
    source === "uber_api" || source === "trip_activity" ? source : undefined;
  return { connectionState, connectionCheckedAt, connectionSource };
}

export function mergeDriverConnectionMetadata(
  existing: unknown,
  patch: DriverConnectionMetadata,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  return { ...base, ...patch };
}

export function connectionMetadataIsFresh(
  metadata: DriverConnectionMetadata,
  maxAgeMs: number,
): boolean {
  if (!metadata.connectionCheckedAt) return false;
  const t = Date.parse(metadata.connectionCheckedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

export function classifyUberDriverStatus(status: string | undefined): DriverConnectionState {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (
    s.includes("online") ||
    s.includes("active") ||
    s.includes("available") ||
    s.includes("on_trip") ||
    s.includes("on trip") ||
    s.includes("waiting") ||
    s.includes("enroute") ||
    s.includes("dispatch")
  ) {
    return "online";
  }
  if (s.includes("offline") || s.includes("inactive") || s.includes("waitlist")) {
    return "offline";
  }
  return "unknown";
}
