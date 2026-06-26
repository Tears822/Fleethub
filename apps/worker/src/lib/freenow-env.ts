/** FreeNow integration env — Fleet Owner (Keycloak) and/or Booking API gateway. */

const PRELIVE_BOOKING_API_BASE = "https://api.prelive.free-now.com/publicapigatewayservice";
const LIVE_BOOKING_API_BASE = "https://api.free-now.com/publicapigatewayservice";

/** Meta-Account / Fleet Owner supply API (Keycloak `fleet-owner` scope). */
const PRELIVE_META_API_BASE =
  "https://api.prelive.free-now.com/partnerpublicgatewayservice/api";
const LIVE_META_API_BASE =
  "https://api.live.free-now.com/partnerpublicgatewayservice/api";

const LIVE_KEYCLOAK_TOKEN_URL =
  "https://idp.live.free-now.com/keycloak/realms/company/protocol/openid-connect/token";
const PRELIVE_KEYCLOAK_TOKEN_URL =
  "https://idp.prelive.free-now.com/keycloak/realms/company/protocol/openid-connect/token";

export type FreenowAuthMode = "keycloak" | "booking";

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function parsePreliveFlag(): boolean | undefined {
  const raw = pick("FREENOW_PRELIVE");
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

export function resolveFreenowAuthMode(): FreenowAuthMode {
  const explicit = pick("FREENOW_AUTH_MODE")?.toLowerCase();
  if (explicit === "keycloak" || explicit === "company" || explicit === "fleet-owner") {
    return "keycloak";
  }
  if (explicit === "booking" || explicit === "gateway") {
    return "booking";
  }
  const tokenUrl = pick("FREENOW_TOKEN_URL");
  if (tokenUrl?.includes("keycloak") || tokenUrl?.includes("/idp.")) {
    return "keycloak";
  }
  const clientId = pick("FREENOW_CLIENT_ID");
  if (clientId?.startsWith("fleetowner-")) {
    return "keycloak";
  }
  return "booking";
}

export function isFreenowPrelive(): boolean {
  const explicit = parsePreliveFlag();
  if (explicit !== undefined) return explicit;

  const tokenUrl = pick("FREENOW_TOKEN_URL");
  if (tokenUrl?.includes("idp.prelive.")) return true;
  if (tokenUrl?.includes("idp.live.")) return false;

  const authMode = resolveFreenowAuthMode();
  if (authMode === "keycloak") {
    return false;
  }

  const base = pick("FREENOW_API_BASE_URL");
  if (base?.includes("api.prelive.")) return true;
  if (base?.includes("api.live.") || (base?.includes("api.free-now.com") && !base.includes("prelive"))) {
    return false;
  }
  return true;
}

export function resolveFreenowApiBaseUrl(override?: string): string {
  const trimmed = override?.replace(/\/$/, "");
  if (trimmed) return trimmed;
  if (resolveFreenowAuthMode() === "keycloak") {
    return isFreenowPrelive() ? PRELIVE_META_API_BASE : LIVE_META_API_BASE;
  }
  return isFreenowPrelive() ? PRELIVE_BOOKING_API_BASE : LIVE_BOOKING_API_BASE;
}

export function resolveFreenowTokenUrl(): string {
  const override = pick("FREENOW_TOKEN_URL");
  if (override) return override;

  if (resolveFreenowAuthMode() === "keycloak") {
    return isFreenowPrelive() ? PRELIVE_KEYCLOAK_TOKEN_URL : LIVE_KEYCLOAK_TOKEN_URL;
  }

  const apiBase = resolveFreenowApiBaseUrl(pick("FREENOW_API_BASE_URL"));
  return `${apiBase.replace(/\/$/, "")}/v1/oauth/token`;
}

export function freenowEnv() {
  const authMode = resolveFreenowAuthMode();
  const prelive = isFreenowPrelive();
  const apiBaseUrl = resolveFreenowApiBaseUrl(pick("FREENOW_API_BASE_URL"));
  return {
    authMode,
    prelive,
    clientId: pick("FREENOW_CLIENT_ID"),
    clientSecret: pick("FREENOW_CLIENT_SECRET"),
    apiBaseUrl,
    tokenUrl: resolveFreenowTokenUrl(),
  };
}

export function freenowEnvReady(): { ok: true } | { ok: false; missing: string[] } {
  const env = freenowEnv();
  const missing: string[] = [];
  if (!env.clientId) missing.push("FREENOW_CLIENT_ID");
  if (!env.clientSecret) missing.push("FREENOW_CLIENT_SECRET");
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}
