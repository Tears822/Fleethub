import { isUberSandboxEnabled, resolveUberApiBaseUrl } from "./uber-sandbox.js";

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

/** Driver API scopes (authorization_code — not fleet client_credentials). */
export const UBER_DRIVER_DEFAULT_SCOPES = [
  "partner.accounts",
  "partner.trips",
  "partner.payments",
].join(" ");

export function uberDriverEnv() {
  const sandbox = isUberSandboxEnabled();

  return {
    sandbox,
    apiBaseUrl: resolveUberApiBaseUrl(
      pick("UBER_DRIVER_API_BASE_URL") ?? pick("UBER_API_BASE_URL"),
    ),
    accessToken: pick("UBER_DRIVER_ACCESS_TOKEN"),
    clientId: pick("UBER_CLIENT_ID") ?? pick("UBER_DRIVER_CLIENT_ID"),
    clientSecret: pick("UBER_CLIENT_SECRET") ?? pick("UBER_DRIVER_CLIENT_SECRET"),
    redirectUri: pick("UBER_DRIVER_REDIRECT_URI"),
    tokenUrl: pick("UBER_TOKEN_URL") ?? "https://auth.uber.com/oauth/v2/token",
    authorizeUrl: pick("UBER_AUTHORIZE_URL") ?? "https://auth.uber.com/oauth/v2/authorize",
    scope: pick("UBER_DRIVER_OAUTH_SCOPE") ?? UBER_DRIVER_DEFAULT_SCOPES,
    authCode: pick("UBER_DRIVER_AUTH_CODE"),
    refreshToken: pick("UBER_DRIVER_REFRESH_TOKEN"),
  };
}

export function buildUberDriverAuthorizeUrl(): string | null {
  const env = uberDriverEnv();
  if (!env.clientId || !env.redirectUri) return null;
  const params = new URLSearchParams({
    client_id: env.clientId,
    response_type: "code",
    redirect_uri: env.redirectUri,
    scope: env.scope,
  });
  return `${env.authorizeUrl}?${params.toString()}`;
}
