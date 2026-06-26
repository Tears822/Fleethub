import { getFleetHubServerUrl } from "@/shared/config/public-env";

/**
 * URL for `fetch` to the FleetHub API (login, logout, …).
 *
 * **Browser:** same-origin path `/api/...` — Next rewrites to `NEXT_PUBLIC_SERVER_URL` (see `next.config.ts`).
 * **Server:** absolute URL built from `NEXT_PUBLIC_SERVER_URL` (same value as rewrite target).
 */
export function buildApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    return normalized;
  }
  const base = getFleetHubServerUrl();
  return `${base}${normalized}`;
}

/**
 * URL for browser `fetch` — always same-origin `/api/...` (Next rewrites to the API).
 * Strips absolute URLs baked in during SSR (avoids CORS to :4000).
 */
export function resolveApiFetchUrl(urlOrPath: string): string {
  if (typeof window !== "undefined") {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        return new URL(urlOrPath).pathname;
      } catch {
        return urlOrPath;
      }
    }
    return buildApiUrl(urlOrPath);
  }
  return urlOrPath;
}
