import type { PlatformSyncTrigger } from "./sync-trigger";

/** PROPUESTA §6 — canal que escribió el viaje (extensible a webhook / reconcile). */
export type TripIngestSource =
  | "webhook"
  | "poll_manual"
  | "poll_fallback"
  | "reconcile";

export type SyncRunCursorHint = {
  trigger?: PlatformSyncTrigger;
  ingestSource?: TripIngestSource;
  tripsUpserted?: number;
  tripsCreated?: number;
  tripsUpdated?: number;
  /** Mismo externalTripId re-ingestado por otro canal. */
  ingestCollisions?: number;
  /** Uber: viajes en ventana con bruto/neto > 0. */
  tripsWithAmounts?: number;
  /** Uber: viajes en ventana sin importes económicos. */
  tripsMissingAmounts?: number;
  /** Uber: false cuando quedan viajes sin importes (sync PARTIAL). */
  paymentsComplete?: boolean;
};

const INGEST_SOURCES: TripIngestSource[] = [
  "webhook",
  "poll_manual",
  "poll_fallback",
  "reconcile",
];

export function ingestSourceFromSyncTrigger(trigger: PlatformSyncTrigger): TripIngestSource {
  return trigger === "poll" ? "poll_fallback" : "poll_manual";
}

export function parseTripIngestSource(raw: unknown): TripIngestSource | null {
  if (typeof raw !== "string") return null;
  return INGEST_SOURCES.includes(raw as TripIngestSource) ? (raw as TripIngestSource) : null;
}

export function parseSyncRunCursorHint(cursorHint: unknown): SyncRunCursorHint {
  if (!cursorHint || typeof cursorHint !== "object") return {};
  const o = cursorHint as Record<string, unknown>;
  const trigger = o.trigger === "poll" ? "poll" : o.trigger === "manual" ? "manual" : undefined;
  const ingestSource =
    parseTripIngestSource(o.ingestSource) ??
    (trigger ? ingestSourceFromSyncTrigger(trigger) : undefined);
  return {
    trigger,
    ingestSource,
    tripsUpserted: typeof o.tripsUpserted === "number" ? o.tripsUpserted : undefined,
    tripsCreated: typeof o.tripsCreated === "number" ? o.tripsCreated : undefined,
    tripsUpdated: typeof o.tripsUpdated === "number" ? o.tripsUpdated : undefined,
    ingestCollisions:
      typeof o.ingestCollisions === "number" ? o.ingestCollisions : undefined,
    tripsWithAmounts:
      typeof o.tripsWithAmounts === "number" ? o.tripsWithAmounts : undefined,
    tripsMissingAmounts:
      typeof o.tripsMissingAmounts === "number" ? o.tripsMissingAmounts : undefined,
    paymentsComplete:
      typeof o.paymentsComplete === "boolean" ? o.paymentsComplete : undefined,
  };
}

export function syncRunPaymentsComplete(hint: SyncRunCursorHint): boolean {
  if (hint.paymentsComplete === false) return false;
  if (typeof hint.tripsMissingAmounts === "number" && hint.tripsMissingAmounts > 0) {
    return false;
  }
  return true;
}

export function ingestSourceLabel(
  source: TripIngestSource | string | null | undefined,
): string {
  const normalized =
    typeof source === "string" ? (parseTripIngestSource(source) ?? source) : source;
  switch (normalized) {
    case "webhook":
      return "Webhook";
    case "poll_manual":
      return "Poll manual";
    case "poll_fallback":
      return "Poll automático";
    case "reconcile":
      return "Reconciliación";
    default:
      return "—";
  }
}

export function formatSyncRunIngestDetail(hint: SyncRunCursorHint): string | null {
  const parts: string[] = [];
  if (hint.ingestSource) {
    parts.push(ingestSourceLabel(hint.ingestSource));
  }
  if (typeof hint.tripsUpserted === "number") {
    parts.push(`${hint.tripsUpserted} viaje(s)`);
  }
  if (typeof hint.ingestCollisions === "number" && hint.ingestCollisions > 0) {
    parts.push(`${hint.ingestCollisions} colisión(es)`);
  }
  if (hint.paymentsComplete === false && typeof hint.tripsMissingAmounts === "number") {
    parts.push(`${hint.tripsMissingAmounts} sin importes`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function syncRunPaymentsPendingMessage(hint: SyncRunCursorHint): string | null {
  if (syncRunPaymentsComplete(hint)) return null;
  const missing = hint.tripsMissingAmounts ?? 0;
  if (missing <= 0) return null;
  return `Viajes actualizados; ${missing} sin importes (Uber aún no los ha publicado o límite de API). Reintento automático en ~5 min.`;
}
