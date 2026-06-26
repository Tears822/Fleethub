/**
 * Shared Uber sandbox flag: UBER_SANDBOX=true|false
 * (legacy alias: UBER_DRIVER_SANDBOX — same meaning for driver API only)
 */

export const UBER_API_PRODUCTION = "https://api.uber.com";
export const UBER_API_SANDBOX = "https://sandbox-api.uber.com";

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

/** Parse true/false from env (true, false, 1, 0, yes, no — case insensitive). */
export function parseEnvBoolean(
  raw: string | undefined,
  defaultValue = false,
): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const v = raw.toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return defaultValue;
}

/**
 * Primary flag: UBER_SANDBOX=true|false
 * Falls back to UBER_DRIVER_SANDBOX if UBER_SANDBOX is unset (backward compatible).
 */
export function isUberSandboxEnabled(): boolean {
  const primary = pick("UBER_SANDBOX");
  if (primary !== undefined) {
    return parseEnvBoolean(primary, false);
  }
  const legacy = pick("UBER_DRIVER_SANDBOX");
  if (legacy !== undefined) {
    return parseEnvBoolean(legacy, false);
  }
  return false;
}

/**
 * API host for Uber HTTP calls.
 * When UBER_SANDBOX=true, always uses sandbox-api.uber.com (ignores UBER_API_BASE_URL).
 * When false, uses UBER_API_BASE_URL or production default.
 */
export function resolveUberApiBaseUrl(explicit?: string): string {
  if (isUberSandboxEnabled()) {
    return UBER_API_SANDBOX;
  }
  return explicit?.replace(/\/$/, "") ?? UBER_API_PRODUCTION;
}
