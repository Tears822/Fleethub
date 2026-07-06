export type PlatformSyncTrigger = "manual" | "poll" | "liquidation";

export function parseSyncTrigger(cursorHint: unknown): PlatformSyncTrigger {
  if (!cursorHint || typeof cursorHint !== "object") return "manual";
  const t = (cursorHint as { trigger?: unknown }).trigger;
  if (t === "poll") return "poll";
  if (t === "liquidation") return "liquidation";
  return "manual";
}

export function syncTriggerLabel(trigger: PlatformSyncTrigger): string {
  if (trigger === "poll") return "Automático";
  if (trigger === "liquidation") return "Liquidación";
  return "Manual";
}
