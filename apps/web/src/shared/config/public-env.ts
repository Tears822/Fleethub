/**
 * Public environment (NEXT_PUBLIC_*). Safe for client and server bundles.
 * @see UI_Refrence/vision-ui-dashboard-react — visual reference only; no runtime dependency.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Canonical public origin of the web app (https in production).
 * Used for metadata and absolute links.
 */
export function getPublicAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (raw && raw.trim().length > 0) {
    return stripTrailingSlash(raw.trim());
  }
  return "http://localhost:3000";
}

const SERVER_ENV = "NEXT_PUBLIC_SERVER_URL";

/**
 * Base URL of the FleetHub HTTP API (`@fleethub/server`), no trailing slash.
 * **Required** — the Next app proxies browser `/api/*` to this origin (`next.config.ts` rewrites).
 */
export function getFleetHubServerUrl(): string {
  const raw = process.env[SERVER_ENV];
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      `${SERVER_ENV} is required (e.g. http://127.0.0.1:4000 in dev, or your public API URL in prod). ` +
        "Start the API with `npm run dev` from the repo root, or `npm run dev -w @fleethub/server`. " +
        "See apps/web/.env.example."
    );
  }
  return stripTrailingSlash(raw.trim());
}

/**
 * Same as {@link getFleetHubServerUrl} — kept for call sites that referred to “API base”.
 * @deprecated Prefer `getFleetHubServerUrl` for clarity.
 */
export function getPublicApiBaseUrl(): string {
  return getFleetHubServerUrl();
}
