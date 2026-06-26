import { fetchClientCredentialsTokenBasicAuth } from "./oauth-client-credentials.js";
import { freenowEnv } from "./freenow-env.js";

export type FreenowTokenMeta = {
  accessToken: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
};

type TokenJson = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

let cached: { token: string; expiresAtMs: number; scope?: string } | null = null;

async function fetchKeycloakToken(env: ReturnType<typeof freenowEnv>): Promise<
  | { ok: true; meta: FreenowTokenMeta; expiresAtMs: number }
  | { ok: false; message: string }
> {
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.clientId!,
      client_secret: env.clientSecret!,
    });
    const res = await fetch(env.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 400)}` };
    }
    const json = JSON.parse(text) as TokenJson;
    const accessToken = json.access_token;
    if (!accessToken) {
      return { ok: false, message: "Token JSON missing access_token" };
    }
    const expiresIn =
      typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
        ? json.expires_in
        : 1800;
    return {
      ok: true,
      meta: {
        accessToken,
        expiresIn,
        scope: json.scope,
        tokenType: json.token_type,
      },
      expiresAtMs: Date.now() + expiresIn * 1000,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function getFreenowAccessToken(forceRefresh = false): Promise<
  | { ok: true; meta: FreenowTokenMeta }
  | { ok: false; message: string }
> {
  const env = freenowEnv();
  if (!env.clientId || !env.clientSecret) {
    return { ok: false, message: "Missing FREENOW_CLIENT_ID / FREENOW_CLIENT_SECRET" };
  }

  if (!forceRefresh && cached && cached.expiresAtMs > Date.now() + 60_000) {
    return {
      ok: true,
      meta: { accessToken: cached.token, scope: cached.scope },
    };
  }

  if (env.authMode === "keycloak") {
    const keycloak = await fetchKeycloakToken(env);
    if (!keycloak.ok) {
      return keycloak;
    }
    cached = {
      token: keycloak.meta.accessToken,
      expiresAtMs: keycloak.expiresAtMs,
      scope: keycloak.meta.scope,
    };
    return { ok: true, meta: keycloak.meta };
  }

  const basic = await fetchClientCredentialsTokenBasicAuth({
    tokenUrl: env.tokenUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  });
  if (!basic.ok) {
    return { ok: false, message: basic.message };
  }
  const expiresAtMs = Date.now() + 3600 * 1000;
  cached = { token: basic.accessToken, expiresAtMs };
  return {
    ok: true,
    meta: { accessToken: basic.accessToken, expiresIn: 3600 },
  };
}

export function clearFreenowTokenCache(): void {
  cached = null;
}
