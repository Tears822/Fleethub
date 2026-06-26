import type { DriverConnectionMetadata } from "@fleethub/auth";
import {
  connectionMetadataIsFresh,
  parseDriverConnectionMetadata,
} from "@fleethub/auth/driver-connection-metadata";
import type { RidePlatform } from "@fleethub/db";
import type { ConnectionDot } from "@/features/drivers/lib/driver-connection-labels";

export const CONNECTION_FRESH_MS = 5 * 60 * 1000;

export type { ConnectionDot } from "@/features/drivers/lib/driver-connection-labels";
export { connectionDotLabel } from "@/features/drivers/lib/driver-connection-labels";

export function resolveConnectionDot(args: {
  viajesHoy: number;
  platform: RidePlatform;
  turnoAbierto: boolean;
  metadata: unknown;
}): ConnectionDot {
  const meta = parseDriverConnectionMetadata(args.metadata);
  if (connectionMetadataIsFresh(meta, CONNECTION_FRESH_MS)) {
    if (meta.connectionState === "online") return "online";
    if (meta.connectionState === "offline") return "offline";
  }
  if (args.turnoAbierto) return "online";
  if (args.viajesHoy > 0) return "offline";
  return "unknown";
}

export function formatConnectionCheckedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(t).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export type { DriverConnectionMetadata };
