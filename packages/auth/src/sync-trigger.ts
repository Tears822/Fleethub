export type PlatformSyncTrigger = "manual" | "poll";

export function parseSyncTrigger(cursorHint: unknown): PlatformSyncTrigger {
  if (!cursorHint || typeof cursorHint !== "object") return "manual";
  const t = (cursorHint as { trigger?: unknown }).trigger;
  return t === "poll" ? "poll" : "manual";
}

export function syncTriggerLabel(trigger: PlatformSyncTrigger): string {
  return trigger === "poll" ? "Automático" : "Manual";
}
