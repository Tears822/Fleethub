/**
 * Optional Uber / FreeNow credentials for Hito 3 connectors (see repo `.env.example`).
 * Per-driver OAuth tokens belong in `driver_platform_accounts`, not here.
 */

import { uberFleetEnv } from "../lib/uber-fleet-env.js";

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export type PlatformEnvCheck = {
  configured: boolean;
  /** Env keys that are empty (safe to log). */
  missing: string[];
};

export type IntegrationEnvSnapshot = {
  uber: PlatformEnvCheck;
  freenow: PlatformEnvCheck;
};

const UBER_REQUIRED = ["UBER_CLIENT_ID", "UBER_CLIENT_SECRET"] as const;
const FREENOW_REQUIRED = ["FREENOW_CLIENT_ID", "FREENOW_CLIENT_SECRET"] as const;

function checkGroup(keys: readonly string[]): PlatformEnvCheck {
  const missing: string[] = [];
  for (const k of keys) {
    if (!pick(k)) {
      missing.push(k);
    }
  }
  return { configured: missing.length === 0, missing };
}

export function getIntegrationEnvSnapshot(): IntegrationEnvSnapshot {
  return {
    uber: checkGroup(UBER_REQUIRED),
    freenow: checkGroup(FREENOW_REQUIRED),
  };
}

export function logIntegrationEnvSummary(): void {
  const s = getIntegrationEnvSnapshot();
  const fmt = (p: PlatformEnvCheck) =>
    p.configured ? "ready (app credentials set)" : `not configured — set ${p.missing.join(", ")}`;
  console.log("[worker] Uber:", fmt(s.uber));
  if (s.uber.configured) {
    const env = uberFleetEnv();
    console.log(
      `[worker] Uber API: ${env.sandbox ? "SANDBOX" : "production"} (${env.apiBaseUrl})`,
    );
    if (env.sandbox) {
      console.warn(
        "[worker] UBER_SANDBOX=true — sandbox host active. Trip/report sync may be empty; vehicle + analytics APIs return test data. Use false for real fleet sync.",
      );
    }
  }
  console.log("[worker] FreeNow:", fmt(s.freenow));
}
